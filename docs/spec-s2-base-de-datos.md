# Especificación — S2: base de datos y repositorios

Versión: **v0.2 (17/11/2026), implementada.** Santiago la dio por aprobada al pedir la sesión 2 y aprobó en la sesión las paradas U-dependencias y U-esquema. Estado y precisiones de la implementación en el §10 (a revisar por el equipo).
Antecedentes: `docs/adr/ADR-001-stack.md`, `docs/adr/ADR-002-base-de-datos.md`, `docs/modelo-de-datos.md`, `docs/diagnostico-2026-11.md` (A2, A11), `src/data/types.ts`, `src/lib/lookup.ts`.
Condición: ADR-001 y ADR-002 aceptados.

---

## 1. Objetivo y alcance

Tener la persistencia del producto lista y probada **sin cambiar nada de lo que ve el usuario**: un esquema, sus migraciones, los repositorios y la prueba de que el primer fixture, guardado y leído de la base, produce exactamente la misma ficha que hoy.

Incluye:
1. Base PostgreSQL local en un contenedor.
2. Migraciones de las tablas marcadas «S2» en `docs/modelo-de-datos.md` §2: `tenant`, `project`, `furniture`, `design_version`, `module`, `piece_type`, `qr_code`, `stored_file`, `listing`, `engine_run`.
3. Repositorios con dos implementaciones: memoria y SQL.
4. Carga (`seed`) del primer fixture desde `olmoDef` y lectura de vuelta como `FurnitureDef`.

**No es objetivo:** que la app lea de la base (`/p/<qrId>` sigue estática y `lookup.ts` no se toca); el importador real; las tablas de S6; el almacenamiento de archivos (S3); sesiones (S4); SQL Server (queda preparado, no se prueba); una base que no sea local.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| S2-D1 | Código nuevo en `src/persistence/`: `ports.ts` (interfaces y excepciones), `memory/`, `sql/` (Kysely), `mappers.ts` (fila ↔ tipo del dominio, puro). Migraciones en `db/migrations/`. | Separa lo que conocen los casos de uso de lo que conoce la base (ADR-001, regla 2). |
| S2-D2 | Solo `src/persistence/sql/` y `db/` importan `kysely` y `pg`. | Sacar Kysely o cambiar de motor toca una carpeta (ADR-002, «Cómo revertir»). |
| S2-D3 | `docker-compose.yml` en la raíz con un servicio `db` (PostgreSQL, versión mayor fijada) en `127.0.0.1`. Scripts: `npm run db:up`, `db:down`, `db:migrate`, `db:seed`. | Un comando para tener la base. |
| S2-D4 | La URL de la base llega por `DATABASE_URL` (app y scripts) y `TEST_DATABASE_URL` (pruebas). Sin valor por defecto en el código. `.env.example` las documenta vacías. | Sin credenciales en el repo. |
| S2-D5 | **Guarda de base local:** `db:migrate` y `db:seed` lanzan `BaseNoLocalError` si el host de la URL no es `localhost` ni `127.0.0.1`. No hay bandera para saltearla en S2. | Migrar fuera de local requiere aprobación del equipo. |
| S2-D6 | Subconjunto común de SQL (ADR-002, decisión 3): ids como texto generados en la aplicación, documentos como texto JSON, fechas UTC, medidas en doble precisión. | Que SQL Server siga siendo posible. |
| S2-D7 | Los qrId del primer fixture (`olmo-mueble`, `olmo-mod-…`, `olmo-cNN`) se guardan como identificadores heredados. Los de mueble y de módulo van en columnas `legacy_qr_id` de `furniture` y `module`; los de pieza, en `qr_code`. | La ficha actual tiene QR en tres niveles y no cambia. El modelo objetivo solo da QR a las piezas (consulta 44). |
| S2-D8 | `newQrId()`: 128 bits aleatorios (`crypto.getRandomValues`), en base 32 sin caracteres ambiguos. Se implementa y se prueba; **no se usa para imprimir nada**. | ADR-004, decisión 6. |
| S2-D9 | El primer fixture se carga en una carpintería de desarrollo fija (`tenant` «desarrollo»). | No hay carpinterías reales hasta S4. |

## 3. Contrato

```ts
// src/persistence/ports.ts (sin imports de kysely, pg ni next)
export interface FurnitureRepository {
  /** Guarda un mueble completo como una versión de diseño nueva, en una transacción. */
  saveDesignVersion(tenantId: string, input: NewDesignVersion): Promise<DesignVersionRef>;
  /** Lee una versión como el `FurnitureDef` que usa la ficha. null si no existe en esa carpintería. */
  getFurnitureDef(tenantId: string, designVersionId: string): Promise<FurnitureDef | null>;
  publish(tenantId: string, designVersionId: string, publishedBy: string): Promise<void>;
}

export interface QrRepository {
  /** Única función sin tenantId: es la puerta de entrada. Devuelve la carpintería. */
  resolve(qrId: string): Promise<QrResolution | null>;
  create(tenantId: string, pieceTypeId: string): Promise<string>;
}

export interface RunRepository {
  save(tenantId: string, designVersionId: string, run: AssociationRun): Promise<void>;
  get(tenantId: string, designVersionId: string, engineRunId: string): Promise<AssociationRun | null>;
}
```

