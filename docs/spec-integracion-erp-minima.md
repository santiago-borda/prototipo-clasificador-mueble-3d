# Spec — Integración con el ERP de Casa Mueble según el contrato UCP v1 (pre-entrega 25/11)

Versión 0.3 · 20/11/2026 · Estado: **propuesta, a aprobar por el equipo**
Reemplaza a `claude/spec-integracion-erp-minima-v0.2.md`. Fuente: contrato y guía que mandó Casa Mueble el 20/11 (`casa-mueble/contrato-ucp-v1.md` y `casa-mueble/guia-autenticacion-qa.md`). En esos documentos, "UCP" es este sistema.
Rama: `erp-integracion-minima`, desde `fable/s2-base-de-datos`. **Primero `git merge fable/s2-base-de-datos`.**

> El contrato manda: es la interfaz que define el ERP como anfitrión. Lo que no define se marca **ASUMIDO**.

## 0. Cambios respecto de la v0.2
| v0.2 | v0.3 (contrato) |
|---|---|
| El token se valida llamando a `whoami` | Se valida **localmente** con el JWKS del Auth del ERP (RS256, `iss`, `exp`, sin audiencia) |
| Se guarda el token del ERP cifrado en la sesión | **Prohibido** por el contrato (§1). La sesión guarda solo `sub` y `tenant_id` |
| Este sistema lee proyectos y Documentos de la API del ERP | **Se invierte:** el ERP **envía** el trabajo a `POST /api/trabajos` con URLs firmadas del zip y del CSV. No hay rutas de lectura que relevar |
| Mensajes `pfg:*`, renovación pedida por el iframe | Mensajes `ucp:listo`, `erp:sesion`, `erp:token` (el ERP empuja cada renovación), `ucp:alto`, `ucp:navegar` |
| Ruta `/embebido?proyecto=<erpId>` | Ruta `/erp/proyectos/{proyectoUuid}` |
| Sin login con contraseña | Login directo desde el servidor **solo para desarrollo** (lo propone la guía) |
| — | Nuevo: `GET /api/trabajos/{uuid}`, tema claro/oscuro, alto del iframe, webhook firmado con HMAC |

Se mantienen la sesión propia con cookie, el tenant tomado del token, la política de framing, el zip validado, el modo simulado y la guía de seguridad de logs.

## 1. Objetivo
1. El ERP envía un proyecto a este sistema (modelo 3D y CSV de piezas), que lo descarga, lo verifica y lo guarda.
2. Desde la página de ese proyecto en el ERP, el usuario ve este sistema embebido, sin iniciar sesión de nuevo, con el estado del trabajo y el visor del modelo.

## 2. Alcance por prioridad
- **P1 (pre-entrega 25/11):** validación del token (IE-1), sesión (IE-2), protocolo del iframe (IE-3, IE-4), pantalla embebida (IE-5), framing (IE-6), `POST` y `GET /api/trabajos` (IE-7, IE-8), modelo de datos y almacenamiento (IE-9, IE-10), login de desarrollo (IE-11), variables (IE-12), simulado (IE-13), logs (IE-15).
- **P2 (después del 25/11, ASUMIDO):** webhook (IE-14). El contrato define `GET /api/trabajos/{uuid}` como respaldo cuando no llega el webhook, así que el ERP funciona sin él. Se confirma en la consulta 8.
- **Fuera:** procesar el CSV (lo hace el importador CSV, con spec propia pendiente); microfrontend por Module Federation; escribir en el ERP salvo el webhook; permisos propios (el ERP solo muestra la integración a quien tiene `tenant.ucp.usar`).

## 3. Datos de QA (guía del 20/11)
| Qué | Valor |
|---|---|
| Login (solo desarrollo) | `POST {ERP_API_URL}/api/session/login`, cuerpo `{email | nombreUsuario, password}`, token en `data.accessToken` |
| Issuer | `https://erp-auth-api-qa.casamueble.com.ar/` (con barra final) |
| JWKS | `{ERP_ISSUER}.well-known/jwks` |
| Token | JWT RS256, 15 min, sin refresh token |
| Claims | `sub` (usuario), `tenant_id` (carpintería). No trae nombre ni permisos |
| Carpintería de pruebas | `A1C0E001-0000-4000-8000-000000000002` |
| CORS | La API del ERP solo acepta navegadores del dominio del ERP: toda llamada al ERP sale de nuestro servidor |

