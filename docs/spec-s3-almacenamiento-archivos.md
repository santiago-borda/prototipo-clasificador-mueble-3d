# Especificación — S3: almacenamiento de archivos

Versión: **v0.2 (21/11/2026).** v0.1 (17/11) era un borrador; Santiago aprobó avanzar con S3 el 21/11 («apruebo todo»), antes de leer la v0.2. Implementada en la rama `erp-integracion-minima` (sin push). Lo que cambió al implementarla está en el §9 (S3-I1 a S3-I6, **a revisar**).
Antecedentes: `docs/adr/ADR-003-almacenamiento-de-archivos.md`, `docs/modelo-de-datos.md` (entidad `stored_file`), `docs/spec-s2-base-de-datos.md`, `src/importer/store.ts`, `src/importer/blobStore.ts`, `docs/spec-importador-prueba.md`.
Condición: ADR-003 aceptado y S2 cerrada (tabla `stored_file` y repositorios).

---

## 1. Objetivo y alcance

Una sola forma de guardar y leer archivos (imágenes, .dae, zip, PDF), separada por carpintería, con integridad comprobada, detrás de una interfaz con adaptador local. **El importador de prueba se comporta igual que hoy.**

Incluye:
1. Interfaz `FileStore` y batería de contrato.
2. Adaptadores: memoria, disco local y Vercel Blob (los tres reusan el código de `ImportStore`).
3. Caso de uso `saveFile` / `readFile` con sha256 y metadatos en la base.
4. Reglas de tipo y tamaño por clase de archivo.

**No es objetivo:** adaptadores de S3 o de Azure Blob (se escriben cuando se sepa el alojamiento, CA-1); mover lo guardado en `importaciones/` o `proto-csv/`; rutas o pantallas nuevas; reducir imágenes; cambiar la subida directa del importador de prueba.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| S3-D1 | `FileStore` vive en `src/files/` (`store.ts`, `memory.ts`, `local.ts`, `blob.ts`, `keys.ts`, `rules.ts`, `usecases.ts`). `ImportStore` queda donde está y pasa a ser un alias de `FileStore` (misma forma: `put`, `get`, `list`, `delete`). | El importador no cambia y no hay dos interfaces iguales. |
| S3-D2 | Clave: `t/<tenantId>/archivos/<sha256 en hexadecimal>`. `fileKey(tenantId, sha256)` valida el formato de los dos y lanza `ClaveInvalidaError`. | ADR-003, decisión 3. Nadie arma una clave a mano. |
| S3-D3 | `saveFile` calcula el sha256 en el servidor (`node:crypto`). Si la clave ya existe, no vuelve a subir y devuelve el archivo existente. | Deduplicación; nunca se sobrescribe. |
| S3-D4 | `readFile` recalcula el sha256 de lo leído y lanza `ArchivoCorruptoError` si no coincide. | Integridad (misma regla que el spike de CSV al servir). |
| S3-D5 | Los metadatos se guardan con `FileRepository` (tabla `stored_file`, S2). El orden es: bytes primero, fila después. Una fila nunca apunta a bytes que no existen. | Si falla a mitad, queda un objeto sin fila (inofensivo), no una fila rota. |
| S3-D6 | Reglas por clase (`rules.ts`), como tabla de datos: tipos de contenido admitidos y tamaño máximo. Imagen: JPEG, PNG o WebP, 5 MB (ASUMIDO). Modelo .dae: 10 MB (el tope actual). Zip: 50 MB (ASUMIDO). PDF: 20 MB (ASUMIDO). | Un solo lugar para ajustar. |
| S3-D7 | El tipo real de una imagen se comprueba por sus primeros bytes, no por el nombre ni por lo que declara quien sube. | Un archivo con extensión falsa no entra. |
| S3-D8 | Adaptador local en `.file-data/` (se agrega a `.gitignore`), solo fuera de producción. Elegido con `FILE_STORE=local`, igual que hoy `IMPORT_STORE=local`. | Desarrollo sin red. |
| S3-D9 | La subida directa del navegador no entra en `FileStore` en S3. Se documenta como operación opcional futura (`issueUpload`), con las tres formas que toma según el proveedor. | ADR-003, consecuencias. Nada la necesita todavía. |

## 3. Contrato

```ts
// src/files/store.ts
export interface FileStore {
  /** Falla con `YaExisteError` si la clave existe: nunca se sobrescribe. */
  put(pathname: string, body: string | Uint8Array, contentType: string): Promise<void>;
  get(pathname: string): Promise<StoredFile | null>;
  list(prefix: string): Promise<string[]>;
  delete(pathnames: string[]): Promise<void>;
}

// src/files/usecases.ts (solo servidor: usa node:crypto)
export function saveFile(deps: FileDeps, tenantId: string, input: NewFile): Promise<StoredFileMeta>;
export function readFile(deps: FileDeps, tenantId: string, fileId: string): Promise<{ meta: StoredFileMeta; body: Uint8Array }>;
```

