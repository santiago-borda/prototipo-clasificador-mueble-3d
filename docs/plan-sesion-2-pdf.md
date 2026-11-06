# Plan — Esquema del PDF, sesiones 2b y 2

Estado: **plan, sin empezar** (3/11/2026). Sigue a la sesión 1 (`src/pdf/`: tipos, razones, validador y parser de elementos de texto). Spec: `docs/spec-esquema-pdf.md`. Plan de pruebas: `docs/test-plan-esquema-pdf.md`. Orden acordado: **2b antes de 2**, porque es código puro y el OCR necesita el cruce con el .dae para contrastar sus filas.

## Sesión 2b — Conversión al listado y cruce con el .dae (código puro)

Sin OCR, sin red y sin dependencias nuevas. No toca el visor, las fichas, el importador ni `PieceType`.

1. **Conversión al listado (§6, INV-14):** `src/pdf/listing.ts`. De `FurnitureValidation` a una fila por código con los campos de `PieceType` que salen del PDF (`qrId` y `moduleId` no salen: los asigna el sistema).
   - Solo con estado `borrador` o `publicable`; un `borrador` queda marcado "requiere revisión" (TP-62, TP-63).
   - **Columna de cantos ausente:** sigue ABIERTO (PDF-2). La conversión no elige `[]` ni `null`: devuelve un valor explícito sin definir, y TP-23 sigue pendiente.
2. **Cruce con el .dae (§7.2):** `src/pdf/crossCheck.ts`. Entrada: el listado y las `Observation` del motor (`docs/spec-motor-asociacion.md` §5.2), escritas a mano mientras no exista el adapter. Razones: `codigo-sin-instancias`, `instancias-sin-fila`, `cantidad-no-coincide`, `medida-no-coincide`, `canteado-no-coincide`. Tolerancia: `FurnitureDef.toleranceMm`. Solo dentro del mismo mueble.
3. **Pruebas:** TP-11, TP-40 a TP-46 y TP-60, que hoy son `it.todo` en `tests/pdf.todo.test.ts`.

**A decidir al arrancar:**
- Dónde vive el tipo `Observation`: el motor lo define en `src/engine/types.ts`, que no existe. Propuesta: crear solo ese archivo de tipos, sin lógica.
- TP-61 (`listadoId`) sigue sin función del motor: no se escribe una propia (RP9). Queda pendiente hasta el motor, salvo que se decida adelantar esa función.
- TP-40 usa el .dae real del primer fixture, que necesita three y `DOMParser`: se prueba con `tests/helpers/loadModel.ts` o se deja para cuando exista el adapter.

## Sesión 2 — Adaptador de OCR

**Avance (6/11, rama `pdf-fixture-sintetico`):** los puntos 1 y 2 están hechos para Vision, como funciones puras: `src/pdf/ocr/vision.ts` (respuesta de `files:annotate` → `PdfTextInput`) y `src/pdf/ocr/readWords.ts` (`parseOcrWords`, con `reader = "ocr-llm"`), probados con el fixture sintético (`docs/spec-fixture-sintetico.md` §12). Falta el punto 3 con salidas reales y conectar el cliente (P-02, P-04 y P-12). La 2b sigue: `docs/spec-sesion-2b-listado-cruce.md`.

Objetivo (`CLAUDE.md`): adaptador de OCR con fixtures y **el mismo parser** de la sesión 1 (§8.3, propuesta del 3/11). De la salida de un OCR a `PdfTextInput`, y de ahí a `parseCutListText`. Sin LLM: eso es la sesión 3.

1. **`src/pdf/ocrAdapter.ts`, puro:** palabras con caja de un OCR (formato a fijar) → `PdfTextElement[]` y `pageWidths`, con origen arriba a la izquierda. Sin llamadas de red en la función: la salida del OCR se recibe ya hecha.
2. **Lector en `parseCutListText`:** hoy fija `reader: "texto-pdf"` y `hasTextLayer: true`. Hace falta poder decir `reader: "ocr-llm"` y `hasTextLayer: false`, para que toda fila salga `dudosa` por `origen-ocr` (TP-53). Es un cambio chico en `PdfTextInput`.
3. **Fixtures:** salidas de OCR grabadas. Las del primer fixture solo con OK explícito del equipo; las del segundo fixture, en `Sabrina/` (ignorada) mientras no se decida otra cosa (RP11).
4. **Pruebas:** salida grabada → mismo resultado que el fixture transcripto, o `pending`, nunca un valor inventado. Palabras mal leídas ("Cant0") → `pending`, no corrección.

**Lo que la sesión 1 ya deja medido** (§8.2): la geometría de los trazados de los PDF del segundo fixture. Las posiciones de las marcas de canto salen de los trazados **sin OCR ni servicios externos**: sirven de verdad independiente para evaluar al OCR en s1 a s4.

**Riesgos conocidos:**
- El texto de canto mide ~5,5 pt y está en 3 renglones. El análisis del 23/10 vio a Tesseract confundir códigos y medidas.
- Un OCR no ve el punto de la marca: si no lee "Canto", la marca se pierde en silencio, y esa fila parecería sin canto. Hay que comparar contra los trazados y decidir cómo señalarlo.
- El parser supone textos que no se contrastaron con ningún PDF (§8.2, "Textos esperados"). El OCR será la primera lectura real de esos rótulos: es probable que haya que ajustarlos.

**A decidir antes de arrancar:**
- Qué motor de OCR: local (dependencia nueva, a aprobar) o servicio externo.
- **Privacidad:** el envío de PDF a APIs externas sigue PENDIENTE de confirmación escrita (§8.3). Sin ella, solo OCR local. Vale también para abrir páginas desde un asistente con API externa: la medición del 3/11 se hizo con scripts locales que solo imprimen números.
- `spec-extraccion-pdf`: el borrador del 3/11 que cita §8.3 no está en `docs/`. Hay que incorporarlo y alinearlo con esta spec antes de esta sesión.