## 4. Requisitos
- **IE-1. Validación del token** (`src/server/erp/token.ts`): firma RS256 con el JWKS de `ERP_ISSUER` (claves en caché; se vuelven a pedir solo ante un `kid` desconocido, como máximo una vez cada 30 s); `iss` exacto; `exp` y `nbf` con 30 s de tolerancia; **sin** validar audiencia; solo `RS256` (rechaza `none` y HS*). Devuelve `{erpUsuario: sub, erpTenant: tenant_id}`; si falta alguno, lanza `TokenErpInvalido`. Errores con nombre: `TokenErpInvalido`, `TokenErpVencido`, `JwksNoDisponible`.
- **IE-2. Sesión propia:** migración `0002` con la tabla `sesion`: `id` (sha256 del token de sesión), `tenant_id`, `erp_usuario_id`, `erp_tenant_id`, `vence` (= `exp` del token), `revocada`. **No guarda el token del ERP.** Cookie `httpOnly`, `Secure`, `SameSite=Lax`, que vence con el token. `POST /api/erp/sesion` (acepta solo `Origin` propio) recibe `{accessToken}`, lo valida con IE-1 y crea la sesión. `POST /api/erp/sesion/renovar` exige sesión vigente con el mismo `sub` y `tenant_id`; si no coinciden, revoca. Sin `DATABASE_URL`, implementación en memoria.
- **IE-3. Protocolo de mensajes** (`src/lib/erp/protocolo.ts`, funciones puras), con campo `version: 1`:
  | Dirección | `tipo` | Qué hace este sistema |
  |---|---|---|
  | UCP → ERP | `ucp:listo` | Lo envía al cargar |
  | ERP → UCP | `erp:sesion` | `accessToken`, `vence`, `tenantId`, `proyecto {uuid, codigo, nombre}`, `tema`. Crea la sesión (IE-2). Si `tenantId` difiere del `tenant_id` del token, o `proyecto.uuid` difiere del de la ruta, rechaza y muestra el error |
  | ERP → UCP | `erp:token` | `accessToken`, `vence`. Renueva la sesión |
  | UCP → ERP | `ucp:alto` | Alto del contenido en px, con `ResizeObserver`, como máximo uno cada 200 ms |
  | UCP → ERP | `ucp:navegar` | No se usa en v1 |
  Un mensaje se acepta solo si `event.origin === ERP_WEB_ORIGEN`, `event.source === window.parent` y cumple el esquema. Los envíos usan `ERP_WEB_ORIGEN` como `targetOrigin`, nunca `"*"`. El token vive solo en memoria el tiempo de enviarlo a nuestra API: nunca en URL, `localStorage` ni logs.
- **IE-4. Vencimiento:** si pasa `vence` + 60 s sin `erp:token`, la sesión se da por vencida y se muestra "La sesión venció. Volvé a abrir desde el ERP". No hay mensaje para pedir token: el contrato no lo define.
- **IE-5. Pantalla embebida** `/erp/proyectos/{proyectoUuid}`: busca el último trabajo de ese proyecto en el tenant de la sesión y muestra el código y el nombre del proyecto, el estado y el visor con el modelo guardado. Si no hay trabajo: "Este proyecto todavía no se envió". Respeta `tema` (claro u oscuro). Funciona desde 360 px de ancho. Un proyecto de otro tenant da 404.
- **IE-6. Framing:** `/erp/*` responde `Content-Security-Policy: frame-ancestors <ERP_WEB_ORIGEN>`; el resto del sitio, `frame-ancestors 'none'`.
- **IE-7. `POST /api/trabajos`:**
  - `Authorization: Bearer` validado con IE-1. El tenant sale del token, nunca del cuerpo.
  - Cuerpo validado con esquema (`version: 1`, `envioUuid`, `proyecto`, `modelo`, `csv`).
  - **Idempotencia:** `(tenant, envioUuid)` único. Si ya existe, responde 200 con el mismo `trabajoUuid` sin volver a descargar; si es nuevo, 201.
  - **Descarga:** solo `https` y hosts de `ERP_BLOB_ORIGENES` (evita SSRF), con tamaño máximo y timeout. Descarga al recibir el pedido, porque las URLs vencen a los 15 min. Verifica el `sha256` de los dos archivos. El zip debe contener un `.dae` y no tener rutas con `..`.
  - Guarda los archivos (IE-10), el proyecto y el trabajo con `estado: "recibido"`. Responde `{trabajoUuid, estado}`.
  - Errores: 400 con el esquema inválido, 401 con token inválido, 422 si el sha256 no coincide o el zip es inválido (con un mensaje legible para el usuario del ERP), 503 si falla la descarga (el contrato lo trata como reintentable).
  - **Minimización (decisión del equipo, ASUMIDO):** no se guarda `proyecto.cliente`, porque es un dato de un tercero que el sistema no usa.