Excepciones con nombre: `ClaveInvalidaError`, `YaExisteError`, `ArchivoCorruptoError(fileId)`, `TipoNoPermitidoError(kind, contentType)`, `ArchivoDemasiadoGrandeError(kind, bytes, max)`, `ArchivoNoEncontradoError(fileId)`.

`YaExisteError` reemplaza al `Error` genérico que hoy lanza `put`. El mensaje que ve el usuario del importador no cambia (prueba PF-9).

## 4. Requisitos

- **F1.** Los tres adaptadores cumplen la misma batería de contrato.
- **F2.** `put` no sobrescribe.
- **F3.** Una clave siempre empieza con `t/<tenantId>/`. No se puede leer, listar ni borrar con la carpintería A algo de la B.
- **F4.** El mismo contenido guardado dos veces en una carpintería ocupa un objeto y una fila. En dos carpinterías, dos objetos.
- **F5.** `readFile` detecta bytes alterados.
- **F6.** Un archivo fuera de las reglas de su clase no se guarda, y no queda nada escrito.
- **F7.** El adaptador local rechaza rutas que salen de su carpeta.
- **F8.** El importador de prueba y el spike de CSV se comportan igual: mismas rutas de almacenamiento, mismas respuestas.
- **F9.** `src/files/store.ts`, `keys.ts`, `rules.ts` y `memory.ts` no importan `@vercel/blob`, `next/*` ni `node:*`.

## 5. Criterios de aceptación y pruebas

`tests/files/contract.ts`: una batería que recibe una fábrica de `FileStore`. Corre contra memoria y disco local (carpeta temporal). El adaptador de Vercel Blob se prueba con un cliente falso inyectado; no hay red (`tests/setup/sinRed.ts`).

| Id | Requisito | Qué | Esperado |
|---|---|---|---|
| PF-1 | F1, F2 | `put` dos veces en la misma clave, en cada adaptador | `YaExisteError`; el contenido es el primero |
| PF-2 | F1 | `get` de una clave que no existe; `list` por prefijo; `delete` de una clave que no existe | `null`; solo las del prefijo; no falla |
| PF-3 | F3 | `fileKey` con tenantId o sha256 mal formados (vacío, con `/`, con `..`, sha de 63 caracteres) | `ClaveInvalidaError` |
| PF-4 | F3 | guardar en A; `readFile` con B y el mismo `fileId` | `ArchivoNoEncontradoError` |
| PF-5 | F4 | mismo contenido dos veces en A; una vez en B | A: un objeto y una fila; B: otro objeto |
| PF-6 | F5 | alterar un byte en el almacenamiento en memoria y leer | `ArchivoCorruptoError` |
| PF-7 | F6 | imagen de 6 MB; un PDF declarado como imagen; un PNG con extensión `.jpg` | `ArchivoDemasiadoGrandeError`; `TipoNoPermitidoError`; se guarda como PNG |
| PF-8 | F7 | rutas con `..`, absolutas y con caracteres fuera de la lista | error; nada escrito fuera de la carpeta temporal |
| **PF-9** | F8 | las pruebas existentes `tests/importador*.test.ts` y `tests/proto-csv/` **sin modificar** | pasan |
| PF-10 | F8 | las rutas que escribe una importación completa, con el almacenamiento en memoria | las mismas cuatro bajo `importaciones/<id>/` |
| PF-11 | F9 | prueba estática de imports | sin importaciones prohibidas |
| PF-12 | S3-D5 | el repositorio falla al guardar la fila | no hay fila; el error se propaga; un segundo intento funciona |

PF-9 y PF-10 demuestran que el importador no cambió. Si alguna prueba existente necesita un cambio, se para y se consulta al equipo.

Al cerrar: `typecheck`, `lint`, `npm test` y `build` en verde.

## 6. Paradas obligatorias

| Parada | Antes de | Qué aprueba el equipo |
|---|---|---|
| U-alias | tocar `src/importer/store.ts` | que `ImportStore` pase a ser un alias de `FileStore` (es el único cambio en código existente) |

Sin dependencias nuevas.

## 7. Supuestos (ASUMIDO)

- Tamaños máximos de S3-D6.
- Sin borrado automático (CA-11).
- Vercel Blob sigue siendo el almacenamiento de producción (CA-1).

## 8. Orden de trabajo

