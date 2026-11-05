# Especificación — Fixture sintético para el parser y el adaptador de OCR

Versión: v0.1 (borrador para revisión, 5/11/2026). Sesión de solo especificación: sin código.
Antecedentes: `docs/spec-esquema-pdf.md` (`CutListPdf`, INV-0 a INV-15, §8), `docs/test-plan-esquema-pdf.md` (TP-50 a TP-55, TP-72), `spec-extraccion-pdf-v0.3.md` (aprobada el 3/11, todavía fuera de `docs/`), `Estado-del-proyecto.md` (5/11).
Ubicación propuesta: `docs/spec-fixture-sintetico.md`.

---

## 0. Inconsistencias detectadas (resolver antes de aprobar)

| Id | Dónde | Qué choca | Propuesta |
|---|---|---|---|
| I1 | Pedido de esta spec vs `Estado-del-proyecto.md` (módulo B, v0.2) | La bandera se llama `PROCESAMIENTO_EXTERNO=permitir` en el pedido y `PERMITIR_DATOS_REALES` en el Estado | Confirmar cuál fija la v0.3 (D1) y unificar en Estado y `CLAUDE.md` |
| I2 | `spec-esquema-pdf.md` §8.3 | Dice que con el segundo fixture `OcrLlm` "no se usa" mientras la titularidad esté pendiente; Casa Mueble lo autorizó el 3/11 (falta la captura escrita, P-04). Además faltan aplicar `evidence` y `lectura-fallida` (aprobados el 3/11) | Actualizar §8.3 en la misma sesión de Claude Code o en una aparte |
| I3 | `spec-extraccion-pdf-v0.3.md` | No está en `docs/` ni en los archivos del proyecto: esta spec no se pudo contrastar con su texto | Commitear la v0.3 antes de implementar; si choca con esta spec, manda la v0.3 |
| I4 | TP-72 | Prohíbe cualquier `.pdf` en el repo; un fixture en PDF lo violaría | El PDF sintético **no se commitea**: se regenera de forma determinista (§7, D4) |
| I5 | Estado (v0.2: "validado con zod") vs `spec-esquema-pdf.md` §4 (validador a mano, sin dependencias) | Manda la spec del repo | El fixture no agrega zod |

## 1. Objetivo

Tener un conjunto de PDF **falsos** que imitan el formato real de OpenCutList para:

1. probar el parser (`PdfTextInput` → `CutListPdf`) y el adaptador de OCR (respuesta de Vision → `PdfTextInput`) **sin datos de Casa Mueble**;
2. ejercitar en vivo `files:annotate` de Google Cloud Vision con un PDF inline (la prueba de humo del 5/11 usó una imagen, no un PDF);
3. dejar la suite automática **sin llamadas de red**.

**No es objetivo:** medir la calidad del OCR sobre los PDF reales. Los glifos del fixture no son los de "Microsoft: Print To PDF"; un buen resultado acá no predice el resultado con Sabrina (eso sigue dependiendo de P-04).

## 2. Qué lo hace "sintético" (marcado)

| Marca | Valor | Para qué |
|---|---|---|
| Código de proyecto | `9999` (códigos `9999-9X-M0X-Cxx`, formato válido de §7.1) | Nunca coincide con `0001` (Olmo y Sabrina) |
| Leyenda en cada página | "FIXTURE SINTÉTICO — NO ES DATO REAL", en el título del recuadro y al pie | Visible en la imagen y en la salida del OCR |
| Nombre de archivo | prefijo `sintetico-` | Legible para personas |
| Metadato `/Subject` | `fixture-sintetico/1` | Legible para personas |
| Manifiesto | `tests/fixtures/pdf-sintetico/manifiesto.json` con `synthetic: true` y el sha256 de cada PDF | Fuente de la lista sintética (§6) |

**Regla:** ninguna de estas marcas habilita nada. La compuerta (§6) decide **solo por sha256**; las marcas sirven a las personas y a las pruebas de TS-12.

Datos prohibidos en el fixture (prueba TS-12): `0001-`, "Olmo", "Oslo", "Sabrina", los materiales reales ("Blanco nature", "Gaudi", "Cedro", "Blanco Liso") y medidas de tablero copiadas de los PDF reales. Los parámetros de regla (por ejemplo la constante 0,066) sí se usan: son de la spec, no del cliente.

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
| TS-02 | PDF generado sin `/Font` | `TextoPdf` devuelve `sin-capa-de-texto` (cubre TP-52 sin PDF real) |
| TS-03 | Marcado | Leyenda en cada página, prefijo, `/Subject` y manifiesto presentes |
| TS-04 | Parser con `PdfTextInput` ideal de S1, S2 y S3 | Igual a `esperado/*.json` |
| TS-05 | Adaptador con la respuesta simulada ideal | `PdfTextInput` equivalente al ideal (tolerancia de coordenadas a fijar en la implementación); todas las filas `dudosa` con `origen-ocr` |
| TS-06 | Variantes V1 a V7 | Lo de §8; **errores seguros = 0** |
| TS-07 | Cantos (§5) | 0 marcas mal asignadas; s1 + s4 correcto; respaldo por constante; desplazada → `pending` |
| TS-08 | S2 en lotes | El adaptador arma 2 pedidos (5 + 1 páginas) y une el resultado en orden |
| TS-09 | S3 | `columns.edgeStrips = false`; ninguna fila con "sin canto" inventado |
| TS-10 | Compuerta | Sintético sin bandera: pasa. PDF desconocido con metadatos "sintético": bloqueado. Real con bandera y sin hash: bloqueado. Espía de `fetch`: 0 llamadas en toda la suite |
| TS-11 | TP-72 | `git ls-files` sin ningún `.pdf` |
| TS-12 | Sin datos reales | `fuente.ts` y `esperado/` no contienen la lista prohibida de §2 |
| TS-13 | Prueba en vivo (manual) | `npm run ocr:sintetico` guarda en `.ocr-data/sintetico/` y reporta diferencias contra `esperado/`; **no es métrica de calidad** |

## 10. Límites

- No mide la calidad del OCR real (glifos distintos). Eso necesita una página de Sabrina (P-04).
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
| D5 | ¿TS-13 cierra la parte de P-02 "files:annotate con PDF inline y lotes"? | Sí; P-02 sigue parcial hasta la prueba con Sabrina |