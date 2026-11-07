# Especificación — Sesión 2b: conversión al listado y cruce con el .dae

Versión: **v0.3 (7/11/2026), aprobada; implementada el 7/11** (rama `pdf-sesion-2b`). D1 a D5 resueltas (§6). Las precisiones que la implementación tuvo que tomar donde la spec no decía nada están en §8, a revisar por el equipo.
Antecedentes: `docs/spec-esquema-pdf.md` §6 (conversión), §7.2 (cruce), §7.3 (nivel y catálogo de razones), §11 (PDF-2), INV-12 e INV-14; `docs/test-plan-esquema-pdf.md` (TP-10, TP-11, TP-23, TP-40 a TP-46, TP-60 a TP-63); `docs/plan-sesion-2-pdf.md` (orden acordado: 2b antes de 2); `docs/spec-motor-asociacion.md` v3 §5.2 (`Observation`) y §5.3 (`Evidence`).
Si esta spec choca con `spec-esquema-pdf.md`, manda aquella.

---

## 0. Punto de partida (rama `pdf-fixture-sintetico`, 6/11)

- La sesión 1 dejó el validador (`validateFurniture`, con `totals` por código, `level` por fila y `status` de INV-14) y el parser.
- La rama del fixture sintético adelantó la parte pura de la sesión 2: `visionToTextInput`, `pageBatches`, `parseOcrWords` y la compuerta. **El OCR real sigue sin conectarse** (P-02, P-04 y P-12).
- **Pendiente antes de 2b, manual:** correr TS-13 (`npm run ocr:sintetico`) con una clave propia y anotar en `spec-fixture-sintetico.md` §12 si la forma de la respuesta de Vision coincide con la que asume `visionToTextInput`. No bloquea 2b: 2b no usa OCR.
- **Verificado el 7/11 (para D2):** `tests/helpers/loadModel.ts` corre en Node (vitest con jsdom): `tests/olmo.test.ts` y `tests/sabrina.test.ts` pasan (18 pruebas). El .dae del segundo fixture existe en local, en `Sabrina/Archivo Collada/`, ignorado por git (`git check-ignore`), igual que su fixture de PDF `Sabrina/fixtures/sabrina.json`.

## 1. Objetivo

Del resultado de `validateFurniture` (los PDF de un mueble) a:

1. un **listado**: un `ListedPiece` por código, sin `qrId` ni `moduleId` (§6 de spec-esquema);
2. un **cruce** de ese listado contra las observaciones del .dae del mismo mueble, con las razones de §7.2 de spec-esquema;
3. una función pura que **combina** el nivel de cada fila con los hallazgos del cruce.

Código puro, sin red, sin dependencias nuevas. No toca el visor, las fichas, el importador, `FurnitureDef`, `PieceType` ni `validateFurniture`.

**No es objetivo:** el motor de asociación, `listadoId` (TP-61 necesita la función del motor, RP9), la pantalla de revisión ni la sección de cortes (R4).

## 2. Contrato

### 2.1 Tipos del motor: fuente única (D1)

`Observation` (spec-motor v3 §5.2) y `Evidence` (spec-motor v3 §5.3) se definen **una sola vez**, en `src/engine/types.ts`, tal como están en esa spec. Esta spec **no los copia**: los referencia. Si spec-motor cambia, cambia `src/engine/types.ts` y 2b lo importa de ahí. `src/engine/` no existe hoy: se crea con ese archivo solo, sin lógica.

- Nombre: `src/pdf/types.ts` ya exporta otro `Evidence` (evidencia por campo de `OcrLlm`, spec-esquema §8). Son tipos distintos; el cruce importa el del motor con alias (`import type { Evidence as EngineEvidence } from "@/engine/types"`). No se renombra ninguno en esta sesión.
- Del cruce solo se usan estos campos de `Observation`: `modelId`, `instanceKey`, `rawName`, `sizeMm` y `edgeRunsMm`. Los demás no intervienen.

### 2.2 Listado

