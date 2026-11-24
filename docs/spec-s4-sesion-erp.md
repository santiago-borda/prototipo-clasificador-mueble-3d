# Especificación — S4: sesión del ERP

Versión: **v0.1 (17/11/2026), borrador a aprobar por el equipo.** No hay código.
Antecedentes: `docs/adr/ADR-004-autenticacion.md`, `docs/consultas-casa-mueble-arquitectura.md` (CA-3, CA-4, CA-14), `docs/spec-s2-base-de-datos.md`.
Condición: ADR-004 aceptado y S2 cerrada.

---

## 1. Objetivo y alcance

Que el servidor de este sistema pueda saber, de forma comprobada, **quién** hace un pedido de escritura y **de qué carpintería**, usando la sesión del ERP y sin guardar credenciales ni tokens del ERP.

Incluye:
1. Interfaz `SessionVerifier` con dos implementaciones: de prueba y por consulta a `/api/session/whoami`.
2. Sesión propia: emisión, lectura y cierre (`POST`, `GET` y `DELETE /api/sesion`).
3. Funciones `requireSession` y `requirePermission` para los casos de uso de escritura.
4. Alta de carpinterías habilitadas y tabla de permisos por rol.

**No es objetivo:** cambiar la protección del importador de prueba (sigue con `IMPORT_UPLOAD_KEY`); pantallas de ingreso (el ingreso es desde el ERP, S5); sesión del operario; validar la firma del JWT (queda como implementación futura); llamar al ERP de QA en las pruebas automáticas.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| S4-D1 | Código en `src/session/`: `verifier.ts` (interfaz y tipos), `fakeVerifier.ts`, `whoamiVerifier.ts`, `cookie.ts` (firma y lectura), `guard.ts`, `config.ts`. | Mismo patrón que el importador. |
| S4-D2 | `whoamiVerifier` recibe `fetch`, la URL base del ERP y un reloj por parámetro. No lee variables de entorno ni usa el `fetch` global. | Se prueba sin red; la suite hace fallar el `fetch` global. |
| S4-D3 | La respuesta de `whoami` se convierte con una función pura `parseWhoami(json)` que valida con aserciones. La forma esperada (identificador de usuario, identificador de carpintería, lista de roles) es **ASUMIDA** hasta CA-3 y está en un solo lugar. | Si la forma real difiere, se cambia una función y su prueba. |
| S4-D4 | Sesión propia: cookie `HttpOnly`, `Secure`, `SameSite=Lax`, con `{ userId, tenantId, roles, exp }` firmado con HMAC-SHA256 (`node:crypto`) y la clave `SESSION_SECRET`. Sin `SESSION_SECRET`, las rutas de sesión responden 503 y el resto de la app funciona. | Sin dependencias nuevas. El contenido no es secreto; la firma impide alterarlo. |
| S4-D5 | Duración: 30 minutos (ASUMIDO), sin renovación. Al vencer se ingresa de nuevo desde el ERP. | ADR-004, decisión 3. |
| S4-D6 | El token del ERP llega en el cuerpo de `POST /api/sesion`, se usa una vez y no se guarda ni se escribe en registros. | ADR-004. |
| S4-D7 | Una carpintería del ERP ingresa solo si existe en `tenant` con ese `erp_tenant_id` y está habilitada. Si no, 403 `tenant-no-habilitado`. Las altas las hace el equipo con un script local. | Lista cerrada (ADR-004, decisión 4). |
| S4-D8 | Permisos: `leer` y `escribir`. Tabla `role_permission` (`tenant_id`, `erp_role`, `permission`). Un rol que no figura no da permisos. Los nombres de rol no se fijan en el código (CA-14). | No se inventan los roles del ERP. |
| S4-D9 | Los pedidos de escritura con sesión exigen además el encabezado `x-cm-armado: 1`. | Un formulario de otro sitio no puede mandarlo (protección contra pedidos cruzados, sumada a `SameSite`). |
| S4-D10 | La comparación de firmas es en tiempo constante (`timingSafeEqual`), como la clave del importador. | Práctica ya usada en el repo. |

## 3. Contrato

```ts
// src/session/verifier.ts
export interface ErpIdentity { userId: string; erpTenantId: string; roles: readonly string[] }
export type VerifyResult =
  | { ok: true; identity: ErpIdentity }
  | { ok: false; reason: "token-invalido" | "erp-no-disponible" | "respuesta-invalida" };

export interface SessionVerifier { verify(token: string): Promise<VerifyResult> }

// src/session/guard.ts
export function requireSession(request: Request, deps: SessionDeps): Session;          // lanza SesionRequeridaError
export function requirePermission(session: Session, p: "leer" | "escribir"): void;     // lanza PermisoDenegadoError
```

Excepciones con nombre: `SesionRequeridaError`, `SesionVencidaError`, `FirmaInvalidaError`, `PermisoDenegadoError(permission)`, `TenantNoHabilitadoError`, `RespuestaErpInvalidaError(campo)`.

