# Plan de pruebas — Esquema de la salida del PDF de OpenCutList

Estado: **borrador** (28/10/2026). Sin implementar. Spec: `docs/spec-esquema-pdf.md` (las referencias INV-, RP- y § son de ahí).

## Alcance y entorno

- vitest + jsdom, como el resto (`npm test`). Los módulos de `src/pdf/` son puros: no necesitan DOM.
- Fixtures:
  - **Olmo** (en el repo): `tests/fixtures/pdf/olmo.json`, transcripción manual de los 3 PDF de OpenCutList y de la planilla.
  - **Segundo fixture** (local, ignorado): `Sabrina/fixtures/sabrina.json`. Las pruebas que lo usan se saltean si falta la carpeta, como `tests/sabrina.test.ts`.
  - **Sintéticos**: se derivan en la prueba copiando el fixture del Olmo y cambiando **un** campo (mutación mínima). No se escriben archivos nuevos con datos inventados salvo los elementos de texto del parser (TP-50).
- El .dae se usa a través de las `Observation` del adapter del motor (`docs/spec-motor-asociacion.md` §5.2). Mientras el adapter no exista, los casos de §7.2 (TP-40 a TP-46) usan `Observation` escritas a mano.

## Cobertura objetivo

Por criterio, no por porcentaje de líneas:

1. Cada invariante INV-0 a INV-14: al menos **un caso que cumple y uno que falla**.
2. Cada razón del catálogo (spec §7.3): al menos **un caso** que la produce, y ningún caso que la produzca sin motivo.
3. Cada fila de las tablas §7.1 y §7.2: un caso.
4. Los dos fixtures reales completos: 0 razones en el Olmo salvo las esperadas (abajo).
5. Porcentaje de líneas: **a definir con el equipo** después de la primera implementación; no se fija ahora.

## Casos

### Lectura y estructura

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-01 | Olmo completo válido | `olmo.json` (3 documentos) | INV-0 a INV-13 cumplen; 21 códigos; 0 filas `dudosa` por estructura |
| TP-02 | "Ajustadas" no entra | documento con `columns.adjusted: true` | el esquema no tiene campo de ajustadas; `finalL`/`finalA` son los de "Finales" |
| TP-03 | INV-1 cumple | tablero Blanco nature 18 del Olmo | Σ cantidades = 20 = `pieceCount` |
| TP-04 | INV-1 falla | mismo tablero con una cantidad +1 | `suma-tablero-no-coincide` |
| TP-05 | INV-2 cumple con varios tableros | sintético: un material con `count: 2` y dos hojas | Σ `pieceCount` = `parts` |
| TP-06 | INV-2 falla | resumen con `parts` −1 | `suma-resumen-no-coincide` |
| TP-07 | INV-2 falla por hojas | `count: 2` con una sola hoja | `suma-resumen-no-coincide` |
| TP-08 | INV-3 cumple | diagramas del Olmo | cada letra coincide con su cantidad |
| TP-09 | INV-3 falla | una letra con `count` −1; y una letra en el diagrama sin fila | `diagrama-no-coincide` (los dos subcasos) |
| TP-16 | INV-5 | dos filas con la misma letra en un tablero | `letra-duplicada-en-tablero` |
| TP-17 | INV-8 | pieza con L mayor que el tablero | `pieza-mayor-que-tablero` |
| TP-18 | INV-13 | `efficiencyPct: 101`; y `fillRatePct ≠ efficiencyPct` | `porcentaje-invalido` en el primero; **ninguna** razón en el segundo |
| TP-19 | INV-0 | `null` sin entrada en `pending`; cantidad 0; cantidad 1,5 | `esquema-invalido` en los tres |

### L y A

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-10 | L < A se conserva | sintético: fila con `finalL: 100`, `finalA: 1200` | `PieceType.lengthMm = 100`, `widthMm = 1200`; ninguna razón |
| TP-11 | El cruce con el .dae ordena | misma fila contra una `Observation` con caja `[18, 100, 1200]` | cumple medidas |

### Varios tableros y unicidad

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-12 | Código en dos tableros (INV-12) | sintético: código con 1 en la hoja 1 y 3 en la hoja 2 | `quantity = 4`; ninguna razón |
| TP-13 | INV-4 | código repetido en dos filas de un tablero | `codigo-duplicado-en-tablero`, las dos filas `dudosa` |
| TP-14 | INV-11 medidas | código en dos tableros con `finalA` distinta | `codigo-con-distintas-medidas` |
| TP-15 | INV-11 nombre y canteado | ídem con `name` distinto; ídem con `edges` distinto | `codigo-con-distinto-nombre`; `codigo-con-distinto-canteado` |
| TP-36 | INV-10 | un código del PDF de Gaudi copiado al de Blanco nature | `codigo-con-distinto-material` |
| TP-37 | INV-6 | código con letra K en la hoja 1 y L en la hoja 2 | `letra-inconsistente`, `dudosa` (no rechazo) |