```ts
// src/pdf/listing.ts
type ListedEdgeBanding = readonly EdgeId[] | "sin-definir";
//   EdgeId[] con elementos: lados con canto
//   []                    : columna presente, sin marcas = "sin canto"
//   "sin-definir"         : columna ausente; NO es "sin canto" ni "sin dato" (D3, PDF-2)

type ListedPiece = Omit<PieceType, "qrId" | "moduleId" | "edgeBanding"> & {
  edgeBanding: ListedEdgeBanding;
  /** Filas del PDF de las que sale (documento, hoja, fila), para la revisión. */
  rows: { document: number; board: number; piece: number }[];
};

type Listing =
  | { status: "bloqueado"; furnitureId: string; reason: PdfReason }                       // INV-14 (TP-62)
  | { status: "borrador" | "publicable"; furnitureId: string; pieces: ListedPiece[] };    // borrador = "requiere revisión" (TP-63)

function toListing(furnitureId: string, furniture: FurnitureValidation): Listing;
```

- **`reason` del bloqueo:** la primera razón de `REJECTING_REASONS` (`src/pdf/reasons.ts`) entre los hallazgos de los documentos rechazados, en el orden de los documentos y de sus hallazgos. Sin documentos (`validateFurniture` también da `bloqueado`), `esquema-invalido`: no hay nada con la forma esperada.
- La conversión **nunca produce `null`** en `edgeBanding`: el PDF o trae la columna (lados o `[]`) o no la trae (`"sin-definir"`). `null` ("sin dato") sigue existiendo solo en `PieceType`, fuera de 2b.
- **Sin módulo.** `ListedPiece` no tiene `moduleId`, y ni la conversión ni el cruce lo deducen: tampoco de los grupos, capas ni nodos padre del .dae. La agrupación en módulos sigue siendo un supuesto del prototipo y la consulta 44 sigue sin tocar.

### 2.3 Cruce

```ts
// src/pdf/crossCheck.ts
// Códigos de src/pdf/reasons.ts, sin inventar otros. El tipo fuerza affectsLevel por razón.
type LevelReason = Extract<PdfReason, "codigo-sin-instancias" | "cantidad-no-coincide" | "medida-no-coincide" | "canteado-no-coincide">;
type InfoReason = Extract<PdfReason, "instancias-sin-fila" | "canteado-sin-definir">;   // canteado-sin-definir: D5

interface FindingBase {
  furnitureId: string;
  code: string;                  // código normalizado
  evidence: EngineEvidence[];    // qué se comparó y con qué valores (kind, result, detail), al menos una
}
type CrossCheckFinding =
  | (FindingBase & { reason: LevelReason; affectsLevel: true })    // baja el nivel de la fila de ese código
  | (FindingBase & { reason: InfoReason; affectsLevel: false });   // solo se informa (no hay fila, o es informativo)

type EdgeCheck = "cumple" | "neutral" | "no-disponible" | "sin-definir" | "no-coincide";

interface CrossCheckContext {
  furnitureId: string;   // id del mueble del listado
  modelId: string;       // id del modelo .dae de ese mueble (el de Observation.modelId); no tiene por qué ser igual a furnitureId
  toleranceMm: number;   // FurnitureDef.toleranceMm
}

function crossCheck(
  pieces: readonly ListedPiece[],
  observations: readonly Observation[],
  context: CrossCheckContext,
): { findings: CrossCheckFinding[]; edges: Record<string, EdgeCheck> };   // edges: por código

// src/pdf/level.ts
function combinarNivel(level: RowLevel, code: string, findings: readonly CrossCheckFinding[]): RowLevel;
```

**Clave del cruce: (mueble, código).** `modelId` y `furnitureId` son identificadores distintos: quien llama dice cuál es el modelo de ese mueble. El cruce empareja una fila con observaciones solo si la observación es de ese modelo (`Observation.modelId` = `context.modelId`) y coincide el código normalizado; los hallazgos salen con `context.furnitureId`. Un código no se interpreta fuera de su mueble (la colisión de códigos entre el primer y el segundo fixture es real, A5). Si llega una observación con otro `modelId`, `crossCheck` lanza un error tipado (`MuebleDistintoError`, con el `modelId` esperado y el recibido): mezclar muebles es un error de quien llama, no una discrepancia que se informa.

**Evidencia.** Cada hallazgo lleva al menos una `Evidence` del motor, con `kind` ∈ {`codigo`, `cantidad`, `medidas`, `canto`} (verificado el 7/11: los cuatro están en `Evidence.kind` de spec-motor v3 §5.3), `result` y un `detail` con los valores comparados (p. ej. `"L 1200 · A 550 · e 18 contra caja [18, 550, 1201,5]; tol 2"`). `rule` no se usa.

## 3. Reglas de la conversión (spec-esquema §6)

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

## 4. Reglas del cruce (spec-esquema §7.2)