Excepciones con nombre (todas en `ports.ts`): `TenantRequeridoError` (tenantId vacío), `CodigoRepetidoEnVersionError(code)`, `QrDuplicadoError(qrId)`, `VersionInmutableError(designVersionId)` (modificar una versión publicada), `ReferenciaDeOtroTenantError`, `DocumentoInvalidoError` (un documento JSON leído no tiene la forma esperada), `BaseNoLocalError(host)`.

Las dos implementaciones lanzan las mismas excepciones en los mismos casos.

## 4. Requisitos

- **B1.** Las migraciones crean el esquema completo en una base vacía y son idempotentes (correrlas dos veces no cambia nada).
- **B2.** Toda tabla salvo `tenant` tiene `tenant_id` obligatorio y sus claves foráneas incluyen `tenant_id`.
- **B3.** (`design_version_id`, `code`) es único. El mismo código en dos muebles distintos es válido.
- **B4.** `qr_code.id` es único en toda la base.
- **B5.** Una versión publicada no se modifica: ni ella ni sus módulos, tipos de pieza o QR.
- **B6.** Una función de repositorio nunca devuelve filas de otra carpintería. La única sin `tenantId` es `QrRepository.resolve`.
- **B7.** `getFurnitureDef` devuelve un objeto igual, campo por campo, al que se guardó (incluidos `edgeBanding: null` y `[]`, que son distintos, y el orden de módulos y piezas).
- **B8.** Un `AssociationRun` guardado y leído es igual byte a byte a su `JSON.stringify` original.
- **B9.** `src/engine/`, `src/pdf/`, `src/app/`, `src/components/` y `src/lib/` no importan `src/persistence/`. `ports.ts`, `memory/` y `mappers.ts` no importan `kysely`, `pg` ni `next/*`.
- **B10.** `db:migrate` y `db:seed` se niegan a correr contra un host no local.

## 5. Criterios de aceptación y pruebas

Las pruebas de contrato (`tests/persistence/contract.ts`) son una sola batería que recibe una fábrica de repositorios. Corre siempre contra memoria. Corre contra PostgreSQL si `TEST_DATABASE_URL` está definida; si no, se saltea y lo dice (como las pruebas del segundo fixture). Cada prueba contra PostgreSQL usa un esquema propio y lo borra al terminar.

| Id | Requisito | Qué | Esperado |
|---|---|---|---|
| PB-1 | B1 | migrar una base vacía; migrar de nuevo | las diez tablas existen; la segunda corrida no aplica nada |
| PB-2 | B2 | inspección del esquema | toda tabla salvo `tenant` tiene `tenant_id NOT NULL` y cada FK lo incluye |
| PB-3 | B3 | dos tipos con el mismo código en una versión; el mismo código en dos muebles | `CodigoRepetidoEnVersionError`; el segundo caso se guarda |
| PB-4 | B4 | crear dos QR con el mismo id (forzado) | `QrDuplicadoError` |
| PB-5 | B5 | publicar y después guardar un tipo de pieza en esa versión | `VersionInmutableError` |
| PB-6 | B6 | guardar en la carpintería A; leer con la B | `null`; listar con B no trae nada de A |
| PB-7 | B6 | guardar un tipo de pieza que apunta a un módulo de otra carpintería | `ReferenciaDeOtroTenantError` |
| PB-8 | B6 | `tenantId` vacío en cada función | `TenantRequeridoError` |
| **PB-9** | B7 | **equivalencia de la ficha:** guardar `olmoDef`, leerlo | `toEqual(olmoDef)` |
| **PB-10** | B7 | **equivalencia de la resolución:** para cada qrId de `listQrEntries()`, resolver con un registro armado desde la base y con el actual | mismos `QrTarget`, uno por uno (`toEqual`) |
| PB-11 | B8 | guardar y leer el run del primer fixture (`buildRun`) | `JSON.stringify` idéntico |
| PB-12 | B7 | mueble sintético con `edgeBanding` `null`, `[]` y con lados; notas `null` | se leen distintos entre sí e iguales a lo guardado |
| PB-13 | B9 | prueba estática de imports | sin importaciones prohibidas |
| PB-14 | B10 | `assertLocalDatabase` con hosts `localhost`, `127.0.0.1`, un dominio y una IP pública | pasa en los dos primeros; `BaseNoLocalError` en los otros |
| PB-15 | S2-D8 | `newQrId()` mil veces | formato fijo, sin repetidos, 26 caracteres del alfabeto elegido |
| PB-16 | — | `git diff` de `src/app/`, `src/components/`, `src/lib/`, `src/data/`, `src/model/`, `src/engine/`, `src/pdf/` respecto de la rama base | vacío (verificación manual al cerrar, anotada en el informe) |

