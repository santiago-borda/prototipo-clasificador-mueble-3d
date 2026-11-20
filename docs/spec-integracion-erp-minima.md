# Spec — Integración con el ERP de Casa Mueble por embebido (pre-entrega 25/11)

Versión 0.2 · 19/11/2026 · Estado: **propuesta, a aprobar por el equipo**
Reemplaza a `claude/spec-integracion-erp-minima-v0.1.md` (opción a, aprobada el 18/11). Origen: decisión del 19/11 (`claude/decisiones-19-11-embebido-erp.md`).
Rama: `erp-integracion-minima`, desde `fable/s2-base-de-datos`. **Primero `git merge fable/s2-base-de-datos`.**

> Escrita sin acceso al repositorio ni a la API real. Lo que no está relevado se marca **ASUMIDO** y se verifica en las paradas U-erp-front y U-erp-real.

## 0. Cambios respecto de la v0.1
| v0.1 (opción a) | v0.2 (opción b) |
|---|---|
| Login propio `/ingresar` con usuario y contraseña del ERP | **Se elimina.** El usuario ya inició sesión en el ERP; el ERP le pasa su token al iframe (intercambio de token). Este sistema nunca ve contraseñas |
| Refresh servidor a servidor con CSRF (IE-4) | **Se elimina.** Cuando el token vence, el iframe le pide uno nuevo al ERP por `postMessage` |
| `/proyectos` como pantalla de entrada | La entrada es `/embebido?proyecto=<erpId>`, abierta desde la página del proyecto en el ERP. `/proyectos` queda fuera |
| Embebido fuera de alcance | Embebido por **iframe** es el alcance |
| Se mantienen | Cliente tipado (IE-1, sin `login` ni `refresh`), sesión propia cifrada, tenant, zip del modelo, vínculo de proyecto, secretos, modo simulado, ERP simulado |

Si Sonnet ya implementó en la rama el login, el refresh o el cierre de la v0.1, se quitan. El resto se reutiliza.

## 1. Objetivo
Desde la página de un proyecto en el ERP, el usuario ve este sistema embebido, ya ubicado en ese proyecto, sin volver a iniciar sesión: ve los muebles, los Documentos y el visor 3D con el modelo del ERP.

## 2. Decisión técnica: iframe, no microfrontend (decisión del equipo, se informa)
- El frontend del ERP es React 19 + Vite (relevado el 16/11). Un microfrontend (Module Federation o un web component) exige integrar nuestro bundle en su build, alinear versiones de React y cambiar nuestro Next.js App Router, que no expone módulos federados de forma estable. No entra en seis días y ata nuestros despliegues a los suyos.
- El iframe aísla los dos sistemas, Casa Mueble lo agrega con un componente de pocas líneas (§10) y cada uno despliega por separado.
- Reversible: el microfrontend queda como evolución en S5, si Casa Mueble lo pide.

## 3. Fuera de alcance
- Microfrontend.
- Login con contraseña en este sistema.
- Escribir en el ERP.
- Roles: todo usuario autenticado tiene el mismo acceso. ASUMIDO, consulta 6.
- Persistir los archivos del ERP (va a S3; se leen al vuelo, IE-8).
- Contrato OpenAPI propio.
- La ficha `/p/<qrId>` no cambia: sigue pública y fuera del iframe (la usan los operarios desde el QR).

## 4. Hechos relevados y supuestos
| Tema | Relevado (QA, 16/11) | ASUMIDO hasta U-erp-front / U-erp-real |
|---|---|---|
| Frontend del ERP | React 19 + Vite | Origen de QA: a relevar (por ejemplo `https://erp-qa.casamueble.com.ar`) |
| API | `https://erp-api-qa.casamueble.com.ar`, JWT Bearer | El token de acceso está disponible en JavaScript del frontend (en memoria) y se puede enviar por `postMessage` |
| Identidad | `GET /api/session/whoami` | Con el Bearer del usuario devuelve id, nombre y tenant activo. Sirve para validar el token desde nuestro servidor |
| Datos | Proyecto → Mueble → Piezas; Documentos por proyecto (zip con .dae) | Rutas de lectura: **desconocidas** |
| Sitio | Este sistema en `taller-test.casamueble.com.ar` | Mismo sitio registrable que el ERP (`casamueble.com.ar`): la cookie `SameSite=Lax` viaja dentro del iframe |

