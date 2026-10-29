# Especificación — Esquema de la salida del PDF de OpenCutList

Estado: **borrador para revisión** (28/10/2026). Sesión de solo especificación: sin código de producción ni de pruebas.
Antecedentes: `docs/contexto-casa-mueble-pdf.md` (reunión del 20/10 y análisis del PDF de ejemplo del 23/10), `docs/spec-motor-asociacion.md` (contratos §5, normalización §6.1, canto §8), `docs/spec-importador-prueba.md` (validación pura con fila y columna).
Plan de pruebas: `docs/test-plan-esquema-pdf.md`. Fixture de referencia: `tests/fixtures/pdf/olmo.json`.
Como en la spec del motor, **este documento no cita códigos ni cifras del segundo fixture** (local): se lo nombra "segundo fixture".

---

## 1. Objetivo

Casa Mueble entrega el listado de piezas como **PDF del complemento OpenCutList de SketchUp** (decisión del 20/10: el Excel "no es funcional"). El sistema:

1. lee el PDF y lo convierte a un **documento tipado** (`CutListPdf`, §4);
2. lo valida contra sus **invariantes** (§5) y contra el **.dae** (§7);
3. arma el **listado** (`PieceType[]`) con el mismo contrato y la misma serialización que usa el motor (§6), para que `listadoId` no cambie de definición;
4. deja los datos que necesita la **sección de cortes** (R4, §9).

Principios (los del motor, sin cambios): **la IA nunca decide sola**; **conservador** (ante la duda, `dudosa`); **explicable** (cada `dudosa` lleva sus razones de un catálogo cerrado); **nada no confirmado se inventa** (va como PENDIENTE).

## 2. Estado de las fuentes (verificado el 28/10)

| Archivo | Productor (metadatos) | Capa de texto | Qué es |
|---|---|---|---|
| Olmo, 3 PDF de optimización (Blanco nature 18, Gaudi 18, Blanco nature 3) | `Microsoft: Print To PDF` | **No** (0 fuentes; `pdftotext` 4.00 extrae 2–3 bytes) | Salida de OpenCutList, 9/10 |
| Olmo, "Nombres con códigos (Excel con datos de canteado)" | `Skia/PDF` (impresión desde el navegador) | Sí | Planilla del equipo de Casa Mueble, **no** es salida de OpenCutList |
| Olmo, "Plano con medidas" | AutoCAD 2026 | Sí (cotas) | Plano |
| Segundo fixture, 3 PDF de optimización | `Microsoft: Print To PDF` | **No** | Salida de OpenCutList, 14/10 |

**Consecuencia: `TextoPdf` (§8.2) no se puede validar hoy con ningún PDF real.** Todos los PDF de OpenCutList disponibles son solo trazados. El análisis del 23/10 ya lo había visto en el ejemplo y abrió la consulta 58 (pedir PDF con texto o el CSV del complemento). Mientras no llegue, `TextoPdf` se valida solo con su parser puro y entradas sintéticas (§8.2) y los fixtures se transcriben a mano.

**Dos variantes del formato** (las dos son OpenCutList; el complemento muestra u oculta columnas):

| Variante | Columnas del listado por tablero | Dónde aparece |
|---|---|---|
| Corta | No., Designación, Cant., Finales (L, A) | Los 3 PDF del Olmo; el PDF de fondos de 3 mm del segundo fixture |
| Completa | No., Designación, Cant., Ajustadas (L, A), Finales (L, A), Tiras de cantos (4 subcolumnas) | Los PDF de 18 mm del segundo fixture |

Por eso el esquema registra **qué columnas trae** cada documento (`columns`, §4) y distingue "columna ausente" de "columna presente sin marcas".

## 3. Reglas confirmadas y pendientes