- **IE-8. `GET /api/trabajos/{trabajoUuid}`:** con el mismo Bearer; devuelve `{trabajoUuid, envioUuid, estado, mensaje, actualizadoEn}`. Un trabajo de otro tenant da 404.
- **IE-9. Modelo de datos (migración `0002`):** `proyecto` suma `erp_proyecto_uuid` (único por tenant), `erp_codigo` y `fecha_entrega`. Tabla nueva `trabajo`: `uuid`, `tenant_id`, `envio_uuid` (único por tenant), `proyecto_id`, `estado`, `mensaje`, `modelo_sha256`, `modelo_version`, `csv_sha256`, `csv_version`, `creado`, `actualizado`. `tenant` suma `erp_tenant_id` único: si llega un `tenant_id` nuevo, se crea el tenant. Toda consulta filtra por tenant.
- **IE-10. Almacenamiento:** interfaz `Almacen` (`guardar`, `leer`, por sha256). Implementación inicial en la base, con tamaño máximo configurable. ASUMIDO y reversible: se reemplaza cuando se decida dónde van los archivos (S3).
- **IE-11. Login de desarrollo** (`/ingresar`, guía §1): habilitado solo con `ERP_LOGIN_DIRECTO=habilitado`; con `NODE_ENV=production`, error al arrancar. El login lo hace el servidor; después crea la sesión igual que IE-2. La contraseña no se guarda ni se registra.
- **IE-12. Variables de entorno** (la URL de la API cambia entre QA y producción, como pidió Casa Mueble): `ERP_API_URL`, `ERP_ISSUER`, `ERP_WEB_ORIGEN`, `ERP_BLOB_ORIGENES`, `ERP_LOGIN_DIRECTO`, `ERP_MODO`. Se validan al arrancar: URLs `https` en producción, `ERP_ISSUER` con barra final, sin comodines. `.env.example` lista los nombres con los valores de QA, que no son secretos. Las credenciales de las invitaciones de QA van solo al `.env.local` de cada uno y nunca al repo ni al chat.
- **IE-13. Simulado:** con `ERP_MODO=simulado` (prohibido en producción), un servidor `node:http` sin dependencias nuevas que: firma tokens RS256 con una clave generada en la prueba (`node:crypto`) y sirve su JWKS; sirve el zip del Olmo y un CSV con sha256 conocido; ofrece `GET /anfitrion?proyecto=<uuid>`, que hace de ERP según el §5 del contrato (envía `erp:sesion`, renueva con `erp:token`, tiene botones para vencer el token y para mandar un tenant distinto) y un botón "Enviar a UCP" que llama a `POST /api/trabajos`. Cuando llegue `host-erp.html` de Casa Mueble, también se prueba con ese.
- **IE-14. Webhook (P2):** configuración por tenant (URL y secreto, el secreto cifrado con AES-256-GCM y `SESION_CLAVE`). Envía `trabajo.listo` o `trabajo.error` con `X-Ucp-Timestamp` y `X-Ucp-Firma = hex(HMAC-SHA256(secreto, "<timestamp>.<cuerpo crudo>"))`. Reintenta con backoff ante 5xx o timeout.
- **IE-15. Logs:** ningún log incluye tokens, contraseñas, cookies, cuerpos de mensajes ni la **query de las URLs firmadas** (`?sig=` es una credencial).

