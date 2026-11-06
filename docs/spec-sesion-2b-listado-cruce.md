# Especificación — Sesión 2b: conversión al listado y cruce con el .dae

Versión: v0.1 (6/11/2026), borrador para revisión del equipo. Sesión de solo especificación: sin código.
Antecedentes: `docs/spec-esquema-pdf.md` §6 (conversión), §7.2 (cruce), INV-12 e INV-14; `docs/test-plan-esquema-pdf.md` (TP-10, TP-11, TP-40 a TP-46, TP-60 a TP-63); `docs/plan-sesion-2-pdf.md` (orden acordado: 2b antes de 2); `docs/spec-motor-asociacion.md` §5.2 (`Observation`).
Si esta spec choca con `spec-esquema-pdf.md`, manda aquella.

---

## 0. Punto de partida (rama `pdf-fixture-sintetico`, 6/11)

- La sesión 1 dejó el validador (`validateCutListPdf`, `validateFurniture`, con `totals` por código y `status` de INV-14) y el parser.
- La rama del fixture sintético adelantó la parte pura de la sesión 2: `visionToTextInput`, `pageBatches`, `parseOcrWords` y la compuerta. **El OCR real sigue sin conectarse** (P-02, P-04 y P-12).
- **Pendiente antes de 2b, manual:** correr TS-13 (`npm run ocr:sintetico`) con una clave propia y anotar en `spec-fixture-sintetico.md` §12 si la forma de la respuesta de Vision coincide con la que asume `visionToTextInput`. No bloquea 2b: 2b no usa OCR.

## 1. Objetivo

Del resultado de `validateFurniture` (los PDF de un mueble) a:

1. un **listado**: un `PieceType` por código, sin `qrId` ni `moduleId` (§6);
2. un **cruce** de ese listado contra las observaciones del .dae del mismo mueble, con las razones de §7.2.

Código puro, sin red, sin dependencias nuevas. No toca el visor, las fichas, el importador, `FurnitureDef` ni `PieceType`.

**No es objetivo:** el motor de asociación, `listadoId` (TP-61 necesita la función del motor, RP9), la pantalla de revisión ni la sección de cortes (R4).

## 2. Contrato

```ts
// src/pdf/listing.ts
type ListedPiece = Omit<PieceType, "qrId" | "moduleId" | "edgeBanding"> & {
  edgeBanding: readonly EdgeId[] | null | "sin-definir";  // "sin-definir": columna ausente, ABIERTO (PDF-2)
  /** Filas del PDF de las que sale (documento, hoja, fila), para la revisión. */
  rows: { document: number; board: number; piece: number }[];
};

type Listing =
  | { status: "bloqueado"; reason: string }                          // INV-14: hay un rechazo, no hay conversión (TP-62)
  | { status: "borrador" | "publicable"; pieces: ListedPiece[] };    // borrador = "requiere revisión" (TP-63)

function toListing(furniture: FurnitureValidation): Listing;

// src/pdf/crossCheck.ts
interface CrossCheckFinding {
  reason: "codigo-sin-instancias" | "instancias-sin-fila" | "cantidad-no-coincide" | "medida-no-coincide" | "canteado-no-coincide";
  code: string;
  detail: string;
}
type EdgeCheck = "cumple" | "neutral" | "no-disponible" | "no-coincide";

function crossCheck(listing: ListedPiece[], observations: readonly Observation[], toleranceMm: number):
  { findings: CrossCheckFinding[]; edges: Record<string, EdgeCheck> };   // edges: por código
```

- **`"sin-definir"`** en vez de elegir `[]` o `null`: la columna ausente sigue ABIERTA (§6, PDF-2) y la conversión no la resuelve en silencio. Quien publique un listado con `"sin-definir"` tiene que decidir antes; TP-23 sigue `todo`.
- `Observation` se toma del motor (§5.2) **sin cambios**. Como `src/engine/` no existe, se crea solo `src/engine/types.ts` con el tipo, sin lógica (decisión a confirmar, D1).

## 3. Reglas de la conversión (§6)

| Campo | Regla |
|---|---|
| `code` | normalizado (`normalizeCode`); las filas sin código válido no entran (ya bloquean o dejan `borrador`) |
| `name` | el de la fila (INV-11 garantiza uno por código), NFC |
| `lengthMm` / `widthMm` | `finalL` / `finalA`, **sin reordenar** (INV-7, TP-10) |
| `thicknessMm` | el del tablero |
| `material` | `header.material`, tal cual |
| `quantity` | `totals` de `validateFurniture` (INV-12); con `total: null` la conversión queda `borrador` |
| `edgeBanding` | columna presente: `edgeStripsToEdgeIds` (`src/pdf/edges.ts`), `[]` si no hay marcas; columna ausente: `"sin-definir"` |
| `notes` | `null` |