| Id | Regla | Origen | Estado |
|---|---|---|---|
| RP1 | Se usa la columna **"Finales"**. "Ajustadas" no entra al esquema | Reunión 20/10 | Verbal; si "Finales" incluye el canto sigue PENDIENTE (consulta 51) |
| RP2 | L y A **no son largo y corto**: se toman tal cual y se compara L con A; L puede ser menor que A | Reunión 20/10 | Verbal |
| RP3 | "Tiras de cantos": 4 subcolumnas, **1 = inferior, 2 = superior, 3 = izquierdo, 4 = derecho**; 1 y 2 son lados L, 3 y 4 son lados A. Se lee **por posición** de la marca | Reunión 20/10 | Verbal; **falta confirmación escrita (consulta 56)** |
| RP4 | El dibujito del PDF se ignora; el sistema arma su propio esquema. **Ningún ícono se lee**: ni el de junto al código, ni los de "Ajustadas", ni los de los encabezados de canto | Reunión 20/10; análisis 23/10 | Confirmado verbal (dibujito); íconos **sin significado confirmado** |
| RP5 | Un mismo código puede aparecer en **varios tableros**; la cantidad es **por tablero** y se suma para comparar con el modelo | Reunión 20/10; análisis 23/10 | Verbal; observado en el segundo fixture |
| RP6 | El sistema compara con el .dae y **avisa** las discrepancias; no corrige | Reunión 20/10 | Verbal |
| RP7 | La designación es proyecto-mueble-módulo-corte; el número de corte es continuo en el proyecto | Reunión 20/10 | Verbal. **No se usa**: el código sigue opaco (AS1 del motor, consulta 42) hasta la confirmación escrita |
| RP8 | `TextoPdf` es determinista y sin IA; `OcrLlm` solo hace análisis previo, se valida con el esquema y contra el .dae, y **nunca decide** | Pedido del equipo (28/10); principios del motor | Decisión del equipo |
| RP9 | Se reutilizan `PieceType` y la serialización de `listadoId` (motor §5.1) | Pedido del equipo | Decisión del equipo |
| RP10 | R4: el "listado de cortes" es la **lista de piezas por tablero** (no una secuencia de cortes) | Equipo, 28/10 | **Supuesto PROVISORIO**, a confirmar con Casa Mueble (§9); formato de Gabriel PENDIENTE (consultas 35–37) |
| RP11 | Nada del segundo fixture entra al repo | `CLAUDE.md` | Vigente |

## 4. Esquema tipado

**Lenguaje y validación.** TypeScript, con **validador puro escrito a mano** (sin dependencias), igual que `src/importer/listing.ts`. El repo no usa ninguna librería de validación de esquemas; agregar una (por ejemplo zod) sería una dependencia nueva y queda fuera de esta spec.
**Nombres.** Tipos y campos en inglés, como `src/data/types.ts` y los contratos del motor. Los nombres `FuenteDePdf`, `TextoPdf` y `OcrLlm` los fijó el pedido y se conservan. Los valores de catálogo van en español y kebab-case, como los del motor (`"dudosa"`, `"codigo-duplicado"`).
**Ubicación propuesta:** `src/pdf/` (funciones puras: sin React, sin three, sin DOM), como `src/engine/`.