## 5. Dependencia nueva (parada U-dependencias, la decide el equipo)
Propuesta: **`jose`** para IE-1. Es la que usa la guía de Casa Mueble, no tiene dependencias propias y evita escribir a mano la verificación de firmas, que es código de seguridad.
Alternativa descartada salvo que el equipo la prefiera: verificar RS256 con `node:crypto` (`createPublicKey` con formato `jwk` y `crypto.verify`) más la caché del JWKS a mano. No suma dependencias, pero hay más código propio para probar.

## 6. Pruebas
| Id | Caso |
|---|---|
| TIE-1 | Token válido: devuelve `sub` y `tenant_id` |
| TIE-2 | Rechazados: vencido, firma alterada, otro issuer, `alg: none`, HS256, sin `tenant_id` |
| TIE-3 | `kid` desconocido: vuelve a pedir el JWKS una vez y valida |
| TIE-4 | Mensaje con origen ajeno, `source` distinto del padre o esquema inválido: descartado |
| TIE-5 | Los envíos nunca usan `"*"` |
| TIE-6 | `erp:sesion` con `tenantId` distinto del token, o con `proyecto.uuid` distinto de la ruta: rechazado |
| TIE-7 | `erp:sesion` válido: crea la sesión, cookie `httpOnly`, el token del ERP no queda guardado |
| TIE-8 | `erp:token` de otro usuario: sesión revocada |
| TIE-9 | Sin `erp:token` después del vencimiento: mensaje de sesión vencida |
| TIE-10 | `ucp:alto` se emite al cambiar el contenido, con límite de frecuencia |
| TIE-11 | Cabeceras: `/erp/*` con `frame-ancestors` del ERP; `/p/<qrId>` y el resto con `'none'` |
| TIE-12 | `POST /api/trabajos` válido: 201, archivos guardados, `estado: "recibido"` |
| TIE-13 | Mismo `envioUuid` dos veces: 200, mismo `trabajoUuid`, sin segunda descarga |
| TIE-14 | sha256 que no coincide, o zip sin `.dae` o con `..`: 422 legible |
| TIE-15 | URL fuera de `ERP_BLOB_ORIGENES` o `http`: 400, sin descargar |
| TIE-16 | El tenant del cuerpo o de la URL se ignora: manda el del token |
| TIE-17 | `GET /api/trabajos/{uuid}` de otro tenant: 404 |
| TIE-18 | Usuario del tenant A no ve proyectos del tenant B (con PB-6 a PB-8) |
| TIE-19 | Logs de un flujo completo sin tokens, contraseñas, cookies ni query de URLs firmadas |
| TIE-20 | `ERP_LOGIN_DIRECTO` o `ERP_MODO=simulado` con `NODE_ENV=production`: error al arrancar |
| TIE-21 | `/p/<qrId>` sigue accesible sin sesión (PB-15) |
| TIE-22 | Flujo completo con el anfitrión simulado: enviar el trabajo, abrir el iframe, ver el estado y el visor, renovar y vencer el token. Con Playwright si el repo ya lo tiene; si no, prueba manual con captura |

## 7. Paradas
- **U-dependencias:** `jose` (§5).
- **U-credenciales:** Santiago y Lautaro aceptan la invitación a la carpintería de pruebas y cargan su usuario en `.env.local`. La sesión de Claude Code no las pide, no las lee y no las imprime.
- **U-erp-real:** primera prueba contra QA con aprobación explícita: login de desarrollo y validación de un token real contra el JWKS de QA. Solo lectura.
- **U-erp-front:** que Casa Mueble cargue la URL de este sistema en el iframe y en "Enviar a UCP" de QA. Requiere este sistema desplegado con `https` (ver §9).