PB-9, PB-10 y PB-16 son la demostración de que lo que ve el usuario no cambió.

Al cerrar: `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` en verde, con y sin `TEST_DATABASE_URL`.

## 6. Paradas obligatorias

| Parada | Antes de | Qué aprueba el equipo |
|---|---|---|
| U-dependencias | `npm install` | `kysely`, `pg` y `@types/pg` (§7) |
| U-esquema | escribir los repositorios en SQL | la migración inicial, leída tabla por tabla contra `docs/modelo-de-datos.md` |

## 7. Dependencias nuevas (a aprobar)

| Paquete | Para qué | Alternativa descartada |
|---|---|---|
| `kysely` | Constructor de consultas tipado y migraciones, con dialectos del núcleo para PostgreSQL y SQL Server (kysely.dev/docs/dialects). | Prisma: su versión 8 todavía no tiene SQL Server. SQL a mano con `pg`: no cubre los dos motores. |
| `pg` | Controlador de PostgreSQL que usa `PostgresDialect`. | — |
| `@types/pg` (desarrollo) | Tipos de `pg`. | — |

Sin la aprobación, S2 puede entregar igual `ports.ts`, la implementación en memoria, los mapeadores y las pruebas PB-3 a PB-13 contra memoria. Queda pendiente todo lo de SQL.

## 8. Supuestos (ASUMIDO)

- PostgreSQL como motor (CA-2).
- Carpintería de desarrollo fija para el primer fixture (S2-D9).
- QR heredados de mueble y de módulo en columnas aparte (S2-D7).

## 9. Orden de trabajo

1. Parada U-dependencias.
2. `ports.ts`, excepciones y batería de contrato (falla: no hay implementaciones).
3. Implementación en memoria y mapeadores; PB-3 a PB-13 en verde.
4. `docker-compose.yml`, migración inicial. Parada U-esquema.
5. Implementación en SQL; la batería en verde contra PostgreSQL.
6. `db:seed`, PB-9 a PB-11 contra PostgreSQL.
7. Actualizar `CLAUDE.md` (la regla «sin base de datos» cambia) y `.env.example`.

## 10. Estado y precisiones de la implementación (17/11/2026, rama `fable/s2-base-de-datos`)

**Hecho:** los siete pasos del §9. `src/persistence/` (`ports.ts`, `rows.ts`, `mappers.ts`, `deps.ts`, `qrId.ts`, `localGuard.ts`, `memory/`, `sql/`), `db/` (migración inicial, `migrate.ts`, `seed.ts`, scripts), `docker-compose.yml`, `db:up`, `db:down`, `db:migrate`, `db:seed` y `.env.example`. PB-1 a PB-15 pasan; la batería de contrato corre contra memoria y contra PostgreSQL (17/11, base local descartable). PB-16: `git diff` vacío contra `fable/s1-docs`. Paradas: U-dependencias y U-esquema aprobadas por Santiago en la sesión. **Pendiente:** nada de esta spec; SQL Server sigue preparado y sin probar.

Precisiones, **a revisar por el equipo** (el §3 no alcanzaba para escribir PB-4 a PB-7):