```ts
/** Documento leído de UN archivo PDF de OpenCutList (un material + espesor). */
interface CutListPdf {
  schema: "cutlist-pdf/1";
  source: PdfSource;
  header: {
    material: string;          // tal cual el título ("Blanco nature", "GAUDI"); NFC, sin normalizar mayúsculas
    thicknessMm: number;
    generatedAt: string;       // texto tal cual ("09/10/2026 5:47pm"); no se interpreta la zona horaria
    unit: "mm";                // el PDF dice "Milimetro"; otra unidad = error `unidad-no-soportada`
    project: string;           // título del recuadro ("Escritorio Oslo - ... .skp - Escena1"), tal cual
  };
  summary: {
    settings: Record<string, string>;  // "Configuraciones" tal cual (Tipo, Espaciado, Margen, ...); informativo
    fillRatePct: number | null;        // "Tasa de llenado" (Estadísticas)
    cutCount: number | null;           // "Número de cortes"
    cutLengthM: number | null;         // "Longitud de cortes"
    boards: SummaryBoardRow[];         // tabla "Tablero" del resumen
  };
  columns: { adjusted: boolean; edgeStrips: boolean };  // qué columnas trae el listado (§2)
  boards: Board[];                     // uno por hoja de tablero ("1 / 2", "2 / 2")
  pending: PendingField[];             // todo lo no leído con certeza (ver abajo)
}

interface PdfSource {
  fileName: string;
  pdfId: string | null;        // "sha256:" + hash de los bytes del PDF; null en una transcripción sin archivo
  reader: "texto-pdf" | "ocr-llm" | "transcripcion-manual";
  readerVersion: string;
  producer: string | null;     // metadato /Producer
  hasTextLayer: boolean;
}

interface SummaryBoardRow {
  material: string;
  thicknessMm: number;
  count: number;               // "Cant." (cantidad de tableros de ese material)
  lengthMm: number;            // "Longitud"
  widthMm: number;             // "Anchura"
  areaM2: number | null;       // "Σ Areas"
  parts: number;               // "Σ Partes"
}

interface Board {
  index: number;               // 1..total, de "i / N" del encabezado de la hoja
  total: number;
  material: string;
  thicknessMm: number;
  lengthMm: number;            // dimensiones del tablero
  widthMm: number;
  kind: string;                // "Tablero estándar", tal cual
  pieceCount: number;          // pie: "N piezas"
  cutLengthM: number | null;   // pie: "Longitud de cortes"
  efficiencyPct: number | null;// pie: "Eficiencia" (NO es la "Tasa de llenado" del resumen; ver §5, INV-13)
  pieces: BoardPiece[];        // filas del listado de esa hoja, en el orden del PDF
  diagram: DiagramLetter[] | "pendiente";  // ocurrencias de cada letra en el diagrama de corte
}

interface BoardPiece {
  letter: string;              // "No." (A, B, C, ...)
  code: string;                // designación, línea 1, tal cual (se normaliza en la validación, §5)
  name: string;                // designación, línea 2, tal cual
  quantity: number;            // "Cant." de ESTE tablero
  finalL: number;              // "Finales" L, mm
  finalA: number;              // "Finales" A, mm
  edges: EdgeStrips | "columna-ausente";
}

/** Las 4 subcolumnas de "Tiras de cantos", por posición (RP3). null = celda sin marca. */
interface EdgeStrips {
  s1: EdgeStrip | null;        // inferior  (lado L)
  s2: EdgeStrip | null;        // superior  (lado L)
  s3: EdgeStrip | null;        // izquierdo (lado A)
  s4: EdgeStrip | null;        // derecho   (lado A)
}

interface EdgeStrip {
  label: string;               // texto de la celda tal cual ("Canto <material> ~ 0 mm x 22 mm")
  material: string | null;     // el <material> de la celda; null si no se lee con certeza
  widthMm: number | null;      // 22
  thicknessText: string | null;// "~ 0 mm": el PDF redondea; NO se convierte a número (ver §11, canto)
}

interface DiagramLetter {
  letter: string;
  count: number;               // cuántas veces aparece la letra en el diagrama de ese tablero
}

interface PendingField {
  path: string;                // ruta JSON del campo ("boards[0].pieces[3].finalA")
  reason: string;              // por qué no se leyó con certeza
}
```

**Qué queda fuera del esquema, a propósito:** "Ajustadas" (RP1), los íconos (RP4), el color del punto de canto, "Σ Costos", "Tiempo", las cotas y los sobrantes grises del diagrama, y las **posiciones** de las piezas en el diagrama (el PDF no las trae como números; solo se cuentan letras). "La fibra sigue la longitud" tampoco se interpreta (es un ícono más texto; queda PENDIENTE qué implica para L/A).

**Un valor no leído con certeza** se escribe `null` (o `"pendiente"` en `diagram`) **y** lleva una entrada en `pending`. Un `null` sin entrada en `pending` es error de esquema (INV-0).

## 5. Invariantes

Se verifican sobre un `CutListPdf` (INV-1 a INV-9, INV-13), sobre el conjunto de PDF de un mismo mueble (INV-10 a INV-12) o al convertir al listado (INV-14). Violar una invariante **no corrige nada**: produce una razón del catálogo (§7) y la fila queda `dudosa`, o el documento se rechaza si es estructural.