Un código repartido entre tableros o PDF da **un** `ListedPiece` con todas sus filas en `rows`. Orden: el de `totals` (binario por código).

## 4. Reglas del cruce (§7.2)

Solo dentro del mismo mueble. Las observaciones sin código (mallas sueltas, `rawName: null`) no entran. El código de una observación se normaliza igual que el del PDF; uno anómalo (`__`) lo informa el motor, no el cruce.

| Caso | Razón o resultado |
|---|---|
| Código del listado sin observaciones | `codigo-sin-instancias` |
| Observaciones con un código que el listado no trae | `instancias-sin-fila` |
| `quantity` ≠ cantidad de observaciones | `cantidad-no-coincide` |
| {L, A, espesor} ordenado contra `sizeMm` (ya ordenado), alguna diferencia > `toleranceMm` | `medida-no-coincide` (TP-11, TP-44: k = 0,95 y 1,00 cumplen; 1,05 no) |
| Canteado con `edgeRunsMm` numérico: lados L y A marcados contra caras que miden L y A (± tol), como A8 | `cumple` o `no-coincide` → `canteado-no-coincide` (TP-45) |
| \|L − A\| ≤ tol | `neutral` (no se distingue lado L de lado A, TP-46) |
| `edgeRunsMm = "no-disponible"`, o `edgeBanding` `"sin-definir"` | `no-disponible`; no baja el nivel |

Las razones del cruce se suman a las de la validación para el nivel de cada fila (`dudosa` si hay alguna), salvo `instancias-sin-fila`, que se informa (no hay fila que marcar).

## 5. Pruebas

En `tests/pdf.listing.test.ts` y `tests/pdf.crossCheck.test.ts`; se sacan de `tests/pdf.todo.test.ts` las que se implementen.

| Id | Caso | Entrada | Esperado |
|---|---|---|---|
| TP-10 | L < A se conserva | fila sintética 100 x 1200 | `lengthMm = 100`, `widthMm = 1200` |
| TP-60 | Conversión del primer fixture | `olmo.json` | 21 piezas; códigos, medidas y cantidades iguales a las del mock; `edgeBanding = "sin-definir"` (nunca los lados del mock) |
| TP-62 | Bloqueo | un documento rechazado | `status: "bloqueado"`, sin piezas |
| TP-63 | Borrador | una fila `dudosa` | `status: "borrador"` |
| 2b-S1 | Fixture sintético | `esperado/S1.json` a `S3.json` como un mueble | piezas por código; F de S2 suma 2 + 4 = 6 en una sola pieza; S3 con `"sin-definir"` |
| TP-11 | El cruce ordena | fila 100 x 1200 x 18 contra `sizeMm` `[18, 100, 1200]` | cumple |
| TP-40 | Primer fixture contra su .dae | `olmo.json` + observaciones del .dae | 21 códigos con instancias; cantidades y medidas dentro de 2 mm; canteado `no-disponible` |
| TP-41 a TP-46 | Casos de §4 | observaciones escritas a mano | la razón de cada fila de §4 |
| 2b-S2 | Cruce del sintético | listado sintético + observaciones escritas a mano desde `esperado/` (no desde `fuente.ts`) | sin razones; una perturbación por razón |

**TP-40:** las observaciones salen del .dae real del primer fixture con `tests/helpers/loadModel.ts` (three y `DOMParser`, como A1 a A9), mediante un adaptador mínimo de prueba que arma `sizeMm` y `edgeRunsMm` a partir de `FurnitureModel`. Si eso obliga a escribir lógica del adapter del motor, TP-40 queda `todo` y se prueba solo con observaciones a mano (D2).

## 6. Decisiones abiertas

| Id | Pregunta | Propuesta |
|---|---|---|
| D1 | ¿Dónde vive `Observation`? | `src/engine/types.ts`, solo el tipo, copiado del motor §5.2 |
| D2 | TP-40 con el .dae real o solo a mano | Con el .dae real si alcanza con `loadModel.ts`; si no, `todo` |
| D3 | ¿`"sin-definir"` o un error al convertir una columna ausente? | `"sin-definir"`: deja ver el resto del listado sin decidir PDF-2 |
| D4 | ¿El cruce cambia el `level` de las filas o devuelve razones aparte? | Razones aparte (`findings`); el nivel combinado lo arma quien llama, para no tocar `validateFurniture` |

## 7. Fuera de esta sesión

- Conectar Vision a la app o mandar PDF reales: necesita P-02, P-04 y P-12 (`CLAUDE.md`, "Extracción OCR / Cloud Vision").
- Tesseract local, LLM, reconciliación y Eval Harness (sesión 3).
- Consultas 42 y 44: no tocar (el código sigue opaco; no cambian los QR de mueble y módulo).
