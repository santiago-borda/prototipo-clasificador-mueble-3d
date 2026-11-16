# Spec — Spike: carga por CSV de OpenCutList (v0.2, a aprobar)

Rama `proto-csv-opencutlist` (desde `main`, sin tocar `ocr-revision-real` ni `proto-ocr-real`). **Descartable**: muestra el flujo si Casa Mueble aprueba el CSV en lugar del PDF; no es producción. Antecedentes: `docs/spec-importador-prueba.md`, `docs/spec-esquema-pdf.md` (§5 a §7), spec-motor §5. Fixture: `tests/fixtures/csv-ocl/gabinete/`; **su `README.md` es la fuente de verdad**.

## 1. Reutilizado y nuevo
**Sin cambios:** `ImportStore` (memoria, local, Blob), la clave `x-import-key` (el `guard` de `createImportApi`), la subida directa al Blob, `parseDaeFile` y el visor 3D, `EdgeBandingDiagram` (ya es proporcional), `qrcode`, `normalizeCode` (`src/pdf/code.ts`), `edgeStripsToEdgeIds` (`src/pdf/edges.ts`), `crossCheck`, `associatePass1`, `indexDae`, `listadoId`.
**P2, aprobado: cambio mínimo fuera del spike, en un commit aparte.** `observeDae` importa `node:crypto` (vía `modelId`) y no corre en el navegador. Se separa `observeDaeWithId(bytes, modelId)`, sin crypto; `observeDae(bytes)` = `observeDaeWithId(bytes, modelId(bytes))` y no cambia por fuera. En el navegador, `modelIdBrowser(bytes)` usa `crypto.subtle` con la misma regla `\r\n` → `\n`. Ese commit trae su prueba de equivalencia (C14). El servidor vuelve a calcular el `modelId` del .dae guardado y, si no es igual al del cliente, la carga no pasa a `en-revision`.
**Nuevo, aislado en `src/proto-csv/`** (puro, sin React ni three; `svg.ts` usa `DOMParser`): `header.ts`, `parse.ts`, `reasons.ts`, `review.ts` (nivel por tipo), `svg.ts`, `labels.ts`, `paths.ts`. Rutas `src/app/api/proto-csv/…`, páginas `src/app/backoffice/csv/…`.
**P3, aprobado: Blob compartido con Production.** Las rutas del spike solo leen y escriben bajo `proto-csv/`. Toda clave pasa por `protoPath(…)`, que lanza un error si la clave no empieza con `proto-csv/<id16>/` o si trae `..`, `\` o `//` (C13). Tope propio de 20 cargas; M1 termina borrando su carga.

