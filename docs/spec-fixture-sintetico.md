# Especificación — Fixture sintético para el parser y el adaptador de OCR

Versión: v0.2 (5/11/2026). v0.1: borrador de solo especificación. v0.2: §0 resuelta al aplicar la §13 de `docs/spec-extraccion-pdf.md`; implementación en la rama `pdf-fixture-sintetico`.
Antecedentes: `docs/spec-esquema-pdf.md` (`CutListPdf`, INV-0 a INV-15, §8), `docs/test-plan-esquema-pdf.md` (TP-50 a TP-55, TP-72), `docs/spec-extraccion-pdf.md` (v0.3 aprobada el 3/11; v0.3.1 del 5/11), `Estado-del-proyecto.md` (5/11).
Ubicación propuesta: `docs/spec-fixture-sintetico.md`.

---

## 0. Inconsistencias detectadas (estado al 5/11)

| Id | Dónde | Qué choca | Propuesta |
|---|---|---|---|
| I1 | Pedido de esta spec vs `Estado-del-proyecto.md` (módulo B, v0.2) | La bandera se llama `PROCESAMIENTO_EXTERNO=permitir` en el pedido y `PERMITIR_DATOS_REALES` en el Estado | **Resuelta:** la v0.3.1 fija `PROCESAMIENTO_EXTERNO=permitir`; `CLAUDE.md` la usa. Falta corregir el Estado (I-07 de spec-extraccion) |
| I2 | `spec-esquema-pdf.md` §8.3 | Dice que con el segundo fixture `OcrLlm` "no se usa" mientras la titularidad esté pendiente; Casa Mueble lo autorizó el 3/11 (falta la captura escrita, P-04). Además faltan aplicar `evidence` y `lectura-fallida` (aprobados el 3/11) | **Resuelta (5/11):** §8 y §8.3 de spec-esquema actualizadas |
| I3 | `spec-extraccion-pdf-v0.3.md` | No está en `docs/` ni en los archivos del proyecto: esta spec no se pudo contrastar con su texto | **Resuelta:** está en `docs/spec-extraccion-pdf.md`. Si choca con esta spec, manda aquella |
| I4 | TP-72 | Prohíbe cualquier `.pdf` en el repo; un fixture en PDF lo violaría | El PDF sintético **no se commitea**: se regenera de forma determinista (§7, D4) |
| I5 | Estado (v0.2: "validado con zod") vs `spec-esquema-pdf.md` §4 (validador a mano, sin dependencias) | Manda la spec del repo | El fixture no agrega zod |

## 1. Objetivo

Tener un conjunto de PDF **falsos** que imitan el formato real de OpenCutList para:

1. probar el parser (`PdfTextInput` → `CutListPdf`) y el adaptador de OCR (respuesta de Vision → `PdfTextInput`) **sin datos de Casa Mueble**;
2. ejercitar en vivo `files:annotate` de Google Cloud Vision con un PDF inline (la prueba de humo del 5/11 usó una imagen, no un PDF);
3. dejar la suite automática **sin llamadas de red**.

**No es objetivo:** medir la calidad del OCR sobre los PDF reales. Los glifos del fixture no son los de "Microsoft: Print To PDF"; un buen resultado acá no predice el resultado con el segundo fixture (eso sigue dependiendo de P-04).

## 2. Qué lo hace "sintético" (marcado)

| Marca | Valor | Para qué |
|---|---|---|
| Código de proyecto | `9999` (códigos `9999-9X-M0X-Cxx`, formato válido de §7.1) | Nunca coincide con el código de proyecto del proyecto real (primer y segundo fixture) |
| Leyenda en cada página | "FIXTURE SINTÉTICO — NO ES DATO REAL", en el título del recuadro y en el margen superior de cada página (§12) | Visible en la imagen y en la salida del OCR |
| Nombre de archivo | prefijo `sintetico-` | Legible para personas |
| Metadato `/Subject` | `fixture-sintetico/1` | Legible para personas |
| Manifiesto | `tests/fixtures/pdf-sintetico/manifiesto.json` con `synthetic: true` y el sha256 de cada PDF | Fuente de la lista sintética (§6) |

**Regla:** ninguna de estas marcas habilita nada. La compuerta (§6) decide **solo por sha256**; las marcas sirven a las personas y a las pruebas de TS-12.