## 8. Criterio de cierre para la pre-entrega
- `typecheck`, `lint` y `npm test` en verde en un worktree limpio; TIE-1 a TIE-21 en verde y TIE-22 con evidencia.
- Contra QA: un token real validado con el JWKS (U-erp-real). Si hay despliegue y Casa Mueble apuntó su QA a este sistema: el flujo completo dentro del ERP, con captura. Si no, la demo se hace con el anfitrión simulado, **declarado como simulado**.
- `CLAUDE.md` describe el flujo, el protocolo y las variables de entorno.

## 9. Riesgos
- **Despliegue:** para U-erp-front hace falta este sistema publicado con `https`. La decisión pendiente de dónde corre la base de la demo pasa a bloquear esa prueba.
- **Cookie en el iframe:** si el ERP y este sistema no comparten el dominio `casamueble.com.ar`, la cookie es de terceros y el navegador la bloquea. Alternativa: `SameSite=None; Secure; Partitioned`, o mandar el token como Bearer en cada pedido del cliente. Se decide al conocer las URLs (consulta 2).
- **Importador CSV sin spec formal:** sin él, el trabajo queda en `recibido` y la pantalla muestra el visor sin el listado de piezas.
- **Cinco días hábiles:** si hay que recortar, primero IE-11 (alcanza con el simulado), después `ucp:alto` y el tema.

## 10. Consultas para Casa Mueble (Augusto)
1. El contrato describe este sistema como "Next.js + API + SQL Server". Usamos PostgreSQL (ADR-002). ¿SQL Server es un requisito de ustedes (por ejemplo, porque lo alojan ustedes) o fue una suposición?
2. URLs por entorno: el origen del frontend del ERP de QA (para `frame-ancestors` y para validar los mensajes), la URL donde esperan este sistema (¿`taller-test.casamueble.com.ar`?) y el host de las URLs firmadas del blob.
3. El `host-erp.html` que menciona la guía no vino adjunto: ¿nos lo pueden mandar?
4. ¿Qué significa `trabajo.listo`? ¿Que este sistema procesó el envío (piezas importadas y QR generados) o que el taller terminó el corte (el ejemplo dice "Corte terminado")?
5. ¿`piezas.csv` es el CSV que exporta OpenCutList tal cual, o lo genera el ERP? (relacionada con la consulta 58).
6. Si llega un envío con `modelo.version` o `csv.version` nuevas para un proyecto ya enviado, ¿es un trabajo nuevo que reemplaza al anterior? (impacta en los QR versionados e inmutables).
7. ¿`proyecto.codigo` (por ejemplo `P-0142`) se relaciona con el `0001` de los códigos de pieza? (pendiente: significado de "0001").
8. ¿El webhook es necesario para la pre-entrega del 25/11 o alcanza con `GET /api/trabajos/{uuid}`?

Quedan resueltas las consultas de la v0.2 sobre las rutas de lectura (no hacen falta: el ERP empuja), sobre si el token está disponible para el iframe (sí, `erp:sesion`) y sobre cómo validarlo (JWKS).