Solo dentro del mismo mueble (§2.3). El código de una observación se normaliza igual que el del PDF (`_` inicial y `_` finales fuera, como `canonicalCode`); que un nombre venga anómalo (`__`) lo informa el motor o la verificación de desarrollo, no el cruce. Las observaciones con `rawName: null` (mallas sin componente) no entran al cruce. Una observación cuyo nombre no da un código válido tampoco entra.

| Caso | `reason` | `affectsLevel` | `Evidence.kind` |
|---|---|---|---|
| Código del listado sin observaciones | `codigo-sin-instancias` | sí | `codigo` |
| Observaciones con un código que el listado no trae | `instancias-sin-fila` | no (no hay fila que marcar) | `codigo` |
| `quantity` ≠ cantidad de observaciones del código | `cantidad-no-coincide` | sí | `cantidad` |
| {L, A, espesor} ordenado contra `sizeMm` (ya ordenado), alguna diferencia > `toleranceMm` en alguna instancia | `medida-no-coincide` (TP-11, TP-44: k = 0,95 y 1,00 cumplen; 1,05 no) | sí | `medidas` |
| Canteado: `edgeBanding` con lados (o `[]`) y `edgeRunsMm` numérico: lados L y A marcados contra caras que miden L y A (± tol), como A8 | `edges: "cumple"`, o `"no-coincide"` + `canteado-no-coincide` (TP-45) | sí | `canto` |
| Canteado con \|L − A\| ≤ tol | `edges: "neutral"` (TP-46), sin hallazgo | — | — |
| `edgeRunsMm = "no-disponible"` (sin caras `Canto_*`) | `edges: "no-disponible"`, sin hallazgo; no baja el nivel | — | — |
| `edgeBanding = "sin-definir"` | `edges: "sin-definir"`: **no se compara el canteado**, ni contra caras ni contra `[]`. Hallazgo informativo `canteado-sin-definir` (D5), uno por código | no (lo fuerza el tipo) | `canto` (`result: "no-disponible"`) |

`"sin-definir"` tiene prioridad sobre `"no-disponible"`: si faltan las dos cosas, `edges` dice `"sin-definir"`, porque lo que falta decidir está del lado del PDF.

### 4.1 `combinarNivel` (D4)

Pura, sin efectos, no modifica sus argumentos. Recibe el nivel de **una** fila (`RowLevel` de `validateFurniture`), el código de esa fila y los hallazgos de un `crossCheck` (un mueble), y devuelve el nivel combinado con la regla **"gana el peor"**:

- Orden de gravedad fijo, en una constante que cubre **todo** `RowLevel`: `const GRAVEDAD = { segura: 0, dudosa: 1 } as const satisfies Record<RowLevel, number>`. Si `RowLevel` suma un valor, el tipo obliga a ubicarlo. El resultado es el nivel de mayor gravedad entre `level` y el que implica cada hallazgo.
- **Filtra adentro:** solo cuentan los hallazgos con `code` igual al de la fila. Un hallazgo de otro código no cambia el nivel.
- Un hallazgo con `affectsLevel: true` implica `dudosa`; uno con `affectsLevel: false` no cuenta.
- Nunca mejora un nivel: `dudosa` con cualquier lista da `dudosa`.

`validateFurniture` no cambia. Quien llama (la pantalla de revisión, más adelante) arma el nivel combinado por fila.

## 5. Pruebas

En `tests/pdf.listing.test.ts`, `tests/pdf.crossCheck.test.ts` y `tests/pdf.level.test.ts`; se sacan de `tests/pdf.todo.test.ts` las que se implementen. TP-23 sigue `todo` (PDF-2).