| Id | Invariante | Si falla |
|---|---|---|
| INV-0 | Forma: todo campo obligatorio presente, números finitos y positivos (cantidad entera ≥ 1), `null` solo con su `pending` | documento rechazado (`esquema-invalido`) |
| INV-1 | **Cantidad por tablero:** Σ `quantity` de las filas de un tablero = `pieceCount` del pie | `suma-tablero-no-coincide` |
| INV-2 | **Suma entre tableros:** para cada fila del resumen (material, espesor), Σ `pieceCount` de sus tableros = `parts`, y la cantidad de hojas = `count` | `suma-resumen-no-coincide` |
| INV-3 | **Diagrama:** en cada tablero con diagrama leído, para cada letra, `count` en el diagrama = `quantity` de la fila con esa letra; ninguna letra del diagrama sin fila ni fila sin letra | `diagrama-no-coincide` |
| INV-4 | **Unicidad de código por tablero:** un código aparece en una sola fila de cada tablero | `codigo-duplicado-en-tablero` |
| INV-5 | **Unicidad de letra por tablero:** una letra aparece en una sola fila de cada tablero | `letra-duplicada-en-tablero` |
| INV-6 | **Letra estable en el documento:** dentro de un mismo PDF, la misma letra corresponde siempre al mismo código y viceversa. **Observado** en el segundo fixture (una pieza repetida en dos tableros conserva su letra), **no confirmado** por Casa Mueble | `letra-inconsistente` (`dudosa`, no rechazo) |
| INV-7 | **L comparado con A, nunca largo/corto:** `finalL` y `finalA` se guardan en el orden del PDF; ningún paso los reordena ni los nombra largo/corto. Toda comparación con el .dae usa el conjunto ordenado {L, A, espesor} (como el motor §6.2) | — (regla de construcción; la prueba verifica que una fila con L < A pasa sin cambios) |
| INV-8 | **Pieza dentro del tablero:** máx(L, A) ≤ máx(largo, ancho del tablero) y mín(L, A) ≤ mín(largo, ancho del tablero) | `pieza-mayor-que-tablero` |
| INV-9 | **Mapeo de cantos:** `edges` es `"columna-ausente"` si y solo si `columns.edgeStrips` es `false`. Con la columna presente, cada subcolumna es `null` o una marca; s1 y s2 cuentan como lados L, s3 y s4 como lados A (RP3) | `cantos-inconsistentes` |
| INV-10 | **Mismo código, mismo material:** un código aparece en un solo PDF (un material + espesor) del mueble | `codigo-con-distinto-material` |
| INV-11 | **Mismo código, mismos datos entre tableros:** en todas sus filas, igual `name`, `finalL`, `finalA` y `edges` | `codigo-con-distintas-medidas` / `codigo-con-distinto-canteado` / `codigo-con-distinto-nombre` |
| INV-12 | **Total por código** = Σ `quantity` en todos los tableros de todos los PDF del mueble. Es la cantidad que se compara con el .dae y la que va a `PieceType.quantity` | (definición; se prueba con un código en dos tableros) |
| INV-13 | Porcentajes en [0, 100]. `fillRatePct` (resumen) y `efficiencyPct` (pie de tablero) son **cifras distintas** y no se relacionan entre sí (en el Olmo difieren); qué mide cada una queda PENDIENTE | `porcentaje-invalido` |
| INV-14 | **Conversión al listado** (§6): solo con 0 rechazos; las filas `dudosa` impiden publicar el listado sin revisión humana | — |

**Mapeo de cantos a `EdgeId`** (reutiliza la convención ya asumida en `CLAUDE.md` para el segundo fixture):

| Subcolumna | Lado (RP3) | `EdgeId` |
|---|---|---|
| s2 | superior, lado L | `largo-A` |
| s1 | inferior, lado L | `largo-B` |
| s3 | izquierdo, lado A | `corto-A` |
| s4 | derecho, lado A | `corto-B` |

**Deuda de nombres (sin cambio):** `EdgeId` dice `largo`/`corto`, pero acá significa **lado L / lado A**, no el borde más largo o más corto (RP2). `largo-*` es el borde que mide `lengthMm` (= L) y `corto-*` el que mide `widthMm` (= A), como ya documenta `CLAUDE.md`. Renombrar `EdgeId` tocaría el visor, las fichas, el importador y `listadoId`: se propone como cambio aparte, no en esta spec.

## 6. Conversión al listado (`PieceType[]`) y `listadoId`

Se reutilizan `PieceType` (`src/data/types.ts`) y la serialización canónica del motor (§5.1) **sin cambios**. Un tipo por código, con:

| Campo de `PieceType` | Sale de |
|---|---|
| `code` | código normalizado (§7.1) |
| `name` | `name` de la fila (INV-11 garantiza que es único), NFC |
| `lengthMm` | `finalL` (**sin reordenar**, INV-7) |
| `widthMm` | `finalA` |
| `thicknessMm` | `thicknessMm` del tablero (el PDF no trae espesor por pieza) |
| `material` | `header.material` del PDF, tal cual (NFC). No se unifica con nombres de otras fuentes |
| `quantity` | total por código (INV-12) |
| `edgeBanding` | con la columna presente: la lista de `EdgeId` de las subcolumnas marcadas (§5), `[]` si ninguna; con `"columna-ausente"`: **ABIERTO** (`null` o `[]`, ver abajo) |
| `notes` | `null` |
| `qrId`, `moduleId` | no salen del PDF; los asigna el sistema (quedan fuera de `listadoId`, motor §5.1) |

