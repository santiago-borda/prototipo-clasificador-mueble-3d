# Spec — Integración mínima con el ERP de Casa Mueble (pre-entrega 25/11)

Versión 0.1 · 18/11/2026 · Estado: **propuesta, a aprobar por el equipo**
Origen: decisión del 18/11 (`claude/decisiones-18-11-integracion-erp.md`, decisión 1). Es un recorte de S4 (auth) y S5 (integración) de `claude/prompts-fable-sesiones.md`, que siguen vigentes para después.
Rama sugerida: `erp-integracion-minima`, desde `fable/s2-base-de-datos`.

> Escrita sin acceso al repositorio ni a la API real. Lo que sale del relevamiento de QA del 16/11 (hecho sin leer el código del servidor) está marcado **ASUMIDO** y se verifica en la parada U-erp-real.

## 1. Objetivo
El usuario inicia sesión en este sistema con su usuario del ERP. Después ve los proyectos de su carpintería (tenant), abre uno y ve sus muebles y sus Documentos, y puede bajar el modelo 3D (zip con .dae) para el visor.

## 2. Fuera de alcance
- Embebido en el ERP (iframe o similar).
- Escribir en el ERP.
- Roles: en la pre-entrega todo usuario autenticado tiene el mismo acceso. ASUMIDO, se anota como consulta.
- Contrato OpenAPI propio.
- Guardar los archivos del ERP en este sistema. Va a S3. Por ahora se leen al vuelo (ver IE-8).
- Usar el PDF de optimización del ERP como entrada: la entrada es el CSV de OpenCutList (decisión del 17/11).

## 3. Hechos relevados (QA, 16/11) y supuestos
| Tema | Relevado | ASUMIDO hasta U-erp-real |
|---|---|---|
| API | `https://erp-api-qa.casamueble.com.ar`, probablemente ASP.NET Core, sin OpenAPI | — |
| Login | `POST /api/session/login` | Cuerpo `{usuario, contraseña}`, devuelve un JWT de acceso y un refresh (en cookie o en el cuerpo) |
| Refresh | `POST /api/session/refresh` con `X-CSRF-Token` | El token CSRF viene en la respuesta del login o en una cookie legible |
| Identidad | `GET /api/session/whoami` | Devuelve el id de usuario, el nombre y el tenant activo |
| Tenants | `GET /api/session/tenants`, `POST /api/session/switch-tenant` | — |
| Auth | JWT Bearer | — |
| Datos | Proyecto → Mueble → Piezas, sin módulos. Documentos por proyecto: presupuesto (PDF), optimización (PDF) y modelo 3D (zip con .dae y texturas; el ERP genera además un GLB) | Rutas de lectura de proyectos y Documentos: **desconocidas**, se relevan en U-erp-real |
| Piezas del ERP | Pierde 9 códigos dentro de grupos y corta el nombre | No se usan. Las piezas salen del .dae original y del CSV |

## 4. Diseño
Patrón *backend-for-frontend*: el navegador habla solo con este sistema y el servidor de este sistema habla con el ERP.

```
Navegador ──cookie de sesión propia (httpOnly)──► Este sistema (servidor) ──Bearer JWT──► API del ERP
```

- El JWT y el refresh del ERP **nunca llegan al navegador**. Se guardan del lado del servidor.
- La contraseña del usuario pasa por el servidor una sola vez, en el login. No se guarda, no se registra y no se reenvía.

## 5. Requisitos
- **IE-1. Cliente tipado del ERP** (`src/server/erp/`): funciones `login`, `refresh`, `whoami`, `tenants`, `switchTenant`, `listarProyectos`, `leerProyecto` y `descargarDocumento`. Las respuestas se validan con un esquema; una respuesta inesperada lanza `RespuestaErpInvalida`. Errores con nombre: `ErpNoDisponible`, `CredencialesInvalidas`, `SesionErpVencida` y `RespuestaErpInvalida`. Timeout configurable. Hasta 1 reintento solo en lecturas idempotentes. La URL base sale de `ERP_API_URL`.
- **IE-2. Login** (`/ingresar`): formulario mobile-first con usuario y contraseña, enviado a una acción de servidor. Si sale bien, crea la sesión propia (IE-3) y redirige a `/proyectos`. Si las credenciales son inválidas, muestra un mensaje genérico, sin decir si falló el usuario o la contraseña.
- **IE-3. Sesión propia en la base:**
  - Migración `0002_sesion` con la tabla `sesion`: `id` (hash sha256 del token de sesión), `tenant_id`, `erp_usuario_id`, `erp_tenant_id`, tokens del ERP cifrados, `creada`, `vence` y `revocada`.
  - El navegador recibe el token de sesión en una cookie `httpOnly`, `Secure`, `SameSite=Lax`, con vencimiento.
  - Cifrado con AES-256-GCM de `node:crypto` y clave en `SESION_CLAVE`. No necesita dependencias nuevas.
  - Sin `DATABASE_URL`, se usa la implementación en memoria, igual que en S2A-1.
