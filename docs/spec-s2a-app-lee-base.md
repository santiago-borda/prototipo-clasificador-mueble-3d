# Spec S2 — Enmienda A: la ficha y el visor leen de la base

Versión 0.3 · 21/11/2026 · Estado: v0.2 **aprobada por Santiago el 18/11/2026**; v0.3 (S2A-4b y S2A PB-18) por su decisión del 21/11 («una vez escaneado debe indicar que ese QR tiene una nueva versión»)
Enmienda a: `docs/spec-s2-base-de-datos.md` v0.2 (aprobada el 17/11).
Motivo: decisión del 18/11 (`claude/decisiones-18-11-integracion-erp.md`, decisiones 2 a 4).
Rama: `s2a-app-lee-base`, desde `fable/s2-base-de-datos`.

> **v0.2 (18/11):** decisiones de Santiago sobre el reporte de la sesión S2A, que paró antes de implementar la v0.1: (a) sin `server-only`; (b) los datos le llegan al visor desde la página de servidor, y **solo `/p/<qrId>` lee de la base**; (c) `error.tsx` mínimo en `/p`; (d) `/p/[qrId]` pasa a dinámica; la excepción es `PersistenciaNoDisponibleError`; las pruebas se llaman «S2A PB-14…16»; el `modelId` del Olmo es una constante; Sabrina deja de aparecer en `/p` (cambio conocido); `qrScan.ts` y `/escanear` quedan como deuda (§7).
>
> **Nota de numeración:** S2A PB-14 a S2A PB-17 no son las PB-14 a PB-16 de S2 (`assertLocalDatabase`, `newQrId`, `git diff`), que ya existen en `tests/persistence/puro.test.ts`.

## 1. Objetivo

Que la resolución de un QR (`/p/<qrId>`) y los datos que muestran la ficha y el visor en esa ruta salgan de los repositorios de `src/persistence/`, sin cambio visible para el operario (salvo los del §7).

## 2. Fuera de alcance

- El importador (`/importar` → `/prueba/<id>`): lo reemplaza el importador CSV, con su propia spec.
- `/`, `/qr` y `/escanear`: siguen con el registro estático de `src/lib/lookup.ts` (§7).
- Rediseño de la ficha o del visor.
- `src/engine/` y `src/pdf/`.
- Base no local y despliegue.
- Archivos (.dae, texturas): siguen donde están. Van a S3.

## 3. Requisitos

- **S2A-1. Raíz de composición única.** `src/server/datos.ts` elige la implementación del repositorio:
  - con `DATABASE_URL` definida, la de SQL (`createSqlPersistence(createDb(url))`, `src/persistence/sql/`);
  - sin ella, la de memoria (`createMemoryPersistence()`, `src/persistence/memory/`), cargada con la misma semilla del Olmo que `db:seed` (`seedOlmo`, `db/seed.ts`).

  Es el único lugar fuera de `src/persistence/` y `db/` que importa `src/persistence/sql/`. **No usa `server-only`** (sería una dependencia nueva): la frontera la sostiene PB-13 enmendada.
- **S2A-2. Resolución por el contrato.** `src/server/datos.ts` exporta `resolveQrTarget(qrId): Promise<QrTarget | undefined>`. Resuelve con `QrRepository.resolve` (la única función sin `tenantId`) y carga el mueble con `FurnitureRepository.getFurnitureDef(tenantId, designVersionId)`. El `QrTarget` se arma con la misma función pura que usa `resolveQr` (`targetFromDef`, `src/lib/qrTarget.ts`), para que el objeto que recibe la ficha tenga la misma forma. `src/lib/lookup.ts` no importa `src/persistence/` y sigue con el registro estático para las rutas fuera de alcance.
- **S2A-3. Sin datos estáticos en la ruta de la ficha.** En `/p/<qrId>`, la ficha y el visor no leen de `src/data/` en tiempo de ejecución; `src/data/` queda solo como fuente de la semilla. La página (componente de servidor) resuelve el QR y le pasa el `def` a un componente de cliente que lo carga en el store del visor (`useViewStore`). En `/p/*`, el visor (`useActiveFurniture`, `FurnitureModel`, `PieceMenu`, `ViewModeControl`) usa solo ese `def`. **Límite: solo `/p/<qrId>` lee de la base.**
- **S2A-4. QR inexistente o no publicado.** Se comporta igual que hoy: `notFound()`, la misma página `not-found.tsx` y HTTP 404. Si la base no responde, sale `PersistenciaNoDisponibleError` (en `src/persistence/ports.ts`, con la causa), se registra con `console.error` (sin la URL de la base) y la página muestra `src/app/p/error.tsx`: el texto «No se pudo cargar la ficha. Revisá la conexión e intentá de nuevo» y un botón «Reintentar» (llama a `retry`), con los estilos de `not-found.tsx`. Sin otro cambio visible. Nunca se cae a los datos estáticos en silencio.
- **S2A-4b. QR de una versión reemplazada (v0.3, decisión de Santiago del 21/11).** Un QR de pieza o de módulo cuya versión está `reemplazada` **sigue abriendo su versión** (el QR ya estaba impreso y pegado, y nunca cambia de destino, modelo de datos §4.2), con el aviso que ya existe en la ficha: «Hay una versión más nueva de este diseño · Esta ficha corresponde a la versión X. Verificá antes de cortar o armar.» (`NewerVersionBanner`, por `furniture.newerVersionAvailable`, que el repositorio calcula al leer; `resolveQrTargetWith` lo fuerza en `true` para una versión `reemplazada`). Los demás estados no publicados (`borrador`, `en-revision`, `aprobada`, `rechazada`) y los QR revocados siguen en 404 (S2A-4). El QR de **mueble** ya resolvía a la versión publicada vigente: no cambia. **ASUMIDO:** el aviso no enlaza a la versión nueva (la pieza puede no existir en ella); si se quiere el enlace, pide otra enmienda. Consecuencia conocida: desde la ficha de una pieza de una versión reemplazada, el enlace al mueble abre la versión vigente.
- **S2A-5. Frontera de imports actualizada (enmienda a B9 y PB-13):**
  - Fuera de `src/persistence/` y `src/server/`, nada de `src/` importa `src/persistence/` (en particular `src/app/`, `src/components/`, `src/lib/`, `src/engine/` y `src/pdf/`).
  - Solo `src/server/datos.ts`, `src/persistence/sql/` y `db/` importan la implementación SQL.
  - Ningún módulo de cliente (`"use client"`) importa `src/server/`.
