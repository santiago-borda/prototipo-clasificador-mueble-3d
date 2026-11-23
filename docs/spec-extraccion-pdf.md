# SPEC-B: `OcrLlm`, lectura del PDF de OpenCutList por OCR y LLM

| Campo | Valor |
|---|---|
| Proyecto | PFG-Muebles-3D (Casa Mueble) |
| Módulo | B, apoyo de IA: extracción de datos del PDF (OCR + LLM) |
| Versión | 0.3.1 (v0.3 aprobada el 3/11; reemplaza a la 0.2). La 0.3.1 es una corrección de mantenimiento del 5/11: credenciales fuera del repo, rutas del esquema y bandera de procesamiento externo. No cambia el diseño aprobado |
| Fecha | 03/11/2026 (ajustes del 05/11 en §8, §9, §12, §14 y P-02/P-15: credenciales y salidas del OCR). 05/11: prueba de humo de Cloud Vision, credenciales y conectividad OK en local; no valida calidad del OCR |
| Autores | Santiago Borda, Lautaro Salina |
| Estado | **Aprobada el 3/11** (por el equipo y el profesor). Siguen abiertos los puntos de §15 y la decisión de §5.3; el adaptador de OCR no se programa antes de resolver P-02 y P-12, **salvo el script manual `scripts/ocr-real.ts` con un único PDF real** (`docs/spec-ocr-prueba-real.md`, SPEC-B2, 10/11). P-02 está **parcial** (no resuelta): script listo, a correr por una persona con su clave; P-04 (captura escrita) sigue sin archivar |
| Contrato del que depende | `docs/spec-esquema-pdf.md` (aprobada el 3/11): `CutListPdf`, `FuenteDePdf`, INV-0 a INV-15, catálogo cerrado de razones. **Si esta spec y aquella chocan, manda aquella.** |
| Lo consume | Motor de asociación A (`spec-motor-asociacion.md`), detector de inconsistencias C, sección de cortes (R4) |
| Ubicación propuesta | `docs/spec-extraccion-pdf.md` |

### Cambios de la v0.3.1 (5/11)

1. **Credenciales:** la clave de la cuenta de servicio vive en `$HOME\.secrets\gcp` (fuera del repo), no en `credentials/`. Cambia §8.1, §9, §12 y §14.
2. **Cuenta `ocr-extractor`:** sin el rol de Storage (el OCR con el PDF inline no lo necesita), clave anterior borrada, presupuesto con alertas (§8.1).
3. **Rutas del esquema (§5.1):** pasan a la forma `boards[].pieces[].campo`, según `spec-esquema-pdf.md`. Los nombres exactos se alinean con `src/pdf/types.ts` en la sesión 2 (P-14).
4. **Bandera `PROCESAMIENTO_EXTERNO=permitir`:** confirmada como el nombre vigente (el Estado del proyecto decía `PERMITIR_DATOS_REALES`, que queda en desuso).
5. **Lista sintética (propuesta):** los PDF del fixture sintético, identificados por el sha256 de su manifiesto, no exigen lista blanca real (§8, ver `spec-fixture-sintetico.md` §6; pendiente de aprobación).
6. **§13:** se agrega `hoja-incompleta` a las razones de lectura no ok y se transcribe el texto de §8.3 de la spec del esquema.

---

## 1. Propósito y alcance

`OcrLlm` es el adaptador de `FuenteDePdf` (spec-esquema §8) que lee un PDF **sin capa de texto** y devuelve un `CutListPdf` con `source.reader = "ocr-llm"`. No decide: propone valores con su evidencia, y lo que no puede respaldar queda `null` con su entrada en `pending`. La validación (INV-0 a INV-15), el cruce con el .dae y el nivel de cada fila son **los mismos** que para `TextoPdf` y no se reimplementan acá (spec-esquema §5, §7).

**Dentro del alcance:** rasterizado de páginas, OCR con posiciones, lectura por LLM, reconciliación campo a campo, evidencia para la revisión humana, Eval Harness de la lectura, apagado de la IA (R5).

**Fuera del alcance:**
- El parser de tabla: ya existe como función pura (`parseCutListText`, `src/pdf/`, sesión 1) y se **reutiliza**. El OCR solo reemplaza la extracción (bytes → elementos de texto con posición).
- La conversión a `PieceType[]` y el cruce con el .dae (sesión 2b).
- La pantalla de revisión (queda fuera, como la C del motor). Esta spec solo define la evidencia que ella consumirá.
- El dibujo del despiece, la página de Resumen más allá de lo que el esquema ya toma, el listado de cortes de R4 (no figura en los PDF disponibles, P-07).