- **IE-4. Refresh transparente:** si el ERP responde 401 a una lectura, se hace un refresh y se reintenta una vez. Si el refresh falla, se revoca la sesión y se redirige a `/ingresar`.
- **IE-5. Tenant:** al iniciar sesión se toma el tenant activo de `whoami`. Si el `erp_tenant_id` no tiene tenant en la base, se crea, con un campo nuevo `tenant.erp_tenant_id` único. Toda lectura usa el tenant de la sesión, nunca uno que mande el navegador. El cambio de tenant queda para después si el usuario tiene uno solo; si tiene varios, se muestra un selector que llama a `switchTenant`.
- **IE-6. Cierre:** `/salir` llama a `logout` del ERP (si falla, lo registra y sigue), revoca la sesión y borra la cookie.
- **IE-7. Proyectos:** `/proyectos` lista los proyectos del tenant y `/proyectos/<erpId>` muestra los muebles y los Documentos. La ficha (`/p/<qrId>`) sigue pública, como hoy: el QR impreso no exige login. ASUMIDO, a confirmar con Casa Mueble.
- **IE-8. Modelo 3D del ERP:** `descargarDocumento` trae el zip del modelo y lo valida (tamaño máximo, que contenga un .dae y que no tenga rutas con `..`). Se registra su sha256 en la base, asociado al proyecto, y el visor lo abre desde memoria del servidor o desde un archivo temporal. No se persiste el archivo hasta S3.
- **IE-9. Vínculo de proyecto:** la tabla de proyectos de S2 guarda `erp_proyecto_id`, opcional y único por tenant. Si la columna no existe, va en la migración `0002`.
- **IE-10. Secretos:** `ERP_API_URL` y `SESION_CLAVE` en variables de entorno. `CLAUDE.md` lista solo los nombres. Ningún log incluye contraseñas, tokens, cookies ni el cuerpo del login.
- **IE-11. Modo de desarrollo:** con `ERP_MODO=simulado`, el cliente apunta al ERP simulado (IE-12). Una prueba verifica que con `NODE_ENV=production` ese modo lanza un error al arrancar.
- **IE-12. ERP simulado para pruebas:** un servidor local, escrito con `node:http` y sin dependencias nuevas, que imita las rutas de §3 con el tenant y el proyecto de prueba, e incluye un zip del Olmo. Las pruebas nunca llaman al ERP real.

## 6. Pruebas
| Id | Caso |
|---|---|
| TIE-1 | Login válido: crea la sesión, la cookie es `httpOnly` y la respuesta al navegador no contiene el JWT del ERP |
| TIE-2 | Login inválido: mensaje genérico y no se crea sesión |
| TIE-3 | Token del ERP vencido: refresh y reintento, transparente para el usuario |
| TIE-4 | Refresh fallido: sesión revocada y redirección a `/ingresar` |
| TIE-5 | Cookie adulterada o con sesión inexistente: tratada como no autenticada |
| TIE-6 | Tenant: un usuario del tenant A no ve proyectos del tenant B aunque mande el id (multi-tenant, junto con PB-6 a PB-8) |
| TIE-7 | Respuesta del ERP con un formato inesperado lanza `RespuestaErpInvalida` y no rompe la página |
| TIE-8 | Zip inválido (sin .dae, con `..` o demasiado grande): rechazado con un error con nombre |
| TIE-9 | Los logs de un login completo no contienen la contraseña ni los tokens (captura del logger) |
| TIE-10 | `ERP_MODO=simulado` con `NODE_ENV=production` lanza un error |
| TIE-11 | `/p/<qrId>` sigue accesible sin sesión, con el mismo resultado que PB-15 |

## 7. Paradas
- **U-dependencias:** no se espera ninguna. Si aparece la necesidad de una (por ejemplo, un validador de esquema), se para y se pide aprobación con la alternativa descartada.
- **U-credenciales:** Santiago carga las credenciales de QA en variables de entorno locales. La sesión no las pide, no las lee y no las imprime.
- **U-erp-real:** primera llamada al ERP de QA, con aprobación explícita y solo de lectura, sobre el proyecto de prueba P-0002. Se relevan las rutas reales de proyectos y Documentos y la forma de login, refresh y CSRF. Se actualizan esta spec (§3), el simulado y los esquemas. Hasta acá todo corre contra el simulado.

## 8. Criterio de cierre para la pre-entrega
- `typecheck`, `lint` y `npm test` en verde en un worktree limpio.
- TIE-1 a TIE-11 pasan contra el simulado.
- Si llegan las credenciales a tiempo: el flujo login → proyectos → P-0002 → descarga del zip → visor funciona contra QA, con una captura como evidencia. Si no llegan, la demo se hace contra el simulado, **declarado como simulado**.
- `CLAUDE.md` describe el flujo y las variables de entorno.

## 9. Consultas para Casa Mueble (Augusto)
1. Credenciales de un usuario de QA para pruebas, cargadas por el equipo en variables de entorno.
2. Rutas de lectura de proyectos y Documentos, o su OpenAPI.
3. Cómo funcionan el refresh y el CSRF desde un cliente servidor a servidor (cookie o cuerpo).
4. Si los operarios tienen usuario en el ERP y con qué roles.
5. Si la ficha del QR debe exigir login (hoy es pública).

## 10. Riesgos
- **Manejar contraseñas del ERP:** el patrón BFF lo exige mientras no haya embebido ni intercambio de tokens. Se mitiga con IE-10 y TIE-9 y se documenta como deuda hacia el ADR-004 (validar una sesión que ya viene del ERP).
- **Rutas desconocidas:** si U-erp-real llega tarde, IE-7 e IE-8 quedan probadas solo contra el simulado.