| Id | Caso | Entrada | Esperado |
|---|---|---|---|
| TP-10 | L < A se conserva | fila sintética 100 x 1200 | `lengthMm = 100`, `widthMm = 1200` |
| TP-60 | Conversión del primer fixture | `olmo.json` | 21 piezas; códigos, medidas y cantidades iguales a las del mock; `edgeBanding = "sin-definir"` (nunca los lados del mock, nunca `[]` ni `null`) |
| TP-62 | Bloqueo | un documento rechazado | `status: "bloqueado"`, sin piezas |
| TP-63 | Borrador | una fila `dudosa` | `status: "borrador"` |
| 2b-S1 | Fixture sintético | `esperado/S1.json` a `S3.json` como un mueble | piezas por código; F de S2 suma 2 + 4 = 6 en una sola pieza; S3 con `"sin-definir"` |
| 2b-L1 | Sin módulo | cualquier listado | ninguna pieza tiene `moduleId` ni `qrId` |
| TP-11 | El cruce ordena | fila 100 x 1200 x 18 contra `sizeMm` `[18, 100, 1200]` | cumple |
| TP-40 | Primer fixture contra su .dae | `olmo.json` + observaciones del .dae real | 21 códigos con instancias; cantidades y medidas dentro de 2 mm; `edges` `"sin-definir"` en todos; ningún hallazgo con `affectsLevel: true` |
| TP-40b | Segundo fixture contra su .dae (local) | `Sabrina/fixtures/sabrina.json` + su .dae | sin hallazgos con `affectsLevel: true` con su tolerancia; se saltea si falta `Sabrina/`, como `sabrina.test.ts`; la prueba no escribe códigos ni cifras de ese fixture |
| TP-41 a TP-46 | Casos de §4 | observaciones escritas a mano | la razón, `affectsLevel` y `Evidence.kind` de cada fila de §4 |
| 2b-C1 | Nombres con `_` | observación `_<código>` | se cruza con la fila del código |
| 2b-C2 | Nombres con `__` | observación `_<código>__` | se cruza con la fila del código; el cruce no agrega razón por el nombre |
| 2b-C3 | Geometría sin código | observación con `rawName: null` | no entra: ni `instancias-sin-fila` ni cantidad |
| 2b-C4 | Código solo en el listado | fila sin observaciones | `codigo-sin-instancias`, `affectsLevel: true` |
| 2b-C5 | Código solo en el .dae | observaciones sin fila | `instancias-sin-fila`, `affectsLevel: false` |
| 2b-C6 | Mismo código, otro mueble | listado del mueble A + observación con otro `modelId` y un código del listado | `MuebleDistintoError`; nunca se empareja |
| 2b-C6b | `modelId` ≠ `furnitureId` | contexto `furnitureId: "a"`, `modelId: "a-dae"` y observaciones de `"a-dae"` | se cruzan; los hallazgos salen con `furnitureId: "a"` |
| 2b-C7 | `"sin-definir"` no se compara | `edgeBanding: "sin-definir"` + `edgeRunsMm` numérico que contradiría `[]` | `edges: "sin-definir"`; un `canteado-sin-definir` con `affectsLevel: false`; sin `canteado-no-coincide` |
| 2b-C8 | `[]` sí se compara | `edgeBanding: []` + caras `Canto_*` en la observación | `canteado-no-coincide` |
| 2b-C9 | Evidencia | cada hallazgo de TP-41 a TP-46 y 2b-C4/C5 | al menos una `Evidence` con `detail` no vacío; `reason` ∈ `PDF_REASONS` |
| 2b-S2 | Cruce del sintético | listado sintético + observaciones escritas a mano desde `esperado/` (no desde `fuente.ts`) | sin razones; una perturbación por razón |
| 2b-N1 | `combinarNivel`, sin hallazgos | `segura`, `[]` / `dudosa`, `[]` | `segura` / `dudosa` |
| 2b-N2 | Gana el peor | `segura` + un hallazgo `affectsLevel: true` | `dudosa` |
| 2b-N3 | Nunca mejora | `dudosa` + hallazgos solo informativos | `dudosa` |
| 2b-N4 | Informativos no cuentan | `segura` + `instancias-sin-fila` y `canteado-sin-definir` del mismo código | `segura` |
| 2b-N6 | Otro código no cuenta | `segura`, código X + un hallazgo `affectsLevel: true` del código Y | `segura` |
| 2b-T1 | El tipo fuerza `affectsLevel` | `canteado-sin-definir` o `instancias-sin-fila` con `affectsLevel: true` | error de tipos (`@ts-expect-error` en la prueba; lo comprueba `npm run typecheck`) |
| TP-62b | Razón del bloqueo | un documento rechazado por `hoja-incompleta`; una lista vacía | `reason: "hoja-incompleta"`; `reason: "esquema-invalido"` |
| 2b-N5 | Pura | cualquier entrada, dos veces | mismo resultado; argumentos sin cambios (`Object.freeze`) |