## 5. Diseño
```
ERP (frontend, sesión ya iniciada)
 └─ <iframe src="https://taller-test.casamueble.com.ar/embebido?proyecto=P-0002">
       1. iframe → ERP:  {tipo:"pfg:listo", v:1}
       2. ERP → iframe:  {tipo:"erp:token", v:1, token}
       3. iframe → servidor propio: POST /api/embebido/sesion {token, proyecto}
       4. servidor → ERP: GET whoami (Bearer token) → crea sesión propia, cookie httpOnly
       5. iframe navega a /embebido/proyectos/P-0002 (render en servidor, lee del ERP con el token guardado cifrado)
 Token vencido: servidor responde "token-erp-vencido" → iframe → ERP {tipo:"pfg:token-requerido"} → vuelve al paso 2
```
- El token del ERP nunca va en la URL, ni en `localStorage`, ni en logs. En el navegador vive solo el tiempo de reenviarlo al servidor.
- Nuestro servidor no decodifica el JWT para autorizar: lo valida llamando a `whoami`.

## 6. Requisitos
- **IE-1. Cliente tipado del ERP** (`src/server/erp/`): `whoami`, `listarProyectos`, `leerProyecto`, `descargarDocumento`. Respuestas validadas con esquema. Errores con nombre: `ErpNoDisponible`, `TokenErpInvalido`, `TokenErpVencido`, `RespuestaErpInvalida`. Timeout configurable; 1 reintento solo en lecturas. URL base en `ERP_API_URL`.
- **IE-2. Protocolo de mensajes** (`src/lib/embebido/protocolo.ts`, funciones puras): tipos `pfg:listo`, `pfg:token-requerido`, `erp:token`, `erp:salir`, todos con `v:1`. Un mensaje se acepta solo si `event.origin` está en `ERP_FRONT_ORIGENES` (coincidencia exacta), `event.source === window.parent` y el cuerpo cumple el esquema. Lo demás se descarta sin error visible y se registra sin contenido. Los envíos usan un `targetOrigin` explícito, nunca `"*"`. El origen del padre se toma del `document.referrer` y se valida contra la lista; si no coincide, se muestra "Abrí esta pantalla desde el ERP".
- **IE-3. Intercambio de token** (`POST /api/embebido/sesion`): acepta solo pedidos con `Origin` igual al de este sistema. Llama a `whoami`; si falla, 401 genérico. Si sale bien, crea la sesión y devuelve la cookie.
- **IE-4. Sesión propia en la base:** migración `0002_sesion` con `id` (sha256 del token de sesión), `tenant_id`, `erp_usuario_id`, `erp_tenant_id`, token del ERP cifrado (AES-256-GCM, `node:crypto`, clave en `SESION_CLAVE`), `creada`, `vence`, `revocada`. Cookie `httpOnly`, `Secure`, `SameSite=Lax`, con vencimiento. Sin `DATABASE_URL`, implementación en memoria (como S2A-1). La cookie solo se usa bajo `/embebido` y `/api/embebido`.
- **IE-5. Renovación por el padre:** si el ERP responde 401, la página muestra el estado "renovando", pide `pfg:token-requerido`, recibe `erp:token`, llama a `POST /api/embebido/sesion/renovar` (exige sesión vigente y mismo `erp_usuario_id`; si no coincide, revoca) y recarga una vez. Si falla o pasan 10 s sin respuesta, se revoca la sesión y se muestra "Volvé a abrir desde el ERP".
- **IE-6. Tenant:** el tenant sale de `whoami`. Si `erp_tenant_id` no existe en la base, se crea (`tenant.erp_tenant_id` único). Toda lectura usa el tenant de la sesión, nunca uno que mande el navegador.
- **IE-7. Pantalla embebida:** `/embebido/proyectos/<erpId>` muestra los muebles y los Documentos del proyecto y abre el visor con el modelo del ERP. Diseño adaptable al ancho del iframe (mínimo 360 px). Si el `erpId` no es del tenant de la sesión: 404.
- **IE-8. Modelo 3D del ERP:** igual que la v0.1: `descargarDocumento` valida el zip (tamaño máximo, contiene .dae, sin rutas con `..`), registra su sha256 en la base y el visor lo abre sin persistir el archivo.
- **IE-9. Vínculo de proyecto:** `erp_proyecto_id` opcional y único por tenant en la tabla de proyectos (migración `0002` si falta).
- **IE-10. Política de framing:** `/embebido/*` responde `Content-Security-Policy: frame-ancestors <ERP_FRONT_ORIGENES>`; el resto del sitio, `frame-ancestors 'none'`. `ERP_FRONT_ORIGENES` se valida al arrancar: orígenes exactos, sin comodines y, con `NODE_ENV=production`, solo `https`.
- **IE-11. Secretos y logs:** `ERP_API_URL`, `ERP_FRONT_ORIGENES` y `SESION_CLAVE` en variables de entorno; `CLAUDE.md` lista solo los nombres. Ningún log incluye tokens, cookies ni cuerpos de mensajes.
- **IE-12. Modo simulado:** `ERP_MODO=simulado` apunta al ERP simulado; con `NODE_ENV=production` lanza un error al arrancar.
- **IE-13. ERP simulado con anfitrión:** servidor `node:http`, sin dependencias nuevas, que imita `whoami` y las rutas de lectura (tenant y proyecto de prueba, zip del Olmo) y además sirve `GET /anfitrion?proyecto=P-0002`: una página que imita al frontend del ERP, embebe este sistema en un iframe y responde los mensajes del §5. Tiene botones para vencer el token y para mandar un token de otro usuario. Es la demo de respaldo si Casa Mueble no llega a agregar el iframe.
- **IE-14. Guía para Casa Mueble:** `docs/guia-embebido-erp.md` con el componente de §10, los orígenes que hay que permitir (`frame-src` de su CSP, si tienen) y qué datos hay que pasar.