1. `store.ts`, `keys.ts`, excepciones y batería de contrato.
2. Adaptadores de memoria y de disco; PF-1 a PF-3 y PF-8.
3. `rules.ts` y detección del tipo por bytes; PF-7.
4. `usecases.ts` con `FileRepository` en memoria; PF-4 a PF-6 y PF-12.
5. Parada U-alias; adaptador de Blob; PF-9 a PF-11.
6. Actualizar `CLAUDE.md`, `.gitignore` y `.env.example`.

## 9. Implementación v0.2 (21/11/2026)

**Hecho:** `src/files/` con `store.ts` (`FileStore`), `errors.ts`, `keys.ts` (`fileKey`, `tenantPrefix`), `rules.ts` (`REGLAS`, `tipoReal`), `memory.ts`, `local.ts`, `blob.ts` (cliente inyectable), `meta.ts` (`StoredFileMeta`, `FileRepository`), `usecases.ts` (`saveFile`, `readFile`, `readFileBySha256`) y `almacen.ts`; `FileRepository` (`persistence.files`) en memoria y en SQL sobre la tabla `stored_file` de S2 (sin migración nueva); `src/server/archivos.ts` (`almacenDesdeEntorno`). Pruebas: `tests/files/store.test.ts` (PF-1, PF-2 y PF-8 contra los tres adaptadores; Blob con un cliente falso), `tests/files/usecases.test.ts` (PF-3 a PF-7, PF-11, PF-12), `tests/files/almacen.test.ts` (S3-I1) y `tests/persistence/contractFiles.ts` (contrato de `stored_file` contra memoria y PostgreSQL). PF-9 y PF-10 se cumplen sin probar nada nuevo: el importador no se tocó.

- **S3-I1. Almacén de la integración con el ERP sobre `FileStore`** (no estaba en la v0.1, que es anterior a la integración). `createFileAlmacen` implementa el `Almacen` de la integración (zip y CSV de cada envío, por sha256) con `saveFile` / `readFileBySha256`. Lo elige `FILE_STORE`: vacía = la tabla `file_content` en la base, **como hasta ahora** (es el valor por defecto: nada cambia sin la variable); `blob` = Vercel Blob privado con `BLOB_READ_WRITE_TOKEN`; `local` = `.file-data/` (rechazada con `NODE_ENV=production`); otro valor = `ConfigArchivosError`. El zip se guarda como clase `zip` y el CSV como clase `csv` (nueva, 5 MB, ASUMIDO), con `uploadedBy: "erp"`.
- **S3-I2. `ImportStore` no se tocó (S3-D1 enmendada).** La v0.1 pedía que pasara a ser un alias de `FileStore`, con la parada U-alias. Para no tocar el importador, `FileStore` tiene sus propios adaptadores (copian la lógica de `ImportStore`, con `YaExisteError`). Unificarlos queda como propuesta (y su parada, vigente).
- **S3-I3. `expectedSha256`:** `saveFile` acepta el sha256 que declaró quien sube (el ERP) y, si no coincide con el calculado, lanza `Sha256DistintoError` sin escribir nada. La integración ya lo verificó antes; es una segunda barrera.
- **S3-I4. «Ya existe» en Vercel Blob:** con `allowOverwrite: false`, `@vercel/blob` lanza un `BlobError` con el mensaje del servicio; el adaptador lo reconoce por el texto «already exists» (ASUMIDO: no está documentado como un error con nombre). A verificar en la primera prueba manual con Blob. `saveFile` igual no vuelve a subir lo que ya tiene fila.
- **S3-I5. Los tipos de `stored_file` viven en `src/files/meta.ts`** y `src/persistence/ports.ts` los reexporta: `src/files/` no puede importar `src/persistence/` (PB-13, S2A-5). Por lo mismo, `createFileAlmacen` devuelve un tipo estructural igual a `Almacen`.
- **S3-I6. El adaptador local rechaza** también segmentos vacíos (`t//x`) y `.`, además de `..`, rutas absolutas y caracteres fuera de `[A-Za-z0-9._-/]`.
- **No hecho (fuera de la v0.2):** mover lo que ya está en `file_content` a `FileStore` (con `FILE_STORE` cambiado, los envíos anteriores no se encuentran: hay que volver a enviarlos); adaptadores de S3 o Azure; `issueUpload` (S3-D9); borrar archivos sin fila.
- **Para usar `FILE_STORE=blob` en Vercel:** el store de Blob es el mismo del importador (Production y Preview comparten `BLOB_READ_WRITE_TOKEN`); las claves van bajo `t/`, separadas de `importaciones/` y `proto-csv/`. Cargar la variable en Vercel es un cambio de despliegue: decisión del equipo.