## 2. Cambios respecto de la v0.2 (para quien leyó la anterior)

| v0.2 | v0.3 | Motivo |
|---|---|---|
| Salida propia `extraccion.v1` validada con zod | Salida `CutListPdf` + evidencia aparte (§4) | Hay un solo contrato; el repo no usa zod (validador a mano) |
| `Campo<T>` con fuente y crudo en cada campo | `null` + `pending` en el documento; fuente y crudo en `evidence` (§4) | No se duplica el esquema |
| Motivos propios (`DISCREPANCIA_FUENTES`, ...) y V-01 a V-24 | Razones del catálogo cerrado y INV-0 a INV-15 | Una sola validación para las dos fuentes |
| V-02: el código debe coincidir con el proyecto/mueble del contexto | **Eliminada** | El repo trata el código como opaco (AS1) |
| Campo "ok" si coinciden 2 fuentes | **Abierto** (§5.3); por defecto toda fila sale `dudosa` por `origen-ocr` | spec-esquema §7.3 (RP8). La alternativa se decide con datos del harness |
| Parser de tabla propio sobre salida de Vision | Se reutiliza `parseCutListText` | Un solo parser para `TextoPdf` y `OcrLlm` |
| Vision y Gemini como primera implementación | **Sesión 2: Tesseract local, replay y Vision. Sesión 3: Gemini.** Todo envío externo con bandera y lista blanca por hash | Casa Mueble autorizó el envío el 3/11 (§9); segundo fixture incluido |

## 3. Hechos de entrada que condicionan la lectura

Fuente: Casa Mueble (20/10) y relevamiento del 3/11 sobre los PDF del primer fixture y del segundo fixture. Los detalles de la hoja de varias páginas, las columnas presentes o ausentes y el mapeo de cantos están en spec-esquema §2 y §3; acá solo se listan los que afectan al OCR.

| ID | Hecho |
|---|---|
| H-01 | Los PDF **no tienen texto seleccionable** (Microsoft: Print To PDF, solo trazados). La única forma de leerlos es rasterizar y hacer OCR o visión. |
| H-02 | La celda de Designación se parte en 2 o 3 renglones, con íconos intercalados; el código se reconstruye uniéndolos. El OCR puede leer un ícono como letra o símbolo: el parser lo descarta (spec-esquema §7.1) y **nunca se autocorrige** un código. |
| H-03 | Cada celda de canto marcada trae su propio punto de color y el texto "Canto <material> ~0 mm x 22 mm" en 4 renglones. El rótulo "Tiras de cantos" es más angosto que la banda: la posición de las subcolumnas sale de la regla del paso de canto (spec-esquema §8.2, provisoria). La posición de una marca es el centro de la palabra "Canto". |
| H-04 | El color del punto no siempre es rojo (en Blanco es azul). Sirve como **fuente independiente de presencia de marca**, no como dato del esquema (spec-esquema §4 lo deja fuera). |
| H-05 | Las columnas "Ajustadas" y "Tiras de cantos" aparecen solo si el modelo tiene canto definido. Su ausencia significa "no exportado", no "sin canto" (PDF-2 sigue abierto). |
| H-06 | Una página de continuación no repite el encabezado de la tabla: hereda las columnas de la anterior. |
| H-07 | El PDF informa dos cifras de aprovechamiento: "Tasa de llenado" (Resumen) y "Eficiencia" (pie). El esquema guarda ambas por separado (INV-13). |
| H-08 | Las letras de "No." son locales de cada material y se repiten entre tableros; la clave de la fila es el código. |

## 4. Contrato

`OcrLlm implements FuenteDePdf` (spec-esquema §8):

```ts
read(pdf: Uint8Array, fileName: string): Promise<PdfReading>
```

`PdfReading` (ok) devuelve el `CutListPdf` y, **solo en `OcrLlm`**, la evidencia:

```ts
interface FieldEvidence {
  candidates: { ocr?: string; llm?: string; pixels?: string };  // texto crudo de cada fuente
  agreement: "acuerdo" | "discrepancia" | "fuente-unica" | "ilegible";
  bbox?: { page: number; x: number; y: number; w: number; h: number };  // para resaltar en la revisión
}

type Evidence = Record<string, FieldEvidence>;   // clave = path JSON del campo, igual que PendingField.path
```