- **S2A-6. `/p/[qrId]` dinámica.** Se saca `generateStaticParams`: cada pedido resuelve contra la base.
- **S2A-7. `modelId` del Olmo constante.** `seedOlmo` no lee el .dae con `fs`: usa `OLMO_MODEL_ID` (`src/data/olmoModelId.ts`). Una prueba verifica que coincide con `modelId` de los bytes reales de `public/models/Olmo/olmo.dae`.

## 4. Pruebas

| Id | Qué verifica | Contra |
|---|---|---|
| S2A PB-14 | Para los 21 tipos del Olmo, los datos que recibe la ficha (el `QrTarget` que se pasa a `QrSheets`) son iguales a los de antes de la enmienda. Capturados en `tests/fixtures/s2a/ficha-olmo.json` antes de cambiar `lookup.ts` y comparados después. | memoria y PostgreSQL |
| S2A PB-15 | Los 24 qrId devuelven el mismo destino que `resolveQr` y la página responde igual (la ficha, o `notFound()` → 404). Un qrId inexistente devuelve lo mismo que hoy (`notFound()`). | memoria y PostgreSQL |
| S2A PB-16 | Con la base caída, `/p/<qrId>` lanza `PersistenciaNoDisponibleError`, lo registra, y `error.tsx` muestra el texto y el botón; no salen datos estáticos. | URL a un puerto cerrado de `127.0.0.1` (corre siempre) |
| S2A PB-17 | `OLMO_MODEL_ID` = `modelId` del .dae real. | estática |
| S2A PB-18 (v0.3) | Un mueble con la versión 1 reemplazada por la 2: los QR de pieza y de módulo de la versión 1 abren la versión 1 con `newerVersionAvailable: true`, la página responde 200 y el HTML muestra «Hay una versión más nueva de este diseño»; los de la versión 2 abren la 2 sin aviso; el QR de mueble abre la 2; un QR revocado de la versión 1 sigue en 404. | memoria y PostgreSQL |
| PB-13 (enmendada) | Frontera de imports de S2A-5 (`tests/persistence/puro.test.ts`). | estática |

La captura de S2A PB-14 se hizo en un commit propio (`359831c`), antes de tocar `lookup.ts`, para que el diff demuestre que no se ajustó a posteriori.

## 5. Criterio de cierre

- `typecheck`, `lint` y `npm test` en verde en un worktree limpio, con y sin `TEST_DATABASE_URL`. Se informan los dos conteos.
- S2A PB-14 a S2A PB-17 pasan.
- `CLAUDE.md` explica que sin `DATABASE_URL` la app usa la semilla en memoria.
- Prueba manual: `/p/<qrId>` de 3 tipos del Olmo en el celular con la base local, sin diferencias visibles.

## 6. Paradas

- **U-captura:** después del commit de captura de S2A PB-14, informar el conteo y seguir (hecho: 21 tipos).
- Sin dependencias nuevas. Si hiciera falta una, se para y se pide aprobación.

## 7. Cambios conocidos y deuda

- **Cambio conocido:** Sabrina (segundo fixture, solo local) deja de aparecer en `/p`: la semilla carga solo el Olmo. En `/p` el menú del visor ya no lista «Otros muebles» (en producción ya no listaba ninguno). `/` y `/qr` todavía la listan, y su link a `/p/sabrina-…` da 404.
- **Deuda:** `src/lib/qrScan.ts` y `/escanear` siguen leyendo el registro estático: no reconocerían un QR de un mueble que solo esté en la base.
- **Deuda:** `qrHref` (links entre fichas) sigue consultando el registro estático, pero solo para decidir si un qrId es de una importación (`/prueba/…`). Para un qrId de la base devuelve `/p/<qrId>`, como antes.