## 2. Contrato del parser
```ts
parseOclCsv(text: string): CsvParse   // pura y determinista: misma entrada, mismo JSON
type CsvParse =
  | { ok: false; reason: "csv-vacio" | "lista-de-instancias" | "columna-faltante" | "columna-ambigua" | "unidad-no-soportada";
      column?: string; message: string }               // mensaje accionable, en español
  | { ok: true; listing: CsvListing; edgeRows: EdgeRow[]; issues: CsvIssue[] };
type CsvListing = { status: "borrador" | "publicable"; pieces: CsvPiece[]; excluded: CsvExcluded[] };
type CsvPiece = Omit<ListedPiece, "rows"> & { rows: []; csvRows: number[]; letter: string; rawLA: [number, number] | null;
  edgeLabels: { material: string; widthMm: number | null; thicknessText: string }[] };
```
- `CsvPiece` es asignable a `ListadoRow` y a `ListedPiece`: **`listadoId` no cambia de definición** (mismos campos, misma serialización). `rows: []` porque no hay hojas de PDF; `crossCheck` no las lee.
- Campos: `code` = Designación normalizada; `lengthMm`/`widthMm`/`thicknessMm` = **finales** (Longitud, Anchura, Grosor), **sin reordenar** (RP2); `quantity` = Cantidad (entero ≥ 1); `material` = Nombre del material (NFC); `notes: null`.
- **Cantos.** Orden de columnas verificado contra los íconos del PDF (README): Long. borde 1 = inferior = `largo-B`, Long. borde 2 = superior = `largo-A`, Ancho borde 1 = izquierdo = `corto-A`, Ancho borde 2 = derecho = `corto-B`. Se arma un `EdgeStrips` s1–s4 y pasa por `edgeStripsToEdgeIds`; celda vacía = sin canto. **No** se usa el orden de la ventana "Tiras de cantos" de OpenCutList (es otro). Con las columnas presentes nunca sale `"sin-definir"` ni `null`. La celda `Canto_Blanco (0,2 mm x 22,0 mm)` es material, espesor y ancho, en ese orden. El ancho (22,0) se toma como número. El espesor viene **redondeado a un decimal** (0,22 configurado → 0,2), así que se guarda solo como texto (`thicknessText`, como en el PDF) y nunca se usa como dato exacto ni entra al hash.
- `rawLA` = crudas (las "Ajustadas" del PDF): informativas, fuera del hash. Solo se usan para el SVG, con tolerancia ≥ 0,1 mm.
- **`name` (P1, aprobado):** el CSV no trae nombre de pieza (Designación es el código). Se toma `Descripción` si no está vacía; si no, `""` con el aviso `nombre-ausente` (no se inventa). **Consecuencia aceptada: el `listadoId` del mismo mueble difiere entre la vía CSV y la vía PDF** (el PDF trae nombre; el CSV, espesor por pieza). La definición es la misma, el valor no. **No se resuelve en este spike.**
- **Encabezado:** se normaliza (NFC, minúsculas, sin tildes, espacios colapsados) y cada campo se busca por regex, sin orden fijo (`/^(longitud|ancho) de(l)? borde ([12])$/`, `/^nombre del material$/`, …). Las columnas no usadas (las dos `Etiquetas`) se ignoran. Dos columnas para un campo usado → `columna-ambigua`. Sin `Cantidad` y con `Camino`/`Instancia` → `lista-de-instancias` ("Exportaste la Lista de instancias: exportá «Listado de piezas»"). Si falta una de las 4 de borde → `columna-faltante` ("desmarcá «ocultar la columna de cantos» en Opciones de OpenCutList y volvé a exportar").
- **Valores:** `^\d+(,\d+)? mm$`; otra unidad (cm, pulgadas, fracciones) → rechazo `unidad-no-soportada`. El área (`m²`) no se lee.
- **Filas `Tipo de material = Canto`** → `edgeRows` (`code`, lado, cantidad, largo final): dan los metros de canto (gabinete: 8 filas, 10 tramos contando cantidades, 5764 mm) y se cruzan con las marcas de la pieza; si no coinciden → `fila-canto-no-coincide`. `No.` se guarda solo para el SVG (es local de cada material).
- **Razones de fila** (catálogo cerrado; un código con razón va a `excluded` y el listado queda `borrador`, como en `toListing`): `codigo-ausente`, `formato-invalido`, `nombre-anomalo`, `valor-invalido`, `codigo-repetido`, `tipo-material-no-soportado` (todo lo que no es `Tablero` ni `Canto`), `canto-ilegible`, `fila-canto-no-coincide`.

## 3. Cruce y nivel
En el navegador: `observeDaeWithId` → `associatePass1({ listado: pieces, excludedCodes, toleranceMm: 2 })` → `crossCheck` (canteado). Nivel por tipo (`review.ts`): **`segura` solo si** el código está en `pieces`, todas sus instancias salen `segura` en la pasada 1 y `crossCheck` no da hallazgos con `affectsLevel`. Si no, sale `dudosa`, con todas las razones (CSV, motor y cruce). Sin IA: nada propone ni decide. El servidor revalida el CSV, calcula `listadoId`, `modelId` y los sha256. El cruce llega del cliente y queda marcado `validadoEn: "cliente"`, como hoy. **Canto en el gabinete:** el .dae usa `Canto_Blanco`, que cumple `CANTO_MATERIAL` (`^Canto_`): el canteado se compara (`cumple` o `no-coincide`), **no** sale `no-disponible`. Los materiales internos de SketchUp (`edge_color000255` y similares) no cumplen esa regex y se ignoran.