## 7. Pruebas
| Id | Caso |
|---|---|
| TIE-1 | Mensaje con origen fuera de la lista, `source` distinto del padre o esquema inválido: descartado |
| TIE-2 | Los envíos nunca usan `"*"` como `targetOrigin` |
| TIE-3 | Intercambio válido: crea la sesión, cookie `httpOnly` y la respuesta no contiene el token del ERP |
| TIE-4 | Token rechazado por `whoami`: 401 genérico, sin sesión |
| TIE-5 | `POST /api/embebido/sesion` con `Origin` ajeno: rechazado |
| TIE-6 | Token vencido: renovación por el padre y reintento, una sola vez |
| TIE-7 | Renovación con token de otro usuario: sesión revocada |
| TIE-8 | Padre que no responde en 10 s: sesión revocada y mensaje para volver a abrir |
| TIE-9 | Cookie adulterada o sesión inexistente: no autenticada |
| TIE-10 | Usuario del tenant A no ve proyectos del tenant B aunque mande el id (con PB-6 a PB-8) |
| TIE-11 | Cabeceras: `/embebido/*` con `frame-ancestors` de la lista; `/p/<qrId>` y el resto con `'none'` |
| TIE-12 | `ERP_FRONT_ORIGENES` con comodín, o con `http` en producción: error al arrancar |
| TIE-13 | Respuesta del ERP con formato inesperado: `RespuestaErpInvalida`, sin romper la página |
| TIE-14 | Zip inválido (sin .dae, con `..`, demasiado grande): rechazado con error con nombre |
| TIE-15 | Los logs de un flujo completo no contienen tokens ni cookies |
| TIE-16 | `ERP_MODO=simulado` con `NODE_ENV=production`: error |
| TIE-17 | `/p/<qrId>` sigue accesible sin sesión, igual que PB-15 |
| TIE-18 | Flujo completo con el anfitrión simulado: abrir, ver P-0002, ver el visor, vencer el token y seguir. Con Playwright si el repo ya lo tiene; si no, prueba manual con captura, sin agregar dependencias |

## 8. Paradas
- **U-dependencias:** no se espera ninguna. Si aparece, se para y se pide aprobación con la alternativa descartada.
- **U-erp-front:** Casa Mueble agrega el iframe en la página del proyecto de QA con la guía de IE-14. No depende del equipo; hasta entonces todo corre con el anfitrión simulado.
- **U-erp-real:** primera prueba contra QA, con aprobación explícita y solo lectura, sobre P-0002. Requiere este sistema desplegado en `taller-test.casamueble.com.ar` (ver §11). Se relevan las rutas reales y se actualizan §4, el simulado y los esquemas.

## 9. Criterio de cierre para la pre-entrega
- `typecheck`, `lint` y `npm test` en verde en un worktree limpio.
- TIE-1 a TIE-17 pasan; TIE-18 con evidencia.
- Si Casa Mueble agregó el iframe y hay despliegue: el flujo funciona dentro del ERP de QA, con captura. Si no, la demo se hace con el anfitrión simulado, **declarado como simulado**.
- `CLAUDE.md` describe el flujo, el protocolo y las variables de entorno.

## 10. Componente para el frontend del ERP (borrador para la guía)
```tsx
// En la página del proyecto del ERP (React 19).
const ORIGEN_PFG = "https://taller-test.casamueble.com.ar";

export function GuiaArmadoEmbebida({ proyectoId, obtenerToken }: {
  proyectoId: string;
  obtenerToken: () => Promise<string>; // token de acceso vigente del usuario
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    async function alRecibir(e: MessageEvent) {
      if (e.origin !== ORIGEN_PFG || e.source !== ref.current?.contentWindow) return;
      if (e.data?.tipo === "pfg:listo" || e.data?.tipo === "pfg:token-requerido") {
        const token = await obtenerToken();
        ref.current?.contentWindow?.postMessage({ tipo: "erp:token", v: 1, token }, ORIGEN_PFG);
      }
    }
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, [obtenerToken]);
  return <iframe ref={ref} title="Guía de armado"
    src={`${ORIGEN_PFG}/embebido?proyecto=${encodeURIComponent(proyectoId)}`}
    style={{ width: "100%", height: "80vh", border: 0 }} />;
}
```

## 11. Consultas para Casa Mueble (Augusto)
1. ¿Pueden agregar el componente de §10 en la página del proyecto del ERP de QA antes del 25/11? (requisito del cliente y fecha; si no, demo con el anfitrión simulado).
2. Origen exacto del frontend de QA y, más adelante, el de producción.
3. ¿El frontend tiene el token de acceso disponible en JavaScript para pasarlo al iframe? ¿Cuánto dura?
4. ¿El token del usuario sirve para llamar a la API desde otro servidor (restricción por IP, audiencia u origen)?
5. Rutas de lectura de proyectos y Documentos, o su OpenAPI.
6. Si los operarios tienen usuario en el ERP y con qué roles.
7. Si la ficha del QR debe exigir login (hoy es pública).

Quedan sin efecto las consultas de la v0.1 sobre credenciales cargadas en variables de entorno y sobre refresh y CSRF servidor a servidor. Para U-erp-real alcanza un usuario de QA con el que Santiago entre al ERP desde el navegador.

## 12. Riesgos
- **Depende de un cambio en el frontend del ERP.** Mitigación: anfitrión simulado (IE-13) y guía lista (IE-14).
- **Despliegue:** para probar contra el ERP real, este sistema tiene que estar en `taller-test.casamueble.com.ar` (https y mismo sitio). Eso convierte en bloqueante la decisión pendiente de dónde corre la base de la demo. Una demo desde una máquina del equipo solo sirve con el anfitrión simulado.
- **Otro sitio registrable:** si el ERP no está bajo `casamueble.com.ar`, la cookie dentro del iframe es de terceros y los navegadores la bloquean. Alternativa: cookie `SameSite=None; Secure; Partitioned`. Se decide en U-erp-real.
- **Token en el navegador:** el token del ERP pasa por el iframe un instante. Mitigación: IE-2 (origen y fuente validados) y nunca en URL ni almacenamiento.
- **Rutas desconocidas:** si U-erp-real llega tarde, IE-7 e IE-8 quedan probadas solo contra el simulado.