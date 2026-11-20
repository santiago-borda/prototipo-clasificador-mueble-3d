# Guía: login contra el ERP y validación del token

Para el equipo de UCP. Entorno de QA. El contrato completo está en [`../contrato-ucp.md`](../contrato-ucp.md).

## Resumen

1. El usuario se loguea con su usuario del ERP. **El login lo hace su servidor (Next.js), no el navegador.**
2. El ERP devuelve un access token JWT firmado por el Auth del ERP.
3. Su API valida ese token con las claves públicas del Auth (JWKS) y toma `sub` y `tenant_id`.

En producción, cuando UCP esté embebido en el ERP, el paso 1 no existe: el token llega por `postMessage` (`erp:sesion`). El login propio sirve para desarrollar y probar en su localhost.

## Datos de QA

| Qué | Valor |
|---|---|
| Login | `POST https://erp-api-qa.casamueble.com.ar/api/session/login` |
| Issuer | `https://erp-auth-api-qa.casamueble.com.ar/` (con la barra final) |
| Descubrimiento | https://erp-auth-api-qa.casamueble.com.ar/.well-known/openid-configuration |
| JWKS | https://erp-auth-api-qa.casamueble.com.ar/.well-known/jwks |
| Algoritmo | RS256 (certificado en Azure Key Vault) |
| Vencimiento | 15 minutos |
| Carpintería de pruebas | `A1C0E001-0000-4000-8000-000000000002` |

Cada uno de ustedes recibe una invitación por mail a la carpintería de pruebas; al aceptarla define su clave.

## 1. Login

```bash
curl -s https://erp-api-qa.casamueble.com.ar/api/session/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<usuario>","password":"<clave>"}'
```

También se puede mandar `nombreUsuario` en vez de `email`. La respuesta es un `OperationResult`; el token está en `data.accessToken`. Si las credenciales son incorrectas, la respuesta trae el error y no hay token.

### Por qué desde el servidor

La API de QA solo acepta pedidos de navegador (CORS) desde el dominio del ERP. Un `fetch` desde `http://localhost:3000` en el navegador va a fallar. Llamando desde un Route Handler o Server Action de Next.js no hay CORS.

```ts
// app/api/login/route.ts
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  const { email, password } = await req.json()
  const r = await fetch(`${process.env.ERP_API_URL}/api/session/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  })
  const body = await r.json()
  const token = body?.data?.accessToken
  if (!r.ok || !token) return Response.json({ ok: false }, { status: 401 })

  ;(await cookies()).set('erp_token', token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 15 * 60,
  })
  return Response.json({ ok: true })
}
```

```env
ERP_API_URL=https://erp-api-qa.casamueble.com.ar
ERP_ISSUER=https://erp-auth-api-qa.casamueble.com.ar/
```

Su front llama a su propio `/api/login` y después manda el token a su API (desde el servidor, o como `Authorization: Bearer` si su API lo recibe así). Cuando vence (15 min) hay que volver a loguearse; no hay refresh token.

## 2. Validar el token en su API

Qué validar:

- **Firma** con el JWKS (RS256).
- **`iss`** igual al issuer, con la barra final.
- **`exp`** (y `nbf` si viene), con una tolerancia chica de reloj.
- **Audiencia: no.** El ERP no la valida y el token no trae una pensada para UCP.

Qué usar del token:

| Claim | Uso |
|---|---|
| `sub` | UUID del usuario del ERP. Es el id estable del usuario. |
| `tenant_id` | UUID de la carpintería. Filtren **todo** por este valor; nunca lo tomen de la URL ni del cuerpo. |

El token no trae permisos ni nombre. Si necesitan el nombre para mostrar, guárdenlo de su lado o pídanlo al ERP con el mismo token.

### Node / Next.js (con `jose`)

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const issuer = process.env.ERP_ISSUER! // con barra final
const jwks = createRemoteJWKSet(new URL('.well-known/jwks', issuer))

export async function validarToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, { issuer, algorithms: ['RS256'], clockTolerance: 30 })
  const usuario = payload.sub as string
  const tenantId = payload.tenant_id as string
  if (!usuario || !tenantId) throw new Error('Token sin sub o tenant_id')
  return { usuario, tenantId }
}
```

`createRemoteJWKSet` cachea las claves y las vuelve a pedir solo si llega un `kid` que no conoce.

### .NET (si su API es ASP.NET Core)

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = "https://erp-auth-api-qa.casamueble.com.ar/";
        o.MapInboundClaims = false; // conserva "sub" y "tenant_id" tal cual
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = false,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

// En el endpoint:
var tenantId = User.FindFirst("tenant_id")?.Value;
var usuario = User.FindFirst("sub")?.Value;
```

Con `Authority` toma el JWKS del descubrimiento solo y lo refresca cuando aparece un `kid` nuevo.

## 3. Probarlo

1. Login con curl y copiar `data.accessToken`.
2. Pegarlo en https://jwt.io para ver `iss`, `sub`, `tenant_id` y `exp` (no pega nada a ningún server nuestro; igual, usen solo tokens de QA).
3. Llamar a su API con `Authorization: Bearer <token>`: debe responder 200 y ver la carpintería de pruebas.
4. Casos que deben rechazar con 401: token vencido (esperar 15 min), token con un carácter cambiado, token de otro issuer.

## 4. Modo embebido (después)

Dentro del ERP no hay pantalla de login de UCP. El ERP manda `erp:sesion` con `accessToken`, `vence` y `tenantId`, y `erp:token` cuando lo renueva. El front de UCP se lo pasa a su API igual que en la sección 2: la validación es la misma. Para probarlo usen [`host-erp.html`](./host-erp.html).