## 4. Estados y pantallas
`subiendo` → (encabezado inválido o `modelId` distinto: **rechazo** con el mensaje) → `en-revision` → `aprobado` | `rechazado` → (desde `aprobado`) `publicado-simulado`. El estado vive en eventos que no se sobrescriben: `proto-csv/<id>/eventos/<n>-<estado>.json`; vale el último. **Rechazo = limpieza:** si el servidor rechaza una carga, borra todo lo ya subido bajo `proto-csv/<id>/` (con `protoPath`, nunca fuera de ese prefijo). Si el borrado falla, la carga sigue existiendo y **cuenta** para el tope de 20 (el tope cuenta los prefijos `proto-csv/<id>/` que existan, tengan o no `informe.json`), y el fallo queda registrado en el log. Archivos crudos: `listado.csv`, `modelo.dae`, `texturas/*`, `diagrama-<material>.svg`, más `informe.json` con el sha256 de cada archivo.
1. **`/backoffice/csv`** (con clave): CSV, .dae, texturas (varias), SVG opcional + elegir su material (de los del CSV). Valida en el navegador antes de subir y muestra el rechazo o el informe.
2. **`/backoffice/csv/<id>` "En revisión"**: tabla (código, L × A × e, cantidad, material, canto, estado `segura`/`dudosa` + razones). Al elegir una fila se muestra el esquema de canteado proporcional con los lados pintados y la pieza resaltada en el visor 3D. **Aprobar** solo con 0 dudosas (misma regla que `assertPublicable`); **Rechazar** siempre, con motivo. **Con 0 dudosas y sin edición, la revisión humana se limita a aprobar o rechazar.** Resolver dudosas (corregir datos, aceptar una fila dudosa, editar el listado) queda fuera de alcance: con alguna dudosa solo se puede rechazar.
3. **`/backoffice/csv/<id>/publicar`** (solo `aprobado`): un QR por tipo (`https://taller-test.casamueble.com.ar/q/<qrId>`, `qrId` = `<id8>-c03`) y N etiquetas por tipo según Cantidad ("C01 · 1/2", medidas, canto). Marca "VISTA PREVIA — NO SE IMPRIME", sin botón de imprimir. El dominio es **solo texto** en la vista previa: una constante de prueba que no se usa para desplegar y nunca es `NEXT_PUBLIC_BASE_URL` ni el de producción.
4. **Placa (opcional, si hay SVG del tablero):** `OCL_PART` en orden de documento, `<path>`/`<rect>` + `<text>` (la letra), 1 unidad = 1 mm, sin confiar en los `id` (se repiten). Letra → código por (material elegido, `No.`). Cada pieza se compara con las crudas (±0,1 mm) **en las dos orientaciones** (L × A y A × L: una pieza puede estar rotada en la placa); se avisa solo si no coincide ninguna de las dos. `OCL_CUT` (si está): cada `<line>` con x1, y1, x2, y2, redondeadas a 0,1 mm. Se dibujan y se suman (gabinete: 10 líneas, ~11,32 m, igual que el Resumen del PDF). Los **niveles** (1 = refilado y franja, 2 = horizontales entre piezas, 3 = verticales cortas) se muestran como lectura geométrica rotulada "no confirmada". **No se presenta ningún orden de corte**: el orden real del taller no está confirmado (R4, consultas 35 a 37). El SVG solo sirve para esta vista: no entra al listado ni al nivel.