**TP-40 y TP-40b (D2).** Las observaciones salen del .dae con `tests/helpers/loadModel.ts`, mediante un adaptador mínimo **de prueba** (`tests/helpers/observations.ts`): `sizeMm` de la caja de cada `FurniturePart` en mm, ordenada; `edgeRunsMm` de `collectEdgeFaces` (`tests/helpers/edgeFaces.ts`, que lee la escena antes del merge, porque `colladaModel.ts` quita los grupos) o `"no-disponible"` si la instancia no tiene caras `Canto_*`; `modelId` el del mueble; los campos que el cruce no usa (§2.1), con valores fijos marcados en el helper como no reales. **Si ese adaptador necesita lógica del adapter del motor** (marco, orientación, posición relativa, espejo), TP-40 y TP-40b quedan `todo` en `tests/pdf.todo.test.ts`, con el motivo escrito ahí y en esta spec. En los dos casos, 2b-C1 a 2b-C8 se prueban igual con observaciones a mano: `FurnitureModel` ya descarta las mallas sin código y no conserva los nombres en todas sus formas, así que esos casos no se cubren con el .dae real.

## 6. Decisiones

| Id | Pregunta | Resolución (7/11) |
|---|---|---|
| D1 | ¿Dónde vive `Observation`? | **Aprobada con cambios.** Una sola definición en `src/engine/types.ts`, fuente única, referencia a spec-motor v3 §5.2 (y §5.3 para `Evidence`); sin copia en esta spec ni en `src/pdf/` (§2.1) |
| D2 | TP-40 con el .dae real o solo a mano | **Aprobada con cambios.** `loadModel.ts` corre en Node (verificado, §0) y el .dae del segundo fixture existe en local: TP-40 con el .dae real y TP-40b local. Si el adaptador de prueba exige lógica del motor, quedan `todo` y registrados. Los casos `_`, `__`, sin código y código de un solo lado se cubren a mano siempre (§5) |
| D3 | ¿`"sin-definir"` o un error al convertir una columna ausente? | **Aprobada con cambios.** `"sin-definir"`, distinto de `[]` ("sin canto"). Con ese valor no se compara el canteado: `edges: "sin-definir"` y, como mucho, un hallazgo informativo (D5). Pregunta abierta: **PDF-2** (spec-esquema §11): *"Si un PDF no trae la columna de cantos (como los fondos de 3 mm), ¿significa 'sin canto' o que la columna está oculta?"*; contexto en spec-esquema §6 ("ABIERTO — columna de cantos ausente") y la hipótesis H-05 de `spec-extraccion-pdf.md` (ausencia = "no exportado", sin confirmar). Cuando se responda, `"sin-definir"` se resuelve a `[]` o `null` en la conversión y TP-23 deja de ser `todo` |
| D4 | ¿El cruce cambia el `level` de las filas o devuelve razones aparte? | **Aprobada con cambios.** `findings` aparte, con `evidence` del motor y `reason` del catálogo de `src/pdf/reasons.ts`; más `combinarNivel(level, findings)` pura, regla "gana el peor", con pruebas 2b-N1 a 2b-N5 (§4.1). `validateFurniture` no cambia |
| D5 | ¿Con qué razón va el hallazgo informativo de `"sin-definir"`? El catálogo (spec-esquema §7.3, `reasons.ts`) no tiene ninguna que sirva, y D4 exige códigos del catálogo | **Aprobada (7/11).** Nueva razón `canteado-sin-definir`: ya está en spec-esquema §7.2 y §7.3 (con entrada en su historial); a `src/pdf/reasons.ts` se agrega en la sesión de implementación. El tipo fuerza `affectsLevel: false` para esa razón (§2.3) |

## 7. Fuera de esta sesión

- Conectar Vision a la app o mandar PDF reales: necesita P-02, P-04 y P-12 (`CLAUDE.md`, "Extracción OCR / Cloud Vision").
- Tesseract local, LLM, reconciliación y Eval Harness (sesión 3).
- Deducir módulos (de los grupos del .dae o de cualquier otra cosa) y la pantalla de revisión que usa `combinarNivel`.
- Consultas 42 y 44: no tocar (el código sigue opaco; no cambian los QR de mueble y módulo).

## 8. Precisiones de la implementación (7/11, a revisar por el equipo)

Casos que la spec v0.3 no cubre. Se resolvieron del lado conservador, sin cambiar nada de lo aprobado:

