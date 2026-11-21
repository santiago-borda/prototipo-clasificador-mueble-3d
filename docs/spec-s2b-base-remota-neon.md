# Spec S2 — Enmienda B: la base de la demo en Neon (v0.1, 21/11/2026)

**Estado:** Santiago decidió el 21/11 que la base de la demo se aloja **temporalmente en Neon**, que ya está conectada a su proyecto de Vercel, y aprobó avanzar con esta tarea antes de leer la spec. Las precisiones S2B-I1 en adelante quedan **a revisar**. Rama `erp-integracion-minima`, sin push.

Enmienda a: `docs/spec-s2-base-de-datos.md` v0.2 (S2-D5, B10: guarda de base local) y `docs/adr/ADR-002-base-de-datos.md` (dónde se aloja).

## 1. Qué cambia
- **No cambia la guarda local.** `db:migrate` y `db:seed` siguen aceptando solo `localhost` y `127.0.0.1`, sin bandera (`assertLocalDatabase`, PB-14 de S2).
- **Camino nuevo y separado** para la base remota: `npm run db:migrate:remota` y `npm run db:seed:remota`. Los dos exigen, antes de conectarse:
  - **S2B-1.** `DATABASE_URL` remota (no `localhost` ni `127.0.0.1`);
  - **S2B-2.** `DB_REMOTA_HOST` con el **host exacto** de esa URL (es la confirmación de quien lo corre: escribir el host es aprobar la acción sobre esa base y no otra);
  - **S2B-3.** conexión cifrada: `sslmode=require`, `verify-ca` o `verify-full` en la URL.
  Si falta algo, `BaseRemotaNoConfirmadaError(host, motivo)` y no se conecta. Ningún mensaje lleva la URL (trae la clave): solo el host.
- **Claude Code no corre estos scripts** (migrar una base que no es local requiere aprobación del equipo, CLAUDE.md) y nunca ve la cadena de conexión (U-credenciales).

## 2. Cómo usarlo (Santiago o Lautaro, en su terminal)
1. En Vercel → Storage → la base de Neon (o en la consola de Neon) copiar la cadena de conexión **directa** (sin `-pooler` en el host; la integración la llama `DATABASE_URL_UNPOOLED`, a verificar). Para migrar conviene la directa. No pegarla en el repo, en el chat ni en un archivo commiteado.
2. En la terminal (PowerShell):
   ```powershell
   $env:DATABASE_URL = "<cadena directa de Neon>"
   $env:DB_REMOTA_HOST = "<el host de esa cadena, p. ej. ep-xxxx.sa-east-1.aws.neon.tech>"
   npm run db:migrate:remota
   npm run db:seed:remota
   Remove-Item Env:DATABASE_URL, Env:DB_REMOTA_HOST
   ```
   La salida dice solo el host y qué migraciones aplicó (`0001_inicial`, `0002_integracion_erp`), y después «primer fixture cargado en la carpintería "desarrollo" (21 tipos de pieza, 33 piezas físicas…)». Correrlos dos veces no hace nada la segunda.
3. Si la integración de Neon crea una **rama de base por cada preview** de Vercel, esa rama copia los datos de la rama principal de Neon en el momento de crearse: migrar y sembrar primero la principal.

## 3. Qué hay que saber antes de desplegar (no se despliega nada en esta tarea)
- **S2B-4. Con `DATABASE_URL` definida en un entorno de Vercel, la app de una rama que tenga S2A lee `/p/<qrId>` de esa base** (`src/server/datos.ts`), y la integración con el ERP guarda ahí sesiones, trabajos y archivos. Si la base no está migrada y sembrada, `/p/<qrId>` muestra «No se pudo cargar la ficha» (`error.tsx`) o 404. **Antes de desplegar una rama con S2A a un entorno con `DATABASE_URL`, correr el §2 contra esa base.** `main` todavía no tiene S2A: producción no cambia hasta que se mergee.
- **S2B-5. Conexiones:** la app abre un pool de hasta 5 conexiones por instancia (`createDb`). En Vercel cada función es una instancia: para la app conviene la cadena **con pooler** de Neon (`-pooler` en el host), que es la que la integración pone en `DATABASE_URL` (a verificar). No se cambió el tamaño del pool.
- **S2B-6. Archivos:** el almacén de la integración guarda los zip y CSV del ERP en la base (`file_content`, ASUMIDO hasta S3). Con el Olmo, unos cientos de KB por envío: entra holgado en el plan gratuito de Neon (0,5 GB, cifra a verificar).
- Desplegar, cargar las variables del ERP (`ERP_WEB_ORIGEN`, etc.) en Vercel y apuntar `taller-qa` siguen requiriendo aprobación del equipo.

## 4. Pruebas (sin red ni base)
| # | Caso | Esperado |
|---|---|---|
| S2B PB-1 | `assertConfirmedRemoteDatabase` con base remota, TLS y host confirmado (también en mayúsculas o con espacios); `verify-ca` y `verify-full` | acepta y devuelve el host |
| S2B PB-1 | URL ilegible, `localhost`, `127.0.0.1`, sin confirmar, confirmación vacía, otro host, host parecido (sin `-pooler`), sin `sslmode`, `prefer`, `disable` | `BaseRemotaNoConfirmadaError` con el motivo (`url-ilegible`, `es-local`, `sin-confirmar`, `host-distinto`, `sin-tls`) |
| S2B PB-2 | Mensajes de error | nunca el usuario ni la clave; sí el host |
| S2B PB-3 | `assertLocalDatabase` con la URL de Neon | sigue lanzando `BaseNoLocalError` |
| manual | `npm run db:migrate:remota` sin `DB_REMOTA_HOST`, con otro host o sin `sslmode` | no se conecta y dice por qué (verificado el 21/11 con URLs de ejemplo, sin red) |

## 5. Precisiones (a revisar)
- **S2B-I1.** La confirmación es el host exacto y no una bandera: una bandera se copia de un comando a otro sin mirar; el host obliga a decir **qué** base.
- **S2B-I2.** Se exige TLS por la URL (`sslmode`), no por código: Neon lo pide igual. `pg` trata `require` como `verify-full` (verifica el certificado), lo que con Neon funciona.
- **S2B-I3.** Las cadenas de Neon traen `channel_binding=require`; `pg` lo ignora como parámetro desconocido (ASUMIDO, a verificar en la primera corrida).
- **S2B-I4.** Neon es temporal (decisión del 21/11): cambiar de proveedor es cambiar la URL y volver a correr el §2; el esquema es PostgreSQL estándar (ADR-002).
