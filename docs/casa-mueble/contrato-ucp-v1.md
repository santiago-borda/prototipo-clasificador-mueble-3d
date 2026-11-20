# Contrato de integración ERP ↔ UCP (v1)

Documento para el equipo de UCP. Describe lo que su sistema (Next.js + API + SQL Server) tiene que cumplir para integrarse con CasaMueble ERP. Los entornos son QA y Prod; las URLs concretas se acuerdan por entorno.

## 1. Autenticación

- El ERP usa **Auth.Api** (OpenIddict). Los access tokens son **JWT firmados (RS256), sin cifrar**, duran **15 minutos**.
- Validación del lado de UCP (API y, si corresponde, server-side de Next.js):
  - Firma con las claves de `{AUTH_URL}/.well-known/jwks` (descubrimiento en `{AUTH_URL}/.well-known/openid-configuration`). Cachear las claves y refrescar si aparece un `kid` desconocido.
  - `iss` igual al issuer del entorno; `exp` vigente.
  - **No** validar audiencia en v1 (los tokens de usuario no la traen).
- Claims a usar: `sub` = UUID del usuario; `tenant_id` = UUID de la carpintería. **El tenant sale siempre del token, nunca del cuerpo ni de la URL.**
- Los permisos del usuario no viajan en el token. El ERP solo muestra la integración a quien tiene `tenant.ucp.usar`; si UCP necesita permisos propios, los maneja en su lado por `sub` + `tenant_id`.
- No guardar el token en storage persistente ni enviarlo a otro origen que su propia API.

## 2. Multi-carpintería (obligatorio)

- Todas las tablas de negocio llevan `TenantId` (UUID del claim `tenant_id`) y toda consulta filtra por él.
- La configuración del webhook (URL + secreto) es **por carpintería**.

## 3. API de UCP

### `POST /api/trabajos`
Header `Authorization: Bearer <token del usuario>` (el ERP reenvía el token de quien tocó "Enviar a UCP").

```json
{
  "version": 1,
  "envioUuid": "7f6d…",          // idempotencia: mismo envioUuid ⇒ mismo trabajo
  "proyecto": { "uuid": "…", "codigo": "P-0142", "nombre": "Cocina integral", "cliente": "Familia Gómez", "fechaEntrega": "2026-12-15" },
  "modelo": { "url": "https://…blob…/modelo.zip?sig=…", "nombre": "cocina.zip", "version": 3, "sha256": "…" },
  "csv":    { "url": "https://…blob…/piezas.csv?sig=…", "nombre": "piezas.csv", "version": 1, "sha256": "…" }
}
```

- `modelo.url` es un `.zip` con el `.dae` (Collada de SketchUp) y sus texturas. Las URLs vencen a los **15 minutos**: descargar al recibir el pedido y verificar `sha256`.
- Respuesta 200/201: `{ "trabajoUuid": "…", "estado": "recibido" }`. Errores: 4xx con mensaje legible (se muestra al usuario), 5xx reintentables.

### `GET /api/trabajos/{trabajoUuid}`
Mismo header. Devuelve `{ "trabajoUuid", "envioUuid", "estado", "mensaje", "actualizadoEn" }`. El ERP lo usa como respaldo si no llegó el webhook.

## 4. Webhook (UCP → ERP)

- Cada carpintería carga en el sitio de UCP la **URL** y el **secreto** que genera el ERP (Configuración → Integraciones → UCP). Ejemplo de URL: `https://erp-api.casamueble.com.ar/api/integraciones/ucp/webhook/{webhookId}`.
- `POST` con `Content-Type: application/json` y headers:
  - `X-Ucp-Timestamp`: epoch en segundos.
  - `X-Ucp-Firma`: `hex(HMAC-SHA256(secreto, "<timestamp>.<cuerpo crudo>"))`.
- Cuerpo:

```json
{ "version": 1, "evento": "trabajo.listo", "trabajoUuid": "…", "envioUuid": "…", "proyectoUuid": "…", "mensaje": "Corte terminado", "ocurridoEn": "2026-11-20T15:04:05Z" }
```

- `evento`: `trabajo.listo` o `trabajo.error`.
- El ERP rechaza (401) firmas inválidas y timestamps con más de 5 minutos de diferencia. Responde 200 aunque el aviso ya se haya procesado. Ante 5xx o timeout, reintentar con backoff (el aviso es idempotente).

## 5. Microfrontend (iframe)

- El ERP carga `{UCP_WEB_URL}/erp/proyectos/{proyectoUuid}` en un iframe.
- Mensajes por `window.postMessage`, siempre con `version: 1`, verificando `event.origin` contra el dominio del ERP del entorno:

| Dirección | `tipo` | Datos |
|---|---|---|
| UCP → ERP | `ucp:listo` | — al cargar, para pedir la sesión |
| ERP → UCP | `erp:sesion` | `accessToken`, `vence` (epoch), `tenantId`, `proyecto` { `uuid`, `codigo`, `nombre` }, `tema` (`claro`/`oscuro`) |
| ERP → UCP | `erp:token` | `accessToken`, `vence` — en cada renovación |
| UCP → ERP | `ucp:alto` | `alto` (px) del contenido, para ajustar el iframe |
| UCP → ERP | `ucp:navegar` | `ruta` del ERP a abrir (opcional) |

- Cabecera `Content-Security-Policy: frame-ancestors <dominio del ERP>` por entorno.
- Respetar `tema` (claro/oscuro) para que se vea integrado.