Reglas del documento:
- `source`: `reader: "ocr-llm"`, `hasTextLayer: false`, `readerVersion` = identificador de la combinación (adaptador de OCR + modelo y versión del prompt del LLM, o `sin-llm`), `pdfId` = sha256 de los bytes.
- **Campo sin acuerdo o ilegible = `null` + entrada en `pending`** (razón `campo-pendiente`). El valor candidato de cada fuente **no se pierde**: va en `evidence`. Así el esquema no se ensucia y la revisión humana ve ambas lecturas.
- Cada entrada de `pending` de `OcrLlm` empieza con la causa: `discrepancia-fuentes: ocr="…" llm="…"`, `fuente-unica`, `ilegible`.
- Ningún `null` sin `pending` (INV-0). Ningún valor se corrige ni se reordena (L y A, INV-7).

## 5. Pipeline

```
PDF ─► 1. Ingesta (sha256 = pdfId, caché)
    ─► 2. Rasterizado (página → imagen)
    ├► 3a. OCR (OcrAdapter) ─► elementos de texto con posición ─► parseCutListText ─► CutListPdf(ocr)
    ├► 3b. LLM (LlmAdapter, PDF nativo o imágenes) ─► JSON ─► validador a mano ─► CutListPdf(llm)
    └► 3c. Detector de marcas de canto por píxeles (usa las celdas de 3a)
    ─► 4. Reconciliación campo a campo ─► CutListPdf + Evidence
    ─► validación común (INV-0 a INV-15) y cruce con el .dae (sesión 2b) ─► revisión humana
```

1. **Ingesta.** `pdfId = "sha256:" + hash`. El mismo PDF con la misma configuración (adaptadores, modelo, versión de prompt y de esquema) devuelve el resultado guardado: reenviar no genera duplicados. La caché y todo archivo intermedio van solo a `.ocr-data/` (§8.2).
2. **Rasterizado.** Imagen por página, en una resolución fija y registrada en `readerVersion`. Herramienta a decidir (P-12).
3. **OCR (3a).** El `OcrAdapter` devuelve palabras con página, x, y, ancho y alto (el mismo tipo que usa `TextoPdf`: `PdfTextElement`, más `pageWidths` en `PdfTextInput`, tal como quedó en la rama `pdf-esquema-sesion-1`). Eso alimenta `parseCutListText` sin cambios. El parser decide qué es fila, columna y marca; el OCR solo aporta palabras.
4. **LLM (3b).** Recibe el PDF o las imágenes y un esquema de respuesta equivalente a `CutListPdf`. Se le indica que **transcriba y no corrija**. La respuesta se valida con el mismo validador de INV-0; si falla, se reintenta una vez y después se toma la pasada como fallida (§7). Es transcripción, no decisión: **No-Wrapper LLM** (motor §1), el LLM no puntúa ni asocia.
5. **Detector de marcas (3c).** Para cada celda de las subcolumnas 1 a 4 (coordenadas del parser) decide si hay un punto de color saturado en la imagen. Los umbrales se calibran con los PDF del segundo fixture (P-01).
6. **Reconciliación (4).** Ver §5.1.

### 5.1 Reglas de reconciliación (conservadoras)

Las rutas siguen la forma del esquema (`boards[].pieces[].campo`, `header.*`, `summary.*`). **Los nombres exactos de los campos de cada tablero y del pie se alinean con `src/pdf/types.ts` en la sesión 2 (P-14).**

| Campo (ruta en `CutListPdf`) | Fuentes | Regla |
|---|---|---|
| `boards[].pieces[].code`, `.name`, `.letter` | OCR, LLM | Iguales tras normalizar espacios y guiones tipográficos → valor, `acuerdo`. Distintos → `null` + `pending`, `discrepancia`. Solo uno → `null` + `pending`, `fuente-unica`. **No se autocorrige** (el `__` final o un `_` inicial llegan tal cual y los trata spec-esquema §7.1). |
| `boards[].pieces[].quantity`, `.finalL`, `.finalA`; `header.thicknessMm`; `boards[].lengthMm`, `.widthMm`; pie del tablero (cantidad de piezas, longitud de cortes, eficiencia); `summary.cutCount`, `summary.cutLengthM`, `summary.fillRatePct` | OCR, LLM | Valores iguales → valor. Cualquier diferencia → `null` + `pending`. **Sin tolerancia.** |
| `boards[].pieces[].edges.s1..s4` (presencia de marca) | OCR (palabra "Canto" en la celda), píxeles, LLM | Las tres fuentes que opinan coinciden → marca o `null`. Cualquier desacuerdo, o una sola fuente → `null` + `pending`, **no** se asume "sin marca". |
| `boards[].pieces[].edges.sK.material` | OCR (texto "Canto <material>"), LLM | Igualdad sin distinguir mayúsculas ni tildes; si no, `null`. El color del punto **no** decide el material. |
| `edges` completo vs `"columna-ausente"` | parser (columnas detectadas) | Lo decide la presencia de los títulos "Ajustadas" y "Tiras de cantos" en el OCR; el LLM contrasta. Desacuerdo → `estructura-no-reconocida` (rechazo). |
| `header.material`, `summary.*` (resto) | OCR, LLM | Como los números y los textos de arriba. Un pie dudoso no marca filas: lo detectan INV-1 e INV-15. |