## 5. Pruebas (vitest, sin red; `tests/proto-csv/`)
| # | Caso | Esperado |
|---|---|---|
| C1 | `gabinete-prueba-canto.csv` | `publicable`; 4 tipos, 5 piezas (C01 × 2); medidas finales, materiales y cantos = README; 8 filas de canto (A a H; 10 tramos contando cantidades), 5764 mm; ancho 22, espesor solo texto |
| C2 | `gabinete-prueba-listainstancias.csv` | rechazo `lista-de-instancias` |
| C3 | Encabezado: columnas permutadas, tildes/mayúsculas, `de`/`del`; sin una de borde; campo duplicado | igual que C1; `columna-faltante` con el mensaje de Opciones; `columna-ambigua` |
| C4 | `cm`, pulgadas, `2,0` en Cantidad, medida vacía | `unidad-no-soportada`; `valor-invalido` |
| C5 | `_…C01__`, código mal formado, repetido, `Madera maciza`, fila de canto sin marca | cada razón; el código va a `excluded`; `borrador` |
| C6 | Mismo texto dos veces; filas permutadas; L < A | JSON idéntico; mismo `listadoId`; L y A intactos |
| C7 | `listadoId(pieces)` contra filas escritas a mano | igual |
| C8 | Cruce con `gabinete-prueba-opencutlist.dae` | 5 instancias y 4 tipos `segura`; canteado `cumple` en C01 a C03 y C04 sin canto (no `no-disponible`) |
| C9 | CSV con C04 × 2 | C04 `dudosa`; Aprobar bloqueado |
| C10 | `diagrama-blanco18.svg` | 4 piezas (A, B, C, C) = C03, C02, C01 × 2 dentro de ±0,1 mm de las crudas; 10 cortes, suma 11,32 m ± 0,01 m (medido: 11,317) |
| C10c | **Sintético**: copia del SVG vigente con A rotada 90° (escrita en la prueba, que lo dice) | sin aviso; con A rotada y 1 mm más grande, aviso |
| C10b | **Sintético**: copia del SVG vigente con B agrandada 1 mm, escrita en la prueba (que lo dice) | aviso "el SVG no coincide con el CSV" |
| C11 | API con memoria | clave (401/503); sha256 y `modelId` en `informe.json`; eventos; transición inválida → 409 |
| C12 | QR y etiquetas | todas las URL empiezan con `https://taller-test.casamueble.com.ar/q/`; 5 etiquetas |
| C13 | `protoPath` y rutas del spike | rechazan `importaciones/…`, `proto-csv/../…`, otro prefijo e id inválido; ningún `put`/`get`/`list`/`delete` del store en memoria sale de `proto-csv/` |
| C14 | Equivalencia (commit de P2) | mismos bytes del .dae → `observeDae` (Node, `node:crypto`) y `observeDaeWithId` + `modelIdBrowser` (`crypto.subtle`, entorno jsdom) dan la misma `DaeObservation` (`toEqual`); con `\r\n` también |
| C15 | Rechazo con limpieza | CSV de encabezado inválido y .dae con modelId distinto: tras el rechazo no queda ninguna clave bajo proto-csv/<id>/ en el store en memoria. Con un delete que falla, la carga sigue existiendo, cuenta para el tope de 20 (el tope cuenta los prefijos proto-csv/<id>/ que existan, tengan o no informe.json) y el fallo queda registrado en el log. |
| C16 | Fixture contra README | nombres de la tabla, `viewBox` y grupos (`OCL_PART`, `OCL_CUT`) de cada SVG, 8 filas de canto |
| M1 | Manual en la preview de Vercel de la rama | subir el gabinete, revisar, aprobar, ver QR; el `modelId` del navegador real coincide con el del servidor; borrar la carga al final |

Las pruebas actuales de `observe` siguen pasando sin cambios. Verificación final: `typecheck`, `lint`, `test`, `build`.

## 6. Fuera de alcance
Producción y el importador real; fixtures de Olmo y Sabrina (llegan después); unificar el `listadoId` CSV/PDF (P1); editar datos en la revisión y resolver dudosas; impresión real; R4 (orden de cortes) y metros de canto como compra; pasada 2 del motor; validar el .dae en el servidor (más allá del `modelId`); otros idiomas o separadores de OpenCutList; cualquier IA u OCR (no se toca nada del OCR).

## 7. Precondiciones y hallazgos
- **Vercel (verificado el 16/11):** Preview tiene `BLOB_READ_WRITE_TOKEN` (mismo store que Production) e `IMPORT_UPLOAD_KEY`. Antes de M1 se revisa la protección de despliegue de la preview; si está activa, se avisa al usuario antes de probar.
- **Verificación del fixture contra el README (16/11, después de corregir la carpeta):**
  - Nombres: coinciden los 7 archivos de la tabla del README (`gabinete-prueba-canto.csv`, `gabinete-prueba-listainstancias.csv`, `gabinete-prueba-opencutlist.dae`, `diagrama-blanco18.svg`, `diagrama-canto.svg`, `diagrama-corte-blanco18.pdf`, `README.md`). `texturas/` existe y está vacía (el .dae no referencia ninguna imagen). No queda `diagrama-canto18.svg`.
  - `diagrama-blanco18.svg`: encabezado `width="2800.0mm" height="2070.0mm"`, grupo `OCL_CUT` con 10 `<line>` (suma 11,317 m), 4 piezas en `OCL_PART` como `<path>` con letras A, B, C, C.
  - `diagrama-canto.svg`: `width="75000.0mm" height="22.0mm"`, 10 `<rect>` en `OCL_PART`, sin `OCL_CUT`.
  - CSV: 8 filas de canto (A a H), 4 de pieza; .dae con materiales `Blanco_18`, `Canto_Blanco`, `Blanco_3_mm`.
  - **Esto se repite como prueba (C16):** una prueba lee la tabla de archivos del README y verifica que cada nombre exista y que el encabezado y las primeras líneas de cada SVG sean los de arriba; falla si el README y la carpeta se desalinean.