## 11. Precisiones de la implementación (20/11, **a revisar por el equipo**)
Implementada en `erp-integracion-minima` (commits locales, sin push). Donde esta spec y `casa-mueble/respuestas-20-11-contrato-ucp.md` difieren, mandan las respuestas.
- **IE-I1. Estados:** `pending | inProgress | success | failed` (`src/lib/erp/estados.ts`). Hoy solo se escriben `success` y `failed`. ASUMIDO: `success` = archivos recibidos, verificados (sha256 y zip con un .dae) y guardados.
- **IE-I2. Un envío que falla por algo permanente** (sha256 que no coincide, zip inválido, archivo más grande que el tope, URL que respondió 4xx) **queda como trabajo `failed`** con la causa en `mensaje`, y la respuesta es 422 con `{trabajoUuid, estado, error, mensaje}`. Así `GET /api/trabajos/{uuid}` y la pantalla muestran la causa. Repetir el mismo `envioUuid` devuelve el mismo 422 sin volver a descargar, por la idempotencia del contrato. Para reintentar después de arreglar el archivo, el ERP tiene que mandar otro `envioUuid`.
- **IE-I3. Fallas reintentables** (red, tiempo agotado o 5xx al descargar, JWKS caído): 503 y **no queda trabajo**, así que el reintento con el mismo `envioUuid` descarga de nuevo. Una URL vencida (403 del blob) no se considera reintentable: 422 con «Volvé a enviar el proyecto».
- **IE-I4. Nombres en la base:** se siguen las convenciones de 0001 (tablas en inglés): `session`, `job` (= `trabajo`) y `file_content` (= almacén). `project.erp_project_id` (de 0001) guarda `proyecto.uuid`; se suman `erp_code` y `delivery_date` (texto AAAA-MM-DD). La migración se llama `0002_integracion_erp` y reemplaza a `0002_sesion` (v0.2). Una base local que tenga aplicada `0002_sesion` hay que recrearla.
- **IE-I5. Protocolo:** `vence` en segundos epoch (como `exp`). Lector tolerante: las claves de más se ignoran. Sin `tema`, se usa claro. Los UUID se comparan y se guardan en minúsculas (la carpintería de QA viene en mayúsculas). Todo ASUMIDO hasta U-erp-front.
- **IE-I6. TIE-6 se verifica en dos lugares:** el iframe compara `proyecto.uuid` con la ruta. El servidor compara `tenantId` con el `tenant_id` del token: `POST /api/erp/sesion` recibe `{accessToken, tenantId}`.
- **IE-I7. Vigencia de la sesión:** en el servidor vale hasta `exp` + 60 s, la misma gracia de IE-4, y la cookie tiene ese `Max-Age`. Un `erp:token` que no valida (firma, vencido, otro usuario u otra carpintería) revoca la sesión. Si el JWKS no responde, la respuesta es 503 y la sesión no se revoca. Una recarga dentro del iframe crea otra sesión y revoca la anterior de la misma cookie.
- **IE-I8. Pantalla:** `/erp/proyectos/{uuid}` lee con la cookie desde el navegador, porque en la primera carga todavía no hay sesión. La página en sí responde 200. El 404 de otra carpintería lo da la API (`/api/erp/proyectos/{uuid}`), que responde igual para «de otra carpintería» que para «nunca se envió». Por eso la pantalla dice «Este proyecto todavía no se envió» en los dos casos y no revela nada de la otra carpintería. El visor está en `/erp/proyectos/{uuid}/visor`, con altos fijos en px: con `ucp:alto`, un alto en `vh` haría crecer el iframe sin fin.
- **IE-I9. Simulado:** con `ERP_MODO=simulado`, el issuer, el JWKS, el login y los blobs salen de `ERP_SIMULADO_URL`. Las URLs `http` de los blobs se aceptan solo en ese modo, y solo las de ese origen.
- **IE-I10. `SESION_CLAVE` ya no existe:** sin el token del ERP en la sesión no hay nada que cifrar. IE-14 (webhook) va a necesitar una clave para cifrar el secreto.
- **IE-I11. Rutas que no estaban en la spec:** `GET /api/erp/sesion` (si la cookie tiene sesión, para el login de desarrollo), `POST /api/erp/ingresar` (IE-11; un usuario con «@» va como `email`, si no, como `nombreUsuario`), `GET /api/erp/proyectos` y la página `/erp/proyectos` (lista para después del login de desarrollo), y `GET /api/erp/proyectos/{uuid}[/modelo]`.
- **IE-I12. `jose` 6.2.14** (exacta, publicada el 29/10). `cooldownDuration` de 30 s y `cacheMaxAge` infinito: el JWKS solo se vuelve a pedir ante un `kid` desconocido. Dentro de esos 30 s, un `kid` desconocido da 401.
- **IE-I13. Minimización:** `proyecto.cliente` no se lee. Del CSV solo se verifica el sha256 y el tamaño; queda guardado para el importador.
- **IE-I14. Nombre de una carpintería nueva:** «Carpintería del ERP <primeros 8 del UUID>», porque el token no trae el nombre.
- **Pendiente:** TIE-22 con captura en el navegador; la suite contra PostgreSQL (`TEST_DATABASE_URL`); U-erp-real; U-erp-front; IE-14.