Principio: **ante la duda, `pending`**. Ninguna regla elige "la fuente más confiable" para romper un empate.

### 5.2 Efecto sobre el nivel de la fila

Rige spec-esquema §7.3: toda fila leída por `OcrLlm` sale `dudosa` con `origen-ocr`. Además, cada campo `null` agrega `campo-pendiente`. Los campos con acuerdo siguen siendo `dudosa` por origen.

### 5.3 Decisión abierta: ¿puede un campo con acuerdo dejar de ser `dudosa`?

**Hoy no** (spec-esquema §7.3). La alternativa propuesta el 3/11 es que un campo salga sin razón cuando al menos dos fuentes independientes coinciden y ninguna discrepa. Para decidirlo con datos, el harness (§11) mide el **error en campos con acuerdo** y el **error en campos con acuerdo de las tres fuentes**. La alternativa solo se adopta si ambos dan **0 sobre el segundo fixture y sobre el primer fixture**, y la adopta el equipo, no esta spec.

## 6. Validación

No hay validaciones propias de B. Después de la reconciliación se aplican las de spec-esquema:
- INV-0 a INV-15 sobre el `CutListPdf` (incluido `hoja-incompleta`, que el parser detecta, y las razones de §7.1).
- Cruce con el .dae (§7.2 de spec-esquema), cuando exista (sesión 2b).

Lo que **sí** controla B (sin razón nueva, como advertencia en `evidence` o en el informe del harness): la eficiencia recalculada (Σ L·A·cantidad / área de la placa) contra la del pie. Tolerancia provisoria ±0,5 pp: en el segundo fixture, Fondo 3 mm da exacto (71,47 %) pero Blanco 18 mm da 82,70 % contra 82,40 % del pie, sin explicar (P-08). No es un invariante hasta entender la diferencia.

## 7. Errores

| Situación | Tratamiento |
|---|---|
| No es PDF, 0 páginas o tamaño excedido | `EntradaInvalidaError`; no se llama a ningún proveedor |
| Ninguna página tiene los títulos de OpenCutList | `{ ok: false, reason: "estructura-no-reconocida" }` |
| Timeout, 429 o 5xx de un proveedor | `ProveedorError`; hasta 2 reintentos con espera creciente |
| Falló una pasada | Se sigue con la otra: todos los campos quedan `fuente-unica` → `null` + `pending` |
| Fallaron las dos pasadas | `{ ok: false, reason: "lectura-fallida" }`: no se devuelve resultado parcial |
| El documento final no valida INV-0 | `esquema-invalido`; es un bug y se registra |

Aserciones internas: un campo con valor nunca puede tener `agreement = "discrepancia"`; ninguna fila de `OcrLlm` puede salir sin `origen-ocr`.

## 8. Adaptadores y sesiones

```ts
interface OcrAdapter { readonly name: string; words(pages: PageImage[]): Promise<PdfTextInput> }
interface LlmAdapter { readonly name: string; readonly modelId: string; extract(pdf: Uint8Array, schema: object): Promise<unknown> }
```

| Sesión | Adaptadores | Condición |
|---|---|---|
| 2 | `TesseractAdapter` (local), `VisionAdapter` (Cloud Vision `files:annotate` síncrono, hasta 5 páginas por pedido, indicando siempre `pages`) y un **adaptador de replay** que lee palabras guardadas como fixtures; mismo `parseCutListText` | Para Vision: credenciales (P-02) y lista blanca. Tesseract y replay no usan red |
| 3 | `LlmAdapter` (Gemini, capa gratis), reconciliación, detector de marcas y harness | Lista blanca por hash; ID del modelo en variable de entorno |