**ABIERTO — columna de cantos ausente (decisión del equipo, 28/10).** `CLAUDE.md` y la tabla local del segundo fixture tratan sus fondos de 3 mm como `[]` ("dato real"), pero su PDF **no trae** la columna "Tiras de cantos". `null` ("sin dato") sería lo coherente con "nada no confirmado se inventa", pero cambiaría el `listadoId` del segundo fixture. **No se toca ese `listadoId`** y la conversión de una columna ausente queda sin definir hasta que Casa Mueble responda la pregunta PDF-2 (§11): si la columna ausente significa "sin canto", va `[]`; si significa "columna oculta", va `null`.

**Olmo con la variante corta.** Ningún PDF de OpenCutList del Olmo trae "Tiras de cantos": su canteado **no se puede leer del PDF** (con `null` o `[]` según PDF-2; en ningún caso con los lados que eligió el mock). Se pide a Casa Mueble reexportar el Olmo con todas las columnas (PDF-1). Los conteos "2 largos 1 corto" salen de **otra fuente** (la planilla del Excel) y no dicen qué lado: no alcanzan para llenar s1–s4. El fixture los guarda aparte (`excel`), sin mezclarlos con el esquema.

## 7. Errores y razones

### 7.1 Código (reutiliza el motor §6.1)

Formato `C = ^\d{4}-\d{2}-M\d{2}-C\d{2}$` (AS1, código opaco). En el PDF el código puede venir partido en varias líneas o con un ícono en el medio (segundo fixture): el lector une las líneas de la designación y **descarta los íconos** antes de validar; si no puede separar código de ícono con certeza, `pending` + `dudosa`.

| Caso | Razón | Efecto |
|---|---|---|
| Fila sin código legible | `codigo-ausente` | `dudosa`; no entra al listado |
| Matchea `^_?C$` | — | válido |
| Matchea `^_*C_*$` y no es canónico (incluye el `__` final, como el C01 del .dae del Olmo) | `nombre-anomalo` | `dudosa`; se normaliza para cruzar, pero no se publica sin revisión |
| No matchea `^_*C_*$` | `formato-invalido` | `dudosa`; no entra al listado |
| Dos filas del mismo tablero con el mismo código | `codigo-duplicado-en-tablero` (INV-4) | las dos `dudosa` |
| Mismo código en dos PDF (dos materiales o espesores) | `codigo-con-distinto-material` (INV-10) | todas sus filas `dudosa` |

### 7.2 Cruce con el modelo (.dae)

Entrada: el listado (§6) y las `Observation` del adapter del motor (§5.2), sin cambios. Tolerancia: `FurnitureDef.toleranceMm` (AS8 del motor; Olmo 2 mm). Se compara **solo dentro del mismo mueble**.

| Caso | Razón | Efecto |
|---|---|---|
| Código del PDF sin instancias en el .dae | `codigo-sin-instancias` | `dudosa` |
| Instancias con código que el PDF no trae | `instancias-sin-fila` | se informa (no hay fila que marcar) |
| Total por código ≠ instancias del .dae | `cantidad-no-coincide` | `dudosa` |
| {L, A, espesor} ordenado vs. caja ordenada fuera de tolerancia | `medida-no-coincide` | `dudosa` |
| Canteado: con caras `Canto_*` en el .dae (AS4), cantidad de lados L y A marcados ≠ caras que miden L y A (como A8 y el motor §8.1) | `canteado-no-coincide` | `dudosa` |
| Canteado con \|L − A\| ≤ tolerancia | — | neutral (no se puede distinguir lado L de lado A) |
| Canteado sin caras `Canto_*` en el .dae (es el caso del Olmo) o con `edges: "columna-ausente"` | — | `no-disponible`; no baja el nivel |

### 7.3 Nivel de cada fila

- `segura`: leída por `TextoPdf` o por transcripción manual revisada, sin ninguna razón de §5 ni §7.
- `dudosa`: cualquier razón, **o** leída por `OcrLlm` (siempre, sin excepción: RP8).
- Un documento con `esquema-invalido`, `unidad-no-soportada` o `estructura-no-reconocida` se **rechaza** entero: no hay filas.