| # | Precisión | Por qué |
|---|---|---|
| S2-I1 | `FurnitureRepository` suma `addPieceType(tenantId, designVersionId, { moduleId, piece })` y `listDesignVersions(tenantId)`. | PB-5 y PB-7 piden guardar un tipo de pieza suelto; PB-6 pide listar. |
| S2-I2 | Aparece `TenantRepository` (`create`, `get`) y la interfaz `Persistence`, que reúne los cuatro repositorios. | Sin carpintería no hay a qué referir las filas (S2-D9). |
| S2-I3 | Dos excepciones más: `TenantInexistenteError` (la carpintería no existe) y `MuebleInvalidoError` (pieza con módulo inexistente, módulo de otro mueble, versión nueva cuyo mueble no coincide). | Casos que el §3 no nombra y que las dos implementaciones tienen que resolver igual. |
| S2-I4 | `ReferenciaDeOtroTenantError` no distingue «es de otra carpintería» de «no existe». | Distinguirlo revelaría datos de otra carpintería; una clave foránea compuesta tampoco lo distingue. |
| S2-I5 | Columnas que el modelo de datos no nombra: `furniture.legacy_id` y `module.legacy_id` (los `id` del prototipo, `"olmo"`, `"mod-escritorio"`), `design_version.label` (`Furniture.designVersion`), `design_version.name`, `design_version.texture_base_url`, `piece_type.position` y `qr_code.ordinal`. | B7: sin ellas el `FurnitureDef` no vuelve igual, ni en el mismo orden. `ordinal` 1 es el QR que muestra la ficha. |
| S2-I6 | `furniture.newerVersionAvailable` no se guarda: se calcula (el mueble tiene publicada una versión con número mayor). | Modelo de datos §4.2. B7 vale para el resto de los campos. |
| S2-I7 | Un qrId es único entre `qr_code.id`, `furniture.legacy_qr_id` y `module.legacy_qr_id`. Lo comprueba el repositorio dentro de la transacción (la base solo garantiza la unicidad de cada columna). | B4 con los QR heredados de S2-D7. |
| S2-I8 | `QrRepository.resolve` devuelve `kind` (`furniture`, `module`, `piece`), la carpintería, la versión y su estado. Un qrId de mueble resuelve a la versión **publicada**; sin ninguna, `null`. | PB-10 con QR en tres niveles. Regla 6 del modelo: lo que ve el operario lo decide una publicación. |
| S2-I9 | `publish` pasa la versión de `borrador` a `publicada` y la anterior a `reemplazada`. Publicar una versión ya publicada lanza `VersionInmutableError`. No hay todavía «en revisión» ni «aprobada». | La máquina de estados completa es de S6. |
| S2-I10 | `QrRepository.create` sobre una versión publicada lanza `VersionInmutableError`. | Lectura estricta de B5. **A decidir:** si hace falta emitir un QR nuevo para una versión ya publicada (CA-12). |
| S2-I11 | Una versión nueva de un mueble existente no puede repetir los qrId de módulo ni de pieza de la anterior (`QrDuplicadoError`). | Un QR nunca cambia de destino (modelo de datos §4.2). |
| S2-I12 | Un tipo de pieza sin módulo: la columna lo admite, pero los repositorios de S2 no lo escriben y la lectura lo rechaza (`DocumentoInvalidoError`). | La regla «módulo único con el nombre del mueble» (modelo de datos §5) necesita un qrId de módulo que hoy nadie define. Queda para la sesión que cambie la ficha. |
| S2-I13 | `RunRepository.save` con un `engineRunId` ya guardado no hace nada. No compara `run.modelId` con el de la versión. | El run se identifica por su contenido. La comparación queda como propuesta. |
| S2-I14 | `newQrId`: base 32 de Crockford en minúsculas (sin `i`, `l`, `o`, `u`). El `public_id` de la versión usa el mismo generador. | S2-D8. |
| S2-I15 | `docker-compose.yml` pide la clave en `PFG_DB_PASSWORD` (entorno o `.env`, ignorado por git); imagen `postgres:17`. | S2-D4: sin credenciales en el repo. |
| S2-I16 | No hay repositorio para `listing` ni para `stored_file` (el §3 no los pide): S2 crea solo sus tablas. | El uso llega con S3 y con la lectura de PDF. |
| S2-I17 | `kysely` queda en 0.28.x. | La 0.29 declara Node 22 o superior y el equipo usa Node 20. |
| S2-I18 | `migrateToLatest(db, { schema })`: con un esquema propio hay que pasárselo al migrador. Las pruebas abren la conexión con `search_path` en su esquema. | Sin eso, el migrador de Kysely encuentra sus tablas de control en otro esquema y no las crea. |
| S2-I19 | Restricciones que el modelo no nombra: clave primaria (`tenant_id`, `id`) en toda tabla salvo `tenant` y `qr_code` (su `id` es clave global); un tipo de pieza solo puede apuntar a un módulo de su misma versión y un QR a un tipo de pieza de su misma versión (claves foráneas de tres columnas); (`tenant_id`, `furniture_id`, `number`) único. | B2 y B6 garantizados también por la base. La inmutabilidad (B5) la aplican solo los repositorios. |
| S2-I20 | `db:seed` crea la carpintería `desarrollo`, guarda el primer fixture con el `modelId` de su .dae y **lo publica** (autor `seed`). Si ya está, no hace nada. Las URL llegan por variables del entorno de la terminal; los scripts no leen `.env.local`. | S2-I8: sin versión publicada el qrId de mueble no resuelve. Mismo criterio que los scripts existentes. |

**Diferencia entre el pedido de la sesión y esta spec (decidida por Santiago el 17/11: manda la spec).** El texto de la sesión 2 pide que el visor, la ficha y el importador lean de la base por detrás y que las migraciones corran en el pipeline. Esta spec dice lo contrario en el §1 («no es objetivo que la app lea de la base; `lookup.ts` no se toca») y en B9, y no menciona ningún pipeline (el proyecto no tiene CI). **Manda la spec.** Conectar la ficha a la base o agregar un paso de migraciones en un pipeline necesita una enmienda de esta spec.