| Id | Caso | Resolución en el código |
|---|---|---|
| I1 | `ListedPiece` hereda `quantity`, `lengthMm` y `widthMm` como `number`, pero un código puede tener `total: null`, `finalL`/`finalA` `null`, o filas que difieren en nombre, medidas, canteado, material o espesor (INV-10, INV-11) | El código **no entra** a `pieces` y el listado queda `borrador` (sus filas ya son `dudosa`). No se elige la primera fila ni se inventa un valor. `listing.ts` |
| I2 | Entradas que contradicen sus propias invariantes | Errores tipados: `ListingInputError` (bloqueado sin razón de rechazo; un total sin filas) y `CrossCheckInputError` (tolerancia no finita o negativa; código repetido en el listado) |
| I3 | Orden de las comprobaciones de canteado | Primero `"sin-definir"`; si ninguna instancia trae caras `Canto_*` (o no hay instancias), `"no-disponible"`; si \|L − A\| ≤ tol, `"neutral"`; si no, se compara |
| I4 | Instancias de un mismo código, unas con caras `Canto_*` y otras sin | `"no-coincide"` + `canteado-no-coincide`: el modelo no es parejo y no se supone nada |
| I5 | Una cara de canto que mide L y A dentro de la tolerancia (posible con tol < \|L − A\| ≤ 2·tol) | Va al más cercano; si empata, queda sin clasificar y la instancia da `"no-coincide"`. Una cara que no mide ni L ni A también |
| I6 | Caja con un valor no numérico (NaN) | No cumple medidas (`medida-no-coincide`) |
| I7 | `canteado-sin-definir` en un código sin instancias | Sale igual, uno por código, junto a `codigo-sin-instancias` |
| I8 | Orden de los hallazgos | El del listado; por código: `codigo-sin-instancias` o `cantidad-no-coincide`, `medida-no-coincide`, canteado. Al final, `instancias-sin-fila` por código en orden binario. Medidas y canteado: un hallazgo por código con una `Evidence` por instancia que falla |
| I9 | TP-40 y TP-40b (D2) | El adaptador de prueba (`tests/helpers/observations.ts`) **no necesitó lógica del motor**: el cruce no usa marco, orientación, posición ni espejo, y esos campos llevan valores fijos marcados como no reales. Ninguna de las dos queda `todo`. `modelId` = `FurnitureDef.modelUrl`, distinto de `furnitureId` (ejercita 2b-C6b con datos reales). El primer fixture no trae caras `Canto_*`: con el canteado definido daría `"no-disponible"` |
| I10 | Cobertura | No hay proveedor de cobertura instalado (`@vitest/coverage-v8` sería una dependencia nueva): las ramas de I1 a I8 tienen prueba, revisadas a mano |

## 9. Historial

- **v0.1 (6/11):** borrador con D1 a D4 abiertas.
- **v0.2 (7/11):** D1 a D4 aprobadas con cambios. `Observation` y `Evidence` con fuente única en `src/engine/types.ts`, sin copia (D1). TP-40 con el .dae real (verificado que `loadModel.ts` corre en Node), TP-40b local para el segundo fixture y casos a mano para `_`, `__`, sin código y códigos de un solo lado (D2). `"sin-definir"` separado de "sin canto", sin comparar el canteado, con enlace a PDF-2; `null` deja de ser salida de la conversión (D3). `findings` con `evidence`, `affectsLevel` y razones del catálogo, y `combinarNivel` pura con "gana el peor" (D4). Agregado: el cruce va por (mueble, código), con `MuebleDistintoError` si se mezclan muebles, y el módulo no se deduce de los grupos del .dae. Nueva D5 (razón del hallazgo informativo).
- **v0.3 (7/11), aprobada:** D5 aprobada (`canteado-sin-definir`, primero en spec-esquema §7.2 y §7.3). `crossCheck` recibe `{ furnitureId, modelId, toleranceMm }`: `modelId` ≠ `furnitureId`, y `MuebleDistintoError` si una observación trae otro `modelId`. `CrossCheckFinding` como unión que fuerza `affectsLevel` por razón. `Evidence.kind` verificado contra spec-motor v3 §5.3. Orden de gravedad con `satisfies Record<RowLevel, number>`. `combinarNivel(level, code, findings)` filtra por código adentro. `reason` del bloqueo de tipo `PdfReason`. Pruebas nuevas: 2b-C6b, 2b-N6, 2b-T1, TP-62b.
- **v0.3, implementación (7/11):** `src/engine/types.ts`, `src/pdf/listing.ts`, `src/pdf/crossCheck.ts`, `src/pdf/level.ts` y `canteado-sin-definir` en `reasons.ts`, con sus pruebas. Precisiones I1 a I10 en §8, sin cambiar lo aprobado. TP-23 sigue `todo` (PDF-2).