### Cantos

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-20 | Mapeo s1–s4 | fila con las cuatro marcas | `edgeBanding = ["corto-A","corto-B","largo-A","largo-B"]` (orden alfabético de §5.1 del motor) |
| TP-21 | Una marca por subcolumna | cuatro filas, una marca cada una | s1 → `largo-B`, s2 → `largo-A`, s3 → `corto-A`, s4 → `corto-B` |
| TP-22 | Columna presente sin marcas | fila con s1–s4 `null` | `edgeBanding = []` |
| TP-23 | Columna ausente | documento con `columns.edgeStrips: false` (como el Olmo) | **PENDIENTE de PDF-2**: `null` o `[]`. Sin cambio en el `listadoId` del segundo fixture hasta decidirlo |
| TP-24 | INV-9 falla | `columns.edgeStrips: false` con una fila que trae `EdgeStrips` | `cantos-inconsistentes` |
| TP-25 | Texto de canto | celda sintética "Canto Gaudi ~ 0 mm x 22 mm" | `material: "Gaudi"`, `widthMm: 22`, `thicknessText: "~ 0 mm"`; ningún número de espesor |
| TP-26 | Íconos ignorados | elementos de texto con el ícono del encabezado de canto movido de columna | el resultado depende solo de la posición x de la marca |

### Código

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-30 | Canónico | `0001-01-M01-C04` | válido |
| TP-31 | Canónico con `_` inicial | `_0001-01-M01-C04` | válido |
| TP-32 | Anómalo: `__` final | `_0001-01-M01-C01__` | `nombre-anomalo`, `dudosa` |
| TP-33 | Anómalo: inicial, final, ambos | `__C`, `C_`, `__C__` | `nombre-anomalo` en los tres |
| TP-34 | Código partido con ícono | elementos de texto "0001-01-", ícono, "M01-C01" en dos líneas | `0001-01-M01-C01` |
| TP-35 | Ausente y formato inválido | designación vacía; `0001-1-M01-C04` | `codigo-ausente`; `formato-invalido` |

### Cruce con el .dae

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-40 | Olmo contra su .dae | `olmo.json` + `Observation` del .dae del Olmo | 21 códigos con instancias; cantidades y medidas cumplen (tolerancia 2 mm); canteado `no-disponible` (sin caras `Canto_*`, columna ausente). El C01 del .dae es anómalo: lo informa el motor, no esta lectura |
| TP-41 | Sin instancias | código del PDF que no está en el .dae | `codigo-sin-instancias` |
| TP-42 | Instancias sin fila | .dae con un código que el PDF no trae | `instancias-sin-fila` |
| TP-43 | Cantidad | total 2 contra 3 instancias | `cantidad-no-coincide` |
| TP-44 | Medidas en el borde | A del listado ± k·tol, k = 0,95 / 1,00 / 1,05 (como P8 del motor) | cumple / cumple / `medida-no-coincide` |
| TP-45 | Canteado | `Observation` con caras de canto que miden L dos veces; fila con una sola marca en lado L | `canteado-no-coincide` |
| TP-46 | Canteado neutral | pieza con \|L − A\| ≤ tol | ninguna razón de canteado |

### Fuentes

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-50 | Parser de `TextoPdf` | elementos de texto sintéticos (texto + x, y) armados a mano desde `olmo.json` | `CutListPdf` igual al fixture |
| TP-51 | Determinismo | TP-50 dos veces | JSON idéntico byte a byte |
| TP-52 | Sin capa de texto | PDF del Olmo real (solo local; los PDF no se commitean) o un PDF sin `/Font` | `{ ok: false, reason: "sin-capa-de-texto" }`; no llama a OCR |
| TP-53 | `OcrLlm` nunca es segura | salida simulada de OCR idéntica al fixture | todas las filas `dudosa` con `origen-ocr` |
| TP-54 | `OcrLlm` con JSON inválido | salida simulada sin `boards` | rechazo `esquema-invalido`; no se repara |
| TP-55 | Extracción real de `TextoPdf` | PDF de OpenCutList **con** texto | **PENDIENTE**: no hay ninguno (consulta 58) |

### Listado y `listadoId`

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-60 | Conversión del Olmo | `olmo.json` | 21 `PieceType`; códigos, medidas y cantidades iguales a las del mock; `edgeBanding` según TP-23 (PENDIENTE de PDF-2), nunca los lados del mock |
| TP-61 | `listadoId` reutiliza §5.1 | listado de TP-60 | mismo hash que la función del motor sobre los mismos `PieceType` (sin función propia) |
| TP-62 | Bloqueo por rechazo | documento rechazado | no hay conversión |
| TP-63 | Bloqueo por dudosa | una fila `dudosa` | conversión disponible solo como borrador, marcada "requiere revisión" |

### R4 y privacidad

| Id | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| TP-70 | Casillas de R4 (supuesto PROVISORIO, spec §9) | tablero Gaudi del Olmo | 10 casillas `(pdfId, 1, letra, n)`; dos por letra A–D, una por E y F |
| TP-71 | Segundo fixture | `Sabrina/fixtures/sabrina.json` (si existe) | INV-0 a INV-13 cumplen; se saltea si falta la carpeta |
| TP-72 | Nada privado en el repo | `git ls-files` | ningún archivo bajo `Sabrina/` ni ningún `.pdf` bajo `public/models/` |

## Fuera de este plan

- La pantalla de revisión de filas `dudosa` y la de checks de R4 (se especifican aparte).
- La elección de librería de extracción de `TextoPdf` y del proveedor de `OcrLlm`.