- Cambiar de proveedor implica solo un adaptador nuevo; el ID del modelo va en una variable de entorno.
- Un adaptador que usa la red **se niega a correr** si no están activas la bandera `PROCESAMIENTO_EXTERNO=permitir` y la lista blanca por sha256 que incluye al PDF. La lista blanca real arranca vacía y vive fuera del repo. **Cargador (SPEC-B2, 10/11):** archivo de texto con un sha256 por línea (con o sin `sha256:`; `#` comenta), cuya ruta va en `OCR_LISTA_BLANCA`; el script `ocr:real` admite exactamente una entrada. Detalle en `docs/spec-ocr-prueba-real.md` §5.
- **Lista sintética (propuesta, pendiente de aprobación; ver `spec-fixture-sintetico.md` §6):** los PDF del fixture sintético se identifican por el sha256 de su manifiesto y pasan sin lista blanca real. La decisión es solo por hash: ninguna marca, leyenda ni nombre de archivo habilita un envío.
- Variables de entorno: `OCR_PROVIDER`, `LLM_PROVIDER`, `GEMINI_MODEL_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `PROCESAMIENTO_EXTERNO`.

### 8.1 Credenciales de Google Cloud (actualizado el 5/11)

- **Tipo de credencial (sesión 2):** cuenta de servicio `ocr-extractor` con clave JSON y permisos mínimos (sin rol de Propietario ni de Editor). Al 5/11 se le **retiró el rol "Administrador de objetos de Storage"**, que el OCR con el PDF inline no necesita; la prueba de humo se repitió después del recorte y sigue en OK. La clave anterior fue **borrada** (queda una sola clave de usuario). Hay un presupuesto con alertas: solo avisa y no corta el gasto; un tope real exige bajar la cuota diaria de la API (opcional, sin decidir). Si Cloud Vision acepta además una API key sigue sin verificarse (P-02).
- **Dónde vive la clave:** en `$HOME\.secrets\gcp`, **fuera del repo** (cada integrante genera la suya). `credentials/` en la raíz del repo **ya no se usa**. La clave **no se escribe en el código, no se commitea y no se pega en un chat**. Si se filtra, se elimina en Google Cloud y se genera otra.
- **Cómo se referencia:** solo mediante la variable de entorno `GOOGLE_APPLICATION_CREDENTIALS`, con **ruta absoluta** a ese archivo. Nunca por el repo ni por chat.
- **Red de seguridad en el repo:** `.gitignore` incluye `.secrets/`, `*-key.json`, `*service-account*.json` y `*.p12`. La comprobación sólida de que el historial no tiene claves es `git log --all -S"BEGIN PRIVATE KEY"` (la búsqueda web de GitHub no recorre todo el historial).
- **Dónde se ejecuta:** el adaptador de Vision corre solo del lado servidor (script o ruta API de Next.js), nunca en el cliente. Cliente propuesto: `@google-cloud/vision` (dependencia nueva a aprobar por el equipo, igual que P-12).
- **Despliegue:** en entornos sin sistema de archivos local (por ejemplo Vercel) no hay ruta de archivo; ver P-15.

### 8.2 Salidas locales del OCR (agregado del 5/11)

- Todo archivo que genere la lectura (páginas rasterizadas en PNG, respuestas JSON de Vision o de Gemini, palabras reconocidas, caché de §5 (1)) se escribe **solo en `.ocr-data/`** (raíz del repo, ignorada por git) y **en ninguna otra ruta**.
- Esos archivos contienen datos de Casa Mueble y del segundo fixture (medidas, códigos, canteado): no se commitean.
- Lo que sí puede commitearse como fixture es una **transcripción hecha a mano**: la del primer fixture en `tests/fixtures/pdf/`; los fixtures de replay con palabras del segundo fixture viven en `Sabrina/` (§9).

## 9. Privacidad

- **Autorización (3/11, informada por el equipo):** Casa Mueble aprobó enviar los PDF de OpenCutList a servicios externos de lectura (Cloud Vision y Gemini) para pruebas y desarrollo, con la aclaración de que en la capa gratis de Gemini Google puede usar el contenido y personas de su equipo pueden leerlo. **Falta guardar la captura del mensaje como confirmación escrita (P-04).** Los términos de Cloud Vision no están verificados, y tampoco se sabe aún si Vision usa el contenido enviado.
- **Reconfirmación (10/11):** Santiago Borda reconfirmó con Casa Mueble que se pueden enviar los PDF de OpenCutList, incluidos los del segundo fixture, a Cloud Vision y Gemini (atribución a Casa Mueble). **No hay captura ni confirmación escrita archivada: P-04 sigue abierta.** Habilita la prueba manual de `docs/spec-ocr-prueba-real.md`; la lista blanca sigue decidiendo cuál PDF sale.
- Casa Mueble confirmó también el uso de los archivos del segundo fixture y autorizó enviar sus PDF a esos servicios (3/11, informado por el equipo). Se aplican las mismas reglas que al primer fixture: bandera `PROCESAMIENTO_EXTERNO=permitir` y lista blanca por sha256, sin la cual el adaptador de red se niega a correr.
- Un PDF real entra a la lista blanca solo cuando el equipo agrega su sha256 de forma explícita, sea del primer fixture o del segundo fixture. La autorización de Casa Mueble habilita el envío; la lista blanca decide cuáles PDF se envían de verdad.
- Los fixtures de replay con palabras del segundo fixture viven en `Sabrina/` (ignorada por git) hasta que se decida qué se commitea.
- Las salidas del OCR se guardan solo en `.ocr-data/` (ignorada por git) y la clave de Google Cloud solo en `$HOME\.secrets\gcp`, fuera del repo; ver §8.1 y §8.2. `.ocr-data/` y los patrones de claves de §8.1 deben figurar en `.gitignore` y se verifican con `git check-ignore`.

## 10. R5: IA desactivable

- Con la IA apagada no se llama al LLM. La lectura queda con OCR y detector de marcas; los campos con acuerdo entre esas dos fuentes se mantienen y el resto va a `null` + `pending`. Las validaciones de §6 siguen activas.
- El OCR no se puede apagar: sin texto seleccionable es la única forma de leer el PDF. **Pendiente (P-06):** confirmar con la cátedra qué implica apagarlo (carga manual o `sin-capa-de-texto`).

## 11. Eval Harness

**Dataset (decisión del equipo, 3/11).** **El segundo fixture es el principal** porque sus PDF son los más nuevos (export del 14/10) y los únicos con columnas de canto; **el primer fixture es secundario** (medidas, cantidades, hojas de varias páginas). Los archivos del segundo fixture viven local. Reexportar el primer fixture con canto definido permitiría su ground truth de cantos (P-10).

**Ground truth.** Un `CutListPdf` por PDF, armado a mano por los dos integrantes por separado y conciliado (los fixtures existentes son el punto de partida). Segundo fixture: 10 páginas, 29 códigos, 105 instancias (50 + 13 + 17 + 25 cruzadas con el .dae); falta verificar sus medidas contra el PDF (P-11).

**Casos adversarios** (variantes del ground truth): página de continuación omitida, columna de cantos quitada, puntos de color intercambiados, `__` final y `_` inicial en un código, código duplicado en un tablero, fila omitida, cantidad alterada, resolución menor, rotación leve (±1°), ruido.

| Métrica | Definición | Umbral |
|---|---|---|
| **Valor incorrecto sin `pending`** | Campo con valor distinto del ground truth y sin entrada en `pending` | Se informa; **0 bloquea una entrega** (la fila igual sale `dudosa`, pero un error sin marcar llega a la revisión sin aviso) |
| Error con acuerdo de fuentes | Campo con `agreement = "acuerdo"` y valor incorrecto | **0 es condición** para evaluar la alternativa de §5.3 |
| Error con acuerdo de las tres fuentes (cantos) | Ídem, solo `edges` con OCR + píxeles + LLM coincidentes | Ídem |
| Exactitud por campo | Correctos / total, por tipo de campo | Se informa; umbral después de la primera medición |
| Tasa de `null` | Campos con `pending` / campos totales (carga de revisión) | Se informa |
| Detección de adversarios | Casos con la razón esperada | 100 % |
| Latencia y costo por página | Medidos por proveedor | Sin umbral |

**Modos.** *Replay*: palabras y respuestas guardadas; determinista; corre en `vitest` sin red. *Live*: llama a los proveedores; manual y solo con la lista blanca activa. *Offline*: Tesseract local sobre las imágenes (sesión 2).

## 12. Pruebas

- Adaptador de replay: las palabras guardadas de una página llevan al mismo `CutListPdf` que la transcripción manual (modulo `source`).
- Reconciliación: un caso por fila de §5.1 (acuerdo, discrepancia, fuente única).
- `edges`: marca con las tres fuentes, con dos y con desacuerdo; ninguna marca ausente se interpreta como "sin canto".
- Errores: las filas de §7 con adaptadores simulados.
- Idempotencia: mismo `pdfId` y misma configuración devuelven el mismo resultado.
- R5: con la IA apagada no se llama al `LlmAdapter`.
- Lista blanca: un adaptador de red sin bandera o con hash fuera de la lista no corre.
- Salidas locales (§8.2): el adaptador escribe únicamente bajo `.ocr-data/` (prueba con un directorio temporal); `.ocr-data/` y los patrones de claves de §8.1 están en `.gitignore` (verificación con `git check-ignore`). La clave no está en el repo: `git ls-files` no lista ningún archivo de claves.
- Cobertura propuesta: ≥ 90 % de líneas en reconciliación y validación. Falta confirmarla con la cátedra.

## 13. Cambios que esta spec pide a `spec-esquema-pdf.md`

1. `PdfReading` (ok): campo opcional `evidence?: Evidence` (§4). **Aprobado por el equipo el 3/11; aplicado en §8 de la spec del esquema el 5/11.**
2. `PdfReading` (no ok): razón `lectura-fallida`. **Aprobado por el equipo el 3/11; aplicado en §8 y en el catálogo de §7.3 el 5/11.** La rama `pdf-esquema-sesion-1` ya sumó `hoja-incompleta`: el tipo final queda:

```ts
type PdfReading =
  | { ok: true; document: CutListPdf; evidence?: Evidence }   // evidence: solo OcrLlm
  | { ok: false;
      reason: "sin-capa-de-texto" | "estructura-no-reconocida" | "unidad-no-soportada"
            | "hoja-incompleta" | "lectura-fallida";
      detail: string };
```
   (verificar contra `src/pdf/types.ts`). `lectura-fallida` es razón de lectura, como `sin-capa-de-texto`, no de fila.
3. §8.3: reemplazar el párrafo "Privacidad (PENDIENTE)" por el siguiente texto y borrar la línea "con el segundo fixture no se usa" (**aplicado el 5/11**):
   > **Privacidad.** Usarlo manda el PDF a un servicio externo. Casa Mueble autorizó el 3/11 (informado por el equipo; falta la captura escrita, P-04) el envío de los PDF de OpenCutList, incluidos los del segundo fixture, a Cloud Vision y Gemini, con la aclaración de que en la capa gratis de Gemini Google puede usar el contenido. Un adaptador de red solo corre con `PROCESAMIENTO_EXTERNO=permitir` y el sha256 del PDF en la lista blanca. Detalle, proveedores, reconciliación y evidencia: `docs/spec-extraccion-pdf.md`.
4. Si se adopta la alternativa de §5.3, modificar §7.3 (hoy "siempre `dudosa`").

## 14. Trazabilidad

| Regla o requisito | Sección | Prueba o evaluación |
|---|---|---|
| IA B: extraer, no decidir | §1, §5.1, §5.2 | Harness: valor incorrecto sin `pending` |
| Finales; L y A sin reordenar | spec-esquema INV-7 | Fila con L < A pasa sin cambios |
| Cantos 1 a 4 por posición | H-03, §5.1 | Exactitud de cantos |
| Hoja de varias páginas | H-06, INV-15 | Adversario: página omitida |
| Cantidad por tablero | INV-1, INV-12 | Prueba de consolidación (sesión 2b) |
| Código opaco, sin autocorrección | §5.1 | Adversarios `__` y `_` |
| R5: IA desactivable | §10 | Corrida con IA apagada |
| Sin duplicados al reenviar | §5 (1) | Idempotencia por `pdfId` |
| Envío externo solo con bandera y lista blanca | §8, §9 | Prueba de lista blanca |
| Clave y salidas del OCR fuera del control de versiones | §8.1, §8.2, §9 | Prueba de ruta de salida; `git check-ignore`; `git ls-files` sin claves |
| R4 | Fuera de alcance (P-07) | n/a |

## 15. Pendientes y preguntas abiertas

| ID | Pendiente |
|---|---|
| P-01 | Calibrar el detector de marcas por color con el segundo fixture (¿hay colores de canto además de azul y rojo?). Sesión 3. |
| P-02 | Si Cloud Vision acepta API key o exige cuenta de servicio. Para la sesión 2 se usa la cuenta de servicio con clave JSON (5/11); el uso de API key no está verificado. **Parcial:** credenciales y conectividad verificadas en local con una imagen sin datos de Casa Mueble (5/11); falta correr la prueba con una página del segundo fixture: **el script `scripts/ocr-real.ts` está listo (SPEC-B2, 10/11) y lo corre una persona con su clave**; el equipo decide si cierra P-02 con el resultado. La prueba en vivo con el PDF sintético (`spec-fixture-sintetico.md`, TS-13) cubriría `files:annotate` con PDF inline y lotes, sin cerrar P-02. |
| P-03 | Límites vigentes de la capa gratis de Gemini y del modelo elegido. |
| P-04 | **Sigue sin archivar** (a 10/11, aun con la reconfirmación verbal de Santiago Borda). Guardar la captura de la confirmación escrita de Casa Mueble: envío de PDF a APIs externas (con la aclaración sobre la capa gratis), uso y envío de los archivos del segundo fixture. Pendiente de respuesta: consulta 56 (orden 1 a 4 informado; falta cara de referencia, espejadas y la confirmación escrita). |
| P-05 | Límite de cuerpo de las funciones de Vercel con subida a Blob (si B se despliega allí). |
| P-06 | Alcance de R5 para B con la cátedra. |
| P-07 | Origen del listado de cortes de R4: el PDF actual no lo trae. |
| P-08 | Umbrales del harness y tolerancia de la eficiencia recalculada (82,70 % contra 82,40 % sin explicar). |
| P-09 | Numeración de módulos con más de uno. |
| P-10 | Reexportar los PDF del primer fixture con canto definido (ground truth de cantos del primer fixture). |
| P-11 | Verificar las medidas del .dae del segundo fixture contra el PDF (solo se cruzaron cantidades). |
| **P-12** | **Cómo rasterizar el PDF en la sesión 2 sin una dependencia no aprobada** (herramienta de línea de comandos externa o librería de Node): decisión del equipo antes de programar. |
| **P-13** | **Precisión de Tesseract sobre esta tabla** (letra chica del canto, íconos intercalados): la consulta 58 dice que no alcanza como única vía. La sesión 2 lo mide; no se asume. |
| **P-14** | **Alinear esta spec con la §8.2 de `spec-esquema-pdf.md` y los tipos finales de la rama `pdf-esquema-sesion-1`** (`PdfTextElement`, `PdfTextInput`, `pageWidths`, campos nullable, `campo-pendiente`, nombres de los campos de tablero y de pie usados en §5.1): esta spec los usa según lo informado, sin haber leído el código de la rama. (Ojo: la §8.2 de este documento trata las salidas locales; la §8.2 que cita P-14 es la de spec-esquema-pdf.) |
| **P-15** | **Credenciales de Vision fuera de la máquina local** (testing en `taller-test.casamueble.com.ar`, preproducción, producción; Vercel si corresponde): ahí no hay ruta de archivo, así que el contenido del JSON se carga en una variable de entorno del servidor. Decidir el mecanismo por entorno y quién custodia la clave. Aplica solo si B se ejecuta en un servidor; en la sesión 2 corre local. |
| P-16 | Confirmar si Cloud Vision usa el contenido enviado (términos del servicio) y registrarlo en §9. |

## 16. Inconsistencias que esta spec deja a la vista

| ID | Inconsistencia | Acción |
|---|---|---|
| I-01 | Los PDF del primer fixture no traen "Tiras de cantos" ni "Ajustadas"; solo los del segundo fixture. | Cantos con el segundo fixture; reexportar el primer fixture (P-10). |
| I-02 | El Excel (descartado el 20/10) expresa los cantos como "2 largos 1 corto" y usa "Color blanco" para el fondo de 3 mm (el PDF y el .dae dicen Blanco nature). | Solo como contraste. |
| I-03 | La cifra 12,02 % del fondo de 3 mm es la **tasa de llenado** (Resumen) y 11,80 % la **eficiencia** (pie); ambas son de OpenCutList. El "Estado del proyecto" ya está corregido. Falta decidir qué métrica usa el documento. | Propuesta: eficiencia del pie. |
| I-04 | En el .dae del primer fixture, C20 y C21 (3 mm) usan el material `Blanco_nature` de las piezas de 18 mm. | El cruce con el .dae distingue por espesor (sesión 2b). |
| I-05 | El segundo fixture y el primer fixture comparten `9999-01`; el segundo fixture trae además `9999-02` en el mismo PDF. | La asociación es por (mueble, código); falta numeración única de proyectos con Casa Mueble. |
| I-06 | spec-esquema §8.3 cita un documento `spec-extraccion-pdf` que no estaba en `docs/`. | **Resuelta (5/11):** esta spec está en `docs/spec-extraccion-pdf.md` y la §13 se aplicó. |
| I-07 | El Estado del proyecto (módulo B, v0.2) nombra la bandera `PERMITIR_DATOS_REALES`; esta spec y el equipo usan `PROCESAMIENTO_EXTERNO=permitir`. | Corregir el Estado al cerrar el chat. |
| I-08 | Esta spec nombraba a los dos muebles reales, mientras que `spec-esquema-pdf.md` decía "segundo fixture" para no citar datos del cliente en el repo. | **Resuelta (5/11):** `docs/` se anonimizó ("primer fixture", "segundo fixture" en la prosa). Las rutas reales del repo, en código en línea, quedan como están. |