Catálogo cerrado de razones: `esquema-invalido`, `estructura-no-reconocida`, `unidad-no-soportada`, `sin-capa-de-texto`, `codigo-ausente`, `nombre-anomalo`, `formato-invalido`, `codigo-duplicado-en-tablero`, `letra-duplicada-en-tablero`, `letra-inconsistente`, `suma-tablero-no-coincide`, `suma-resumen-no-coincide`, `diagrama-no-coincide`, `pieza-mayor-que-tablero`, `cantos-inconsistentes`, `codigo-con-distinto-material`, `codigo-con-distintas-medidas`, `codigo-con-distinto-canteado`, `codigo-con-distinto-nombre`, `porcentaje-invalido`, `origen-ocr`, `codigo-sin-instancias`, `instancias-sin-fila`, `cantidad-no-coincide`, `medida-no-coincide`, `canteado-no-coincide`.

## 8. `FuenteDePdf` y adaptadores

```ts
interface FuenteDePdf {
  readonly id: "texto-pdf" | "ocr-llm";
  readonly deterministic: boolean;
  read(pdf: Uint8Array, fileName: string): Promise<PdfReading>;
}

type PdfReading =
  | { ok: true; document: CutListPdf }        // siempre pasa después por la validación (§5, §7)
  | { ok: false; reason: "sin-capa-de-texto" | "estructura-no-reconocida" | "unidad-no-soportada"; detail: string };
```

### 8.1 Contrato común

- Ningún adaptador valida ni decide: devuelve un `CutListPdf` y la validación (§5, §7) es **la misma** para los dos.
- `pdfId = sha256` de los bytes del PDF. El mismo PDF leído dos veces por `TextoPdf` da el **mismo JSON byte a byte** (sin fechas de lectura).

### 8.2 `TextoPdf` (capa de texto, sin IA, determinista)

- Dos partes: **extracción** (bytes → elementos de texto con posición; necesita una librería de PDF) y **parser** (elementos de texto → `CutListPdf`; función pura).
- **Extracción: PENDIENTE.** Requiere una dependencia nueva (por ejemplo pdf.js) y no hay hoy ningún PDF de OpenCutList con texto para validarla (§2). Se decide cuando llegue la respuesta a la consulta 58.
- **Parser: se especifica y se prueba ya**, con elementos de texto sintéticos escritos a mano a partir de los fixtures (`docs/test-plan-esquema-pdf.md`). Lee las marcas de canto **por la columna en la que caen** (posición x), no por el ícono.
- Sin capa de texto (`/Font` ausente o texto vacío) → `{ ok: false, reason: "sin-capa-de-texto" }`. **No** cae a OCR en silencio.

### 8.3 `OcrLlm` (visión / LLM, solo análisis previo)

- Uso: prellenar una transcripción o contrastar contra `TextoPdf`. **Nunca** produce el listado por sí solo: todas sus filas son `dudosa` con `origen-ocr` (§7.3) hasta que una persona las confirme (la pantalla de revisión queda fuera de esta spec, como la C del motor).
- Su salida pasa por el mismo validador y el mismo cruce con el .dae. Un JSON que no cumple el esquema se rechaza; no se "repara".
- No determinista: se guarda la salida con `readerVersion` (modelo y versión del prompt) y `pdfId`; no se vuelve a correr en silencio.
- **Privacidad (PENDIENTE):** usarlo manda el PDF a un servicio externo. Con el segundo fixture **no se usa** mientras la titularidad esté pendiente; con el Olmo, solo con OK explícito del equipo. Proveedor, costo y modelo: a decidir; no se fija acá.
- No-Wrapper LLM (motor §1): el LLM no puntúa ni decide asociaciones; solo transcribe.
- **Camino crítico:** mientras no haya PDF con texto (consulta 58), la lectura real de los PDF depende de `OcrLlm` (`CLAUDE.md`).
- **ABIERTO:** si una fila de `OcrLlm` cuyos valores coinciden exactamente con el .dae (código, cantidad, medidas y, si hay caras `Canto_*`, canteado) puede pasar a un nivel "verificada por el modelo". La verificación la haría el validador de reglas (§7.2), no el LLM. Hasta decidirlo, rige §7.3: siempre `dudosa`.

## 9. Sección de cortes (R4)

**Supuesto de trabajo PROVISORIO (equipo, 28/10), a confirmar con Casa Mueble:** el "listado de cortes" es la **lista de piezas por tablero**. El PDF no trae la secuencia de cortes (solo totales: "Número de cortes", "Longitud de cortes"), así que no se modela.

Datos que R4 necesita del esquema (todos ya están en §4):

| Dato | Campo |
|---|---|
| Qué tablero | `header.material`, `header.thicknessMm`, `Board.index` / `total`, `lengthMm` × `widthMm` |
| Qué piezas se cortan en ese tablero | `Board.pieces[]`: `letter`, `code`, `name`, `quantity`, `finalL`, `finalA` |
| Cuántas veces | `quantity` (y `diagram[].count`, que tiene que coincidir: INV-3) |
| Con qué canto | `edges` |

**Unidad del check (propuesta):** una casilla por pieza física por tablero: `(pdfId, Board.index, letter, n)` con `n = 1..quantity`. Las casillas de una misma letra son intercambiables: el PDF no da posiciones, así que no se puede decir **cuál** de las ocurrencias del diagrama es la `n`.

**PENDIENTE (no se suponen):**
- Formato exacto que quiere Gabriel (consulta 35), por placa o por material (36), dispositivo, registro de quién y cuándo, uso simultáneo (37).
- Si el check va sobre el diagrama, sobre la lista o en los dos (notas del 15/10: "puede hacerse desde la optimización o desde el listado").
- **Contradicción a resolver con Casa Mueble:** la nota del 15/10 dice "se hacen primero los cortes verticales que cruzan toda la placa". Eso exige un **orden de cortes**, que la lista de piezas por tablero no da y el PDF no trae. Si se confirma, este supuesto cae y R4 necesita otra fuente.
- Dónde se guardan los checks: es estado compartido y escrito; `CLAUDE.md` hoy no permite base de datos. Se especifica aparte.

## 10. Trazabilidad

| Requisito | Invariantes / reglas | Pruebas (`docs/test-plan-esquema-pdf.md`) |
|---|---|---|
| RP1 Finales | §4 (`finalL`/`finalA`; "Ajustadas" fuera) | TP-01, TP-02 |
| RP2 L vs A | INV-7, §6 | TP-10, TP-11 |
| RP3 Cantos | INV-9, mapeo §5, §7.2 canteado | TP-20 a TP-25 |
| RP4 Íconos | §4 (fuera del esquema), §7.1 (ícono en el código) | TP-26, TP-34 |
| RP5 Varios tableros | INV-1, INV-2, INV-6, INV-11, INV-12 | TP-03 a TP-07, TP-12 a TP-15 |
| RP6 Cruce con .dae | §7.2 | TP-40 a TP-46 |
| RP7 Designación | §7.1 (código opaco) | TP-30 a TP-35 |
| RP8 Fuentes | §8 | TP-50 a TP-55 |
| RP9 Listado y `listadoId` | §6, INV-14 | TP-60 a TP-63 |
| RP10 R4 | §9, INV-3 | TP-08, TP-09, TP-70 |
| RP11 Privacidad | §8.3, fixtures | TP-71, TP-72 |
| Diagrama | INV-3, INV-5 | TP-08, TP-09, TP-16 |
| Tablero | INV-8, INV-13 | TP-17, TP-18 |
| Material | INV-10 | TP-36 |

## 11. Inconsistencias que esta spec deja a la vista (sin resolver)

- **Canto 0,22 y gola 404 × 36:** confirmados por Casa Mueble el 16/10 (consultas 32 y 31, según `CLAUDE.md`). Siguen diciendo otra cosa, y **falta actualizarlos** (fuera de esta spec): el mock (0,45; gola "provisoria"), `ESTADO.md`, `tests/helpers/syntheticDef.ts` (0,45), el comentario de `src/model/edgeLayout.ts` ("el canto real es 0,45 mm") y el dashboard (consulta 32 "sin respuesta"). El esquema no fija el espesor del canto: guarda el texto del PDF (`thicknessText`, "~ 0 mm").
- **Ancho 22 mm y tipo ABS en el Olmo:** no aparecen en ningún PDF del Olmo (la planilla solo dice "Canto de 0.22"). En el segundo fixture el PDF dice "x 22 mm"; "ABS" no aparece en ninguno.
- **Columna de cantos ausente:** `[]` o `null`, ABIERTO (§6, PDF-2).
- **R4:** piezas por tablero contra "cortes verticales primero" (§9).
- **Designación:** la regla 6 del 20/10 ("proyecto-mueble-módulo-corte") contra el código opaco (AS1, consulta 42). Se mantiene opaco.

### Preguntas para Casa Mueble

Llevan una numeración provisoria; al pasarlas al archivo de consultas se les asigna el número que corresponda.

| Id | Pregunta | Afecta |
|---|---|---|
| PDF-1 | ¿Pueden exportar siempre con todas las columnas ("Ajustadas" y "Tiras de cantos") y con texto seleccionable? Pedido concreto: reexportar el Olmo así. Se suma a la consulta 58 | §2, §6, `TextoPdf` |
| PDF-2 | Si un PDF no trae la columna de cantos (como los fondos de 3 mm), ¿significa "sin canto" o que la columna está oculta? | §6 (`[]` o `null`) |
| PDF-3 | ¿La letra (No.) de una pieza es la misma en todos los tableros del mismo PDF? | INV-6 |
| PDF-4 | ¿Qué mide la "Tasa de llenado" del resumen y qué la "Eficiencia" del tablero? | INV-13 |
| PDF-5 | ¿El canto del Olmo es de 22 mm de ancho y ABS? (el espesor 0,22 ya está confirmado) | anexo D2 |
| PDF-6 | ¿El fondo de 3 mm del Olmo es Blanco nature, como dice el PDF, o blanco, como dice la planilla? | anexo D5 |
| PDF-7 | Para R4, ¿se corta la placa entera, como en la optimización, o una fracción, como en la planilla de compra? | §9, anexo D10 |
| PDF-8 | "La fibra sigue la longitud": ¿L sigue siempre la veta? | INV-7 |
| PDF-9 | ¿Una misma pieza puede aparecer en dos materiales o espesores? | INV-10 |
| — | R4: ¿el check es por pieza física por tablero, o hace falta el orden de los cortes ("verticales primero")? Va con las consultas 35–37 | §9 |

Siguen abiertas además la 56 (leyenda de cantos por escrito), 58, 51, 42 y 35–37.

## 12. Anexo — Diferencias entre los PDF del Olmo y el mock

Transcripción en `tests/fixtures/pdf/olmo.json`. **No se corrigió ni el mock ni el fixture.**

| # | Dato | PDF del Olmo | `src/data/furniture.mock.ts` |
|---|---|---|---|
| D1 | Espesor del canto | Planilla: "Canto de 0.22" (Blanco Nature y Gaudi). OpenCutList: sin dato | 0,45, provisorio (Casa Mueble confirmó 0,22 el 16/10: el mock está desactualizado) |
| D2 | Ancho y tipo de canto | No figuran | ABS, 22 mm |
| D3 | Gola C07 404 × 36 | Sin marca de provisoria (OpenCutList y planilla) | nota "Medida provisoria … a confirmar" (confirmada el 16/10: el mock está desactualizado) |
| D4 | Material del tablero de 18 mm | "Blanco nature", "GAUDI" (OpenCutList); "Color Blanco Nature", "Gaudi" (planilla) | "Blanco Nature", "Gaudi" |
| D5 | Material de los fondos de 3 mm | "Blanco nature / 3 mm" (OpenCutList); "MDF 3 mm - Color blanco" (planilla) | "MDF blanco" |
| D6 | Nombre de C07 | "Gola horizontal" (OpenCutList); "Gola Horizontal" (planilla) | "Gola Horizontal" |
| D7 | Nombre del mueble | "Escritorio Oslo - Gaudi + blanco nature.skp" (OpenCutList); "Escritorio Olmo" (planilla) | "Escritorio Olmo" (consulta 48, reexportación) |
| D8 | Qué lados llevan canto | OpenCutList: sin columna. Planilla: solo conteos | lados elegidos por el prototipo (ASUMIDO) |
| D9 | Profundidad | Planilla: 550 mm | 550 mm (el .dae mide 571: pendiente ya conocido) |
| D10 | Placas | OpenCutList: un tablero entero por material (Gaudi 2750 × 1830, fondo 2600 × 1830). Planilla de compra: "1/4 placa" Gaudi y "1/2" de fondo | no lo modela |

**Sin diferencias:** los 21 códigos, las 21 medidas (L × A en el mismo orden), las 21 cantidades (33 instancias: 20 + 10 + 3), los 21 nombres salvo D6, y los conteos de canto de la planilla contra los del mock (21 de 21).

## 13. Historial

- **28/10:** borrador inicial (sesión de solo especificación).