Datos prohibidos en el fixture (prueba TS-12): el código de proyecto del proyecto real, los nombres de los muebles reales (incluido el nombre anterior del primero), los materiales reales y las medidas de pieza (L, A) de los PDF reales. **La lista vive solo en la prueba y no se escribe en claro en el repo** (ni en esta spec): ver TS-12 en §9. Los parámetros de regla (por ejemplo la constante 0,066) sí se usan: son de la spec, no del cliente.

## 3. Arquitectura: una fuente, cuatro salidas

```
tests/fixtures/pdf-sintetico/fuente.ts   (datos falsos + geometría; escrito a mano)
        │
        ├─► PDF vectorial sin fuentes        (regenerado; no se commitea)
        ├─► PdfTextInput "ideal"             (palabras + bbox, en memoria)
        └─► Respuesta de Vision simulada     (forma de files:annotate, en memoria)

tests/fixtures/pdf-sintetico/esperado/*.json  (CutListPdf esperado; escrito y revisado a mano)
```

- `esperado/*.json` **no** se genera con el mismo código que arma el PDF: si saliera de `fuente.ts`, las pruebas serían tautológicas.
- Las cifras del resumen y del pie (tasa de llenado, eficiencia, número y longitud de cortes) son inventadas pero **coherentes con las piezas** (calculadas una vez a mano y copiadas a `fuente.ts`), para que pasen los invariantes con la tolerancia provisoria de ±0,5 pp.

## 4. Contenido

Tres documentos, un material y espesor cada uno, como los reales:

| Id | Material (inventado) | Espesor | Tableros → páginas | Columnas | Cubre |
|---|---|---|---|---|---|
| S1 | "Gris Sintético" | 18 mm | 1 tablero → p. 2–3 | Finales, Ajustadas, Tiras de cantos | Resumen en p. 1; tablero en 2 páginas con pie solo en la última; continuación sin encabezado de tabla; **dos muebles** (`9999-91` y `9999-92`) en el mismo PDF |
| S2 | "Roble Sintético" | 18 mm | 3 tableros → p. 2–3, 4–5, 6 | Finales, Ajustadas, Tiras de cantos | Un código repartido entre tableros (cantidad por tablero); letras de "No." repetidas entre tableros; hoja con marcas **solo en s1 y s4**; **6 páginas** (obliga a partir el pedido a Vision en lotes de 5) |
| S3 | "Fondo Sintético" | 3 mm | 1 tablero → p. 2 | Solo Finales | Columnas "Ajustadas" y "Tiras de cantos" **ausentes** (`columns.edgeStrips = false`, no "sin canto") |

Propiedades obligatorias de las filas (los valores concretos los fija `fuente.ts`):

- Número de corte continuo en el proyecto (C01, C02, … sin reiniciar entre muebles), como confirmó Casa Mueble el 20/10.
- Al menos dos piezas con **L < A** (la veta), para que nada reordene L y A.
- Designación partida en 2 y en 3 renglones, y una con un ícono intercalado (forma dibujada, sin significado).
- "Ajustadas" = "Finales" − 1 mm por lado con canto, coherente con las marcas.
- Diagrama del tablero simple: rectángulos con su letra, cantidades coherentes con la lista (INV-3). No pretende ser una optimización real.
- El fixture **no toma posición** sobre las contradicciones abiertas (consultas 42 y 44): el código es opaco (AS1) y el fixture no genera QR ni agrupa módulos.

## 5. Geometría de las marcas de canto

Imita lo relevado el 3/11, sin copiar medidas reales:

- Cada celda marcada lleva un punto de color (círculo relleno) y el texto "Canto <material> ~0 mm x 19 mm" en 4 renglones. El color depende del material (uno rojo y uno azul), y el parser no lo lee.
- Subcolumnas **de ancho distinto** dentro de una hoja, con pasos inventados dentro del rango medido (0,058 a 0,067 del ancho de página), por ejemplo 0,060 / 0,063 / 0,065.
- El rótulo "Tiras de cantos" es más angosto que la banda de las 4 subcolumnas.
- Casos que tiene que haber:
  - una hoja (S2) con marcas solo en s1 y s4: el caso en que la regla por página fallaba;
  - una hoja en la que ninguna fila tenga 2 marcas (se usa la constante de respaldo);
  - en una variante (§8), una marca a más de medio paso del centro más cercano → `pending`.

## 6. Compuerta de procesamiento externo

Función pura `puedeEnviar(pdfBytes, env) → { ok: true } | { ok: false; motivo }`, que corre **antes** de cualquier llamada de red:

1. Calcula `sha256` de los bytes.
2. Si el hash está en la **lista sintética** (sale de `manifiesto.json`) → permitido.
3. Si no, exige `<bandera> = permitir` (nombre en D1) **y** el hash en la **lista blanca real** (fuera del repo) → permitido.
4. En cualquier otro caso → bloqueado, con motivo. Nunca decide por nombre de archivo, metadatos ni leyenda.
5. Antes que todo: si `PERMITIR_DATOS_REALES` (en desuso) está definida, con cualquier valor, la compuerta lanza un error explícito y no decide nada (falla cerrada), aunque el PDF sea sintético.

Salidas de Vision: solo en `.ocr-data/` (ignorada por git), en `.ocr-data/sintetico/<sha256>.json`. Credenciales: solo por `GOOGLE_APPLICATION_CREDENTIALS` (`$HOME\.secrets\gcp`); nada del fixture las toca.

## 7. Generación y determinismo

- Generador propio, **sin dependencias nuevas** (D3): escribe un PDF 1.4 con operadores de trazado (`m`, `l`, `c`, `re`, `f`, `S`), una fuente de trazos propia con solo los glifos necesarios (dígitos, letras, `ó í é ú ñ`, `- . , / × ~ %`) y **sin recursos `/Font`**: sin capa de texto, como los reales.
- Determinista: sin fecha de creación ni ID aleatorio; el mismo `fuente.ts` da los mismos bytes y el mismo sha256.
- El PDF se escribe en `.fixtures-gen/` (a agregar al `.gitignore`); no se commitea (respeta TP-72). Se commitea el manifiesto con los hashes.
- Comandos: `npm run fixture:sintetico` (genera y verifica hashes) y `npm run ocr:sintetico` (prueba en vivo; manual, nunca en CI).

## 8. Variantes negativas (perturbaciones)

Se aplican en memoria sobre el `PdfTextInput` ideal o sobre la respuesta simulada de Vision; no generan PDF nuevos.

| Id | Perturbación | Resultado esperado |
|---|---|---|
| V1 | Dígito cambiado en una medida (OCR) | La fila queda `dudosa`; nunca un valor distinto aceptado como seguro |
| V2 | Palabra faltante en la designación | `campo-pendiente` o `codigo-ausente`, según dónde caiga |
| V3 | Código con `__` final | `nombre-anomalo` / `formato-invalido` |
| V4 | Mismo código dos veces en un tablero | `codigo-duplicado-en-tablero` |
| V5 | Pie ausente / repetido | `hoja-incompleta` |
| V6 | Marca de canto desplazada más de medio paso | ese lado va a `pending` |
| V7 | Página fuera de orden en la respuesta de Vision | El adaptador ordena por número de página o devuelve `estructura-no-reconocida`; nunca mezcla filas |

## 9. Pruebas

| Id | Caso | Resultado esperado |
|---|---|---|
| TS-01 | Generar dos veces | Mismos bytes; sha256 igual al del manifiesto |
| TS-02 | PDF generado sin `/Font` | `probeTextLayer` devuelve `sin-capa-de-texto` (cubre TP-52 sin PDF real; la extracción de `TextoPdf` sigue pendiente) |
| TS-03 | Marcado | Leyenda en cada página, prefijo, `/Subject` y manifiesto presentes |
| TS-04 | Parser con `PdfTextInput` ideal de S1, S2 y S3 | Igual a `esperado/*.json` |
| TS-05 | Adaptador con la respuesta simulada ideal | `PdfTextInput` equivalente al ideal (tolerancia de coordenadas a fijar en la implementación); todas las filas `dudosa` con `origen-ocr` |
| TS-06 | Variantes V1 a V7 | Lo de §8; **errores seguros = 0** |
| TS-07 | Cantos (§5) | 0 marcas mal asignadas; s1 + s4 correcto; respaldo por constante; desplazada → `pending` |
| TS-08 | S2 en lotes | El adaptador arma 2 pedidos (5 + 1 páginas) y une el resultado en orden |
| TS-09 | S3 | `columns.edgeStrips = false`; ninguna fila con "sin canto" inventado |
| TS-10 | Compuerta | Sintético sin bandera: pasa. PDF desconocido con metadatos "sintético": bloqueado. Real con bandera y sin hash: bloqueado. `PERMITIR_DATOS_REALES` definida: error. Espía de `fetch`: 0 llamadas en toda la suite |
| TS-11 | TP-72 | `git ls-files` sin ningún `.pdf` |
| TS-12 | Sin datos reales | `fuente.ts`, el manifiesto y `esperado/` no contienen la lista prohibida de §2 (hashes, ver §12); todos los códigos son `9999-`; ninguna medida de pieza (L, A) repite una del primer fixture, ni del segundo si está la carpeta local (si falta, ese caso se saltea con el motivo en el título) |
| TS-13 | Prueba en vivo (manual) | `npm run ocr:sintetico` guarda en `.ocr-data/sintetico/` y reporta diferencias contra `esperado/`; **no es métrica de calidad** |

## 10. Límites

- No mide la calidad del OCR real (glifos distintos). Eso necesita una página del segundo fixture (P-04).
- No cubre Tesseract: requiere rasterizar (P-12, sin resolver).
- La forma exacta de la respuesta de `files:annotate` (por ejemplo, `normalizedVertices` en PDF) se toma de la documentación y se verifica con la salida de TS-13 antes de dar por buena la respuesta simulada.
- Los rótulos que busca el parser siguen sin contrastar con un PDF real; el fixture los copia de la spec, no los valida.

## 11. Decisiones abiertas

| Id | Pregunta | Propuesta |
|---|---|---|
| D1 | Nombre de la bandera: `PROCESAMIENTO_EXTERNO=permitir` o `PERMITIR_DATOS_REALES` | El que fije la v0.3 |
| D2 | ¿Se commitea una respuesta real de Vision del fixture (revisada) para usar como replay? | No en esta sesión: la regla es "salidas solo en `.ocr-data/`" |
| D3 | Generador sin dependencias (fuente de trazos propia) o una dependencia (por ejemplo pdf-lib) | Sin dependencias: pdf-lib con fuentes estándar crearía capa de texto |
| D4 | PDF regenerado y no commiteado | Sí (TP-72) |
| D5 | ¿TS-13 cierra la parte de P-02 "files:annotate con PDF inline y lotes"? | Sí; P-02 sigue parcial hasta la prueba con el segundo fixture |
## 12. Implementación (6/11, rama `pdf-fixture-sintetico`)

Estado: TS-01 a TS-12 implementadas y en verde (`tests/pdf.sintetico.test.ts`, 34 casos). TS-13 escrita y **sin correr** (`scripts/ocr-sintetico.ts`).

| Pieza | Dónde |
|---|---|
| Fuente (datos y geometría) | `tests/fixtures/pdf-sintetico/fuente.ts` |
| Esperado (a mano) | `tests/fixtures/pdf-sintetico/esperado/S1.json`, `S2.json`, `S3.json` |
| Manifiesto (sha256) | `tests/fixtures/pdf-sintetico/manifiesto.json` |
| Generador (layout, fuente de trazos, PDF, salidas) | `tests/helpers/pdfSintetico/` |
| Conversión Vision → `PdfTextInput` (pura) | `src/pdf/ocr/vision.ts` (`visionToTextInput`) |
| Lotes (puro, tamaño como parámetro: depende de P-12) | `src/pdf/ocr/batches.ts` (`pageBatches`) |
| Palabras de OCR → `CutListPdf` con `reader = "ocr-llm"` | `src/pdf/ocr/readWords.ts` (`parseOcrWords`) |
| Compuerta | `src/pdf/ocr/gate.ts` (`puedeEnviar`, `BanderaEnDesusoError`) |
| ¿Capa de texto? | `src/pdf/textLayer.ts` (`probeTextLayer`) |
| Sin red en la suite | `tests/setup/sinRed.ts` (todo `fetch` falla; `setupFiles` de vitest) |
| Comandos | `npm run fixture:sintetico [-- --actualizar]`, `npm run ocr:sintetico` (corren con `vite-node`, que ya viene con vitest: sin dependencias nuevas) |

Desvíos y decisiones respecto de las secciones anteriores:

- **Leyenda:** va en el título del recuadro y en el **margen superior** de cada página, no al pie. El parser toma como filas todo el texto que está debajo de la tabla hasta el pie de la hoja, y una página de continuación no tiene pie: una leyenda abajo se leería como dato de la última fila.
- **TS-12, lista prohibida:** son los SHA-256 de los términos normalizados (sin tildes, en minúsculas), **sin sal**, comparados contra los grupos de 1 a 3 palabras de cada archivo. El test cuenta los archivos con coincidencias y no imprime qué término coincidió. Un autocontrol verifica que el hash detecte los materiales y el título del primer fixture real (leídos de `tests/fixtures/pdf/olmo.json`), sin escribirlos. Las medidas prohibidas son las de **pieza** (par L, A sin orden), leídas de los fixtures reales al correr el test.
- **Límite del hash (TS-12):** el SHA-256 de una palabra común se revierte probando un diccionario. La lista no queda a la vista ni aparece con un `grep`, pero no está protegida contra quien la busque a propósito. Además, `src/`, `tests/` y `CLAUDE.md` ya nombran los muebles reales en claro (solo la prosa de `docs/` está anonimizada).
- **TS-02:** no hay extracción de `TextoPdf` (sigue pendiente, consulta 58). `probeTextLayer` busca `/Font` en el PDF sin comprimir; con object streams (`/ObjStm`) responde "desconocido".
- **Íconos:** en el PDF son rombos dibujados. En los elementos ideales, el de la designación entra como un carácter de uso privado (lo que entregaría una capa de texto; el parser lo descarta). En la respuesta simulada de Vision no aparece: es un dibujo.
- **Texto de canto:** 4 renglones de 4,5 pt ("Canto <1ª palabra>", resto del material, "~0 mm x", "19 mm"). Con 5,5 pt, la segunda línea de dos marcas vecinas quedaba a menos de un alto de distancia y el parser la unía en un solo segmento.
- **Verificación visual:** no se pudo mirar el PDF renderizado (no hay rasterizador local, P-12). La legibilidad de la fuente de trazos se ve recién con TS-13.
- **TS-13:** usa `@google-cloud/vision` (ya en `package.json`) con `batchAnnotateFiles`, PDF inline, lotes de 5 y `DOCUMENT_TEXT_DETECTION`. Antes de cualquier llamada pasa por la compuerta y exige `via = "sintetico"`. Guarda la respuesta cruda en `.ocr-data/sintetico/<sha256>.json` y por consola muestra solo conteos (palabras, pendientes, campos distintos de `esperado/`). La forma de la respuesta que asume `visionToTextInput` (página en `context.pageNumber`, tamaño en puntos, `normalizedVertices`) se verifica con esa primera corrida.
- **Respuesta real de Vision verificada (10/11).** TS-13 se corrió el 10/11 con los tres PDF sintéticos (6, 2 y 3 páginas; las respuestas están en `.ocr-data/sintetico/`, no se commitean). La forma que asume `visionToTextInput` quedó confirmada: `context.pageNumber`, `fullTextAnnotation.pages[0].{width,height,blocks}` y `normalizedVertices` (la respuesta trae además `vertices` y un `confidence` por palabra, que hoy no se usan). Un detalle: Vision informa el tamaño de página **redondeado** (595 × 841 contra 595,32 × 841,92), así que las posiciones salen escaladas en un 0,05 % como máximo.
- **Hallazgos de la lectura (10/11), con los que se calibró `docs/spec-esquema-pdf.md` §8.2 ("Granularidad con OCR"):**
  - *Signos partidos:* "Cant." llega como "Cant" + "."; en la zona de cantos, "~" y "0" son palabras separadas; los guiones del código llegan sueltos ("9999-91" + "-" + "M01-008").
  - *Jitter de las cajas:* las palabras de un mismo renglón se desplazan hasta ±1 pt en vertical (máximo 2 pt) y el alto de la caja varía entre 3 y 8 pt para texto del mismo cuerpo.
  - *Hueco entre palabras:* dentro de un mismo texto llega hasta 1,2 × el alto (el título "Gris Sintético / 18 mm" se partía en dos segmentos); entre celdas distintas el hueco mínimo del fixture es 1,07 × el alto.
  - *Errores de lectura de caracteres:* el guion largo de la leyenda sale "-"; "Escena1" sale "Escenal"; en códigos, la "C" sale "0" u "O" ("M01-C08" como "M01-008", "M01-C02" como "MO1 CO2"); aparecen caracteres cirílicos ("Р", "шб") donde el original tiene letras latinas o dígitos.
  - *"mr" + "mm" duplicado:* "18 mm" y "389 mm" salen como "18 mr" y "389 mr" más un "mm" superpuesto de alto 3 pt. No hay forma de leer eso con certeza: el parser lo rechaza (título de hoja, `hoja-incompleta`) o deja la medida en `pending`. Es el caso que tiene que seguir rechazándose.
  - *Resultado con el parser sin cambios:* `estructura-no-reconocida` en los tres PDF ("El resumen no tiene el título del material o la tabla de tableros").