Respuestas de `POST /api/sesion`: 204 con la cookie; 401 `token-invalido`; 403 `tenant-no-habilitado`; 502 `erp-no-disponible` o `respuesta-invalida`; 503 `sesion-no-configurada`.

## 4. Requisitos

- **A1.** Sin sesión válida, ninguna función protegida corre.
- **A2.** El `tenantId` de una operación sale solo de la sesión.
- **A3.** Una cookie alterada, vencida o firmada con otra clave se rechaza.
- **A4.** El token del ERP no se guarda ni aparece en registros, respuestas ni errores.
- **A5.** Una carpintería no habilitada no ingresa.
- **A6.** Un rol sin permiso de escritura no escribe.
- **A7.** Si el ERP no responde o responde con otra forma, el ingreso falla con un motivo claro y no se emite sesión.
- **A8.** Sin `SESSION_SECRET`, la app funciona como hoy y las rutas de sesión responden 503.
- **A9.** El importador de prueba y las fichas no cambian.
- **A10.** `src/session/` no importa `next/*` salvo en las rutas, y nada con `"use client"` importa `cookie.ts` ni `guard.ts`.

## 5. Criterios de aceptación y pruebas

Todas automáticas, sin red, con reloj inyectado (`tests/session/`).

| Id | Requisito | Qué | Esperado |
|---|---|---|---|
| PA-1 | A1 | `requireSession` sin cookie | `SesionRequeridaError` |
| PA-2 | A3 | cookie con un byte cambiado; con otra clave; con `exp` pasado por un segundo; con `exp` justo en el límite | `FirmaInvalidaError`, `FirmaInvalidaError`, `SesionVencidaError`, válida |
| PA-3 | A2 | pedido con sesión de la carpintería A y un `tenantId` de B en la URL y en el cuerpo | la operación usa A |
| PA-4 | A4 | `POST /api/sesion` con un token centinela; se inspeccionan la cookie, el cuerpo de la respuesta y lo escrito por `console` | el centinela no aparece |
| PA-5 | A5 | identidad con una carpintería inexistente y con una deshabilitada | 403 `tenant-no-habilitado`, sin cookie |
| PA-6 | A6 | rol con `leer` solamente; rol que no figura en la tabla | `PermisoDenegadoError("escribir")` en los dos |
| PA-7 | A7 | `fetch` falso que responde 401; que lanza; que responde 200 con JSON sin el campo de carpintería; con HTML | `token-invalido`; `erp-no-disponible`; `respuesta-invalida` (dos veces) |
| PA-8 | A7 | `parseWhoami` con cada campo faltante o de otro tipo | `RespuestaErpInvalidaError` con el nombre del campo |
| PA-9 | A8 | rutas de sesión sin `SESSION_SECRET` | 503 `sesion-no-configurada` |
| PA-10 | S4-D9 | escritura con sesión válida y sin el encabezado `x-cm-armado` | rechazada |
| **PA-11** | A9 | pruebas existentes del importador, del spike de CSV y de las fichas, sin modificar | pasan |
| PA-12 | A10 | prueba estática de imports | sin importaciones prohibidas |
| PA-13 | — | `whoamiVerifier` llama a la URL configurada con `Authorization: Bearer <token>` y nada más del pedido original | un solo pedido, sin cookies |

**Prueba manual M-S4 (requiere aprobación del equipo y credenciales en variables de entorno):** ingresar con un usuario real de QA, comprobar que `parseWhoami` acepta la respuesta real y ajustar S4-D3 si no. Se graba la **forma** de la respuesta (nombres de campos y tipos), sin valores reales, como fixture.

Al cerrar: `typecheck`, `lint`, `npm test` y `build` en verde.

## 6. Paradas obligatorias

| Parada | Antes de | Qué aprueba el equipo |
|---|---|---|
| U-regla | escribir código | que la regla de `CLAUDE.md` «sin middleware de auth ni cuentas» se reemplace por «sesión del ERP comprobada en cada caso de uso de escritura» |
| U-qa | M-S4 | la llamada real a QA: qué usuario, qué endpoint (`whoami`, solo lectura) y dónde van las credenciales |

Sin dependencias nuevas.

## 7. Supuestos (ASUMIDO)

- Forma de la respuesta de `whoami` (S4-D3, CA-3).
- 30 minutos de sesión (S4-D5).
- Dos permisos (S4-D8, CA-14).
- Carpinterías dadas de alta por el equipo (S4-D7).

## 8. Orden de trabajo

1. Parada U-regla.
2. `verifier.ts`, `fakeVerifier.ts`, `cookie.ts` con sus pruebas (PA-1, PA-2).
3. `parseWhoami` y `whoamiVerifier` con `fetch` falso (PA-7, PA-8, PA-13).
4. `guard.ts`, migración de `role_permission`, rutas (PA-3 a PA-6, PA-9, PA-10).
5. PA-11 y PA-12.
6. Parada U-qa y M-S4, si el equipo la aprueba.
7. Actualizar `CLAUDE.md` y `.env.example`.
