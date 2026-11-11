# Revisión de la lectura por OCR tras la primera corrida real

| Campo | Valor |
|---|---|
| Versión | 0.8 **APROBADA** (0.2 **aprobada**; la 0.3 suma tres decisiones de Santiago del 10/11/2026: P-R4, N-1 y la recomendación sobre la enmienda D; la 0.4 propone R-11 y reabre §2.1 tras la corrida 2; la 0.5 propone R-12 y R-13 y repite el lookahead; la 0.6 registra las decisiones de Santiago sobre R-12 y R-13, diagnostica P-R5 y propone opciones sin elegir; la 0.7 cierra P-R5, redacta R-14 (opción C, elegida por Santiago), redacta C6 y C7 y arma el paquete de aprobación, `docs/paquete-aprobacion-ocr-real.md`; la 0.8 registra la aprobación de los ítems 1 a 14 del paquete por el equipo y el profesor, informado por Santiago el 11/11/2026; ver Historial) |
| Estado | **Aprobado** por el equipo y el profesor, informado por Santiago el 11/11/2026: ítems 1 a 14 de `docs/paquete-aprobacion-ocr-real.md`, incluida la enmienda D con E-1 y E-2 (evidencia: respuestas al mensaje de aprobación, a archivar). La v0.2 (R-1 a R-10, C1, C2) fue aprobada por equipo y profesor, informado por Santiago el 10/11/2026 (evidencia: a archivar). Quedan aprobados con la fecha del 11/11/2026: R-11 (con O-R11-1 a O-R11-4), R-12 (con O-R12-1 y O-R12-2), R-13 (con O-R13-1 y O-R13-2; O-R13-3 no se adopta), R-14 (opción C de P-R5), C4 a C7, §2.1b, §2.5, §4.7, TP-108 a TP-133, la actualización de TP-99, CA-8 a CA-10, el límite conocido de los cantos, H-E, la línea base nueva de TP-106, y las decisiones de la v0.3 (P-R4, N-1) y la aclaración de R-7. P-R5 está cerrada; P-R10 sigue abierta como hipótesis y no bloquea |
| Revisa | `docs/spec-esquema-pdf.md` §8 (tipo `PdfReading`) y §8.2 ("Granularidad con OCR", "Textos esperados"), `docs/spec-extraccion-pdf.md` §5 (paso 3) y §13, y `docs/spec-ocr-prueba-real.md` (SPEC-B2) §4, §7, §11 y §14 |
| Aplicado en | `spec-esquema-pdf.md` (§8, §8.2, §13), `spec-extraccion-pdf.md` (v0.3.3), `spec-ocr-prueba-real.md` (v0.4) y `test-plan-esquema-pdf.md` (TP-95 a TP-133). La enmienda D a SPEC-B2 (validación con otro PDF, §7) está aprobada y aplicada en SPEC-B2 v0.4 y en `docs/spec-ocr-prueba-real-enmienda-d.md` v0.2; **la validación no se corrió**: la hace Santiago en su consola |
| Origen | Primera corrida de `npm run ocr:real` con un PDF real del segundo fixture (Cedro 18 mm, 5 páginas): `lectura: rechazado (estructura-no-reconocida)`. Diagnóstico local sobre la respuesta guardada, sin red |
| Regla de datos | Este documento no contiene texto, códigos, medidas ni hashes del PDF real. Solo estructura: cantidad de palabras, clases de palabra (número, palabra, signo), rótulos que ya figuran en la spec, signos separadores verificados por el equipo y separaciones relativas al alto de la caja |

---

## 1. Contradicciones con specs aprobadas

| Id | Texto aprobado | Qué cambia | Estado |
|---|---|---|---|
| C1 | `spec-extraccion-pdf.md` §5, paso 3: las palabras del OCR alimentan `parseCutListText` "**sin cambios**"; §1: el parser "se reutiliza" | Cambia cómo el parser localiza unidad, fecha, medida del tablero, material, tipo de tablero y pie (§4). §5 paso 3 pasa a decir "con el mismo parser para `TextoPdf` y `OcrLlm`" | **Aprobada (10/11).** Aplicada en spec-extraccion v0.3.2 |
| C2 | `spec-esquema-pdf.md` §8 y `spec-extraccion-pdf.md` §13: `PdfReading` no ok = `{ ok, reason, detail }` | Se agregan `rule` (id de un catálogo cerrado) y `page` (número o `null`), sin texto del documento (§6) | **Aprobada (10/11).** Aplicada en los dos documentos. `src/pdf/types.ts` no cambia hasta la implementación |
| C3 | SPEC-B2 §1: "un único PDF real" | Validación con un segundo PDF (§7) | Protocolo **aprobado**. Su enmienda D a SPEC-B2 está **aprobada** (informado por Santiago el 11/11/2026; `docs/spec-ocr-prueba-real-enmienda-d.md` v0.2) y aplicada en SPEC-B2 v0.4 |
| C4 | `spec-esquema-pdf.md` §8.2, "Textos esperados": la fila de la tabla del Resumen es "<material> / <espesor> mm" más celdas numéricas, y cada celda va a la columna del encabezado más cercana | La fila trae una cola de texto después del material, y el encabezado trae una columna que el esquema no usa. Hace falta una regla para las filas del Resumen (R-11, §4.4) | R-11 **aprobada por Santiago (10/11/2026) y por el equipo y el profesor (informado por Santiago el 11/11/2026)** (origen: corrida 2, `resumen-tabla-vacia`, §2.1b) |
| C5 | `spec-esquema-pdf.md` §8.2, "Designación e íconos": "se descarta el elemento que no tenga letras ni dígitos"; "Filas": la fila empieza en cada elemento de la columna "No." | El guion del código llega como palabra suelta y se descartaba (R-12); una letra de fila llega en cirílico o duplicada (R-13) | R-12 y R-13 **aprobadas por Santiago (10/11/2026) y por el equipo y el profesor (informado por Santiago el 11/11/2026)** (origen: lookahead, §2.5, H-A y H-B) |
| C6 | `spec-extraccion-pdf.md` §3 (H-02: "nunca se autocorrige un código") y §5.1 (fila `.code`, `.name`, `.letter`: "no se autocorrige") | R-13 normaliza un carácter de la **letra de fila** con una tabla cerrada: es una excepción a H-02, acotada a `.letter`, con la justificación de §4.6. R-12 **no** convierte otros guiones: no es excepción | **Aprobada por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026).** Ajustes redactados en spec-extraccion v0.3.3 (aprobada) (§3, H-02; §5.1) |
| C7 | `spec-esquema-pdf.md` §8.2, R-8 (aprobada en la v0.2): "una medida sin límite a la izquierda no se lee y la hoja se rechaza" | R-14 tolera una palabra suelta (el pictograma de la banda) y acepta la medida solo si es igual a la fila del Resumen; agrega el id de rechazo `hoja-medida-sin-respaldo` al catálogo cerrado (§4.7) | R-14 **elegida por Santiago el 10/11/2026 (opción C de P-R5) y por el equipo y el profesor (informado por Santiago el 11/11/2026)** |

## 2. Hechos medidos (corrida 1, 10/11)

Están medidos sobre `.ocr-data/real/<id>.vision.json` con el parser de hoy y `OCR_LAYOUT` (`joinGapRatio` 1,5, `glueGapRatio` 0,4). "Separación" es el hueco horizontal entre dos palabras dividido por el alto de la más baja de las dos.

| Página | Palabras | Renglones | Rol |
|---|---|---|---|
| 1 | 117 | 12 | Resumen |
| 2 | 288 | 56 | Hoja 1 / 2, primera página |
| 3 | 244 | 40 | Hoja 1 / 2, continuación (con pie) |
| 4 | 291 | 60 | Hoja 2 / 2, primera página |
| 5 | 250 | 45 | Hoja 2 / 2, continuación (con pie) |

### 2.1 Qué encontró el parser y qué no

| Dato | Regla actual (`src/pdf/parseText.ts`) | Estructura observada | Resultado |
|---|---|---|---|
| Unidad | `MILLIMETER` sobre el **segmento entero** (l. 183) | La palabra llega sola y cumple la regla. Comparte renglón con fecha, hora y "pm", precedida de la barra vertical `\|` (P-R3, P-R6). Separaciones entre esas palabras: 0,09 a 0,64 | Se une en un segmento de 30 caracteres. **Primer rechazo** (`estructura-no-reconocida`) |
| Fecha | `DATE` = prefijo `^dd/dd/dddd\s+\d` | La misma unión | **Error latente sin aviso.** Si la unidad se leyera, `header.generatedAt` tomaría todo el segmento, unidad incluida. Es un valor mal leído sin `pending` |
| Título del resumen | `MATERIAL` sobre el segmento | Cumple. Antes del `/` hay 5 palabras pegadas (separaciones 0,2 a 0,44): el título del documento, la barra `\|` y el material (P-R4, §2.4); hacia la derecha hay un hueco de 12,9 | **Error latente sin aviso, confirmado por la estructura:** `MATERIAL` toma todo lo que va antes del `/`, así que `header.material` saldría con el título del documento y la barra pegados al material, sin `pending`. Por la lectura de la regla; no se ejecutó con la respuesta guardada |
| Tabla del resumen | Rótulos `Cant.`, `Longitud`, `Anchura`, `Σ Areas`, `Σ Partes`; `Configuraciones`, `Estadísticas` | Se encuentran todos | ~~OK~~ **Reabierto (10/11): solo se miraron los rótulos del encabezado, no la fila de datos.** La fila trae una cola de texto y el encabezado una columna más (§2.1b) |
| Encabezado de hoja | `SHEET`, `MATERIAL`, `BOARD_SIZE` y `/^Tablero/` en segmentos separados | **Un solo renglón** en las 4 páginas: `<material> <n> mm - <n> mm x <n> mm - Tablero estándar`, después un hueco de unos 19 y `i / N`. Separaciones: material → número 1,2 a 1,4 (ahí está el `/` que el OCR perdió, §2.4); dentro de cada campo 0,25 a 0,62; `-` → número 2,2 a 2,4; `-` → "Tablero" 0,8 a 1,0 | `SHEET` se encuentra. `MATERIAL` no (falta `/`). `BOARD_SIZE` y `Tablero` no: la medida queda pegada a "- Tablero estándar" |
| Página 4 | — | En el hueco `-` → número (2,2 a 2,4 en las otras páginas) llega una **letra suelta**, con separaciones 1,37 y 0,50. Todo el renglón queda unido | La medida de esa hoja queda sin límite claro (§4). Origen sin verificar (P-R5) |
| Encabezado de tabla | `Finales`, `Ajustadas`, `No.`, `Cant.`, `Tiras de cantos`, `L`, `A` | Están en las páginas 2 y 4. En las 3 y 5 faltan, como ya decía §8.2 ("la continuación no repite el encabezado de la tabla") | OK |
| Pie | `PIECE_COUNT` = `^\d+\s*piezas?$` sobre el segmento | Páginas 3 y 5. **Un solo renglón**: `La fibra sigue la longitud <signo> <n> piezas`, un hueco de 12 a 14 y `Longitud de cortes : <dec> <letra> <signo> Eficiencia : <dec> %`. Separaciones internas de 0,0 a 0,73. El signo del pie **no se verificó** en el PDF | `PIECE_COUNT` no se encuentra (rechazo `hoja-incompleta`). `Longitud de cortes` y `Eficiencia` quedarían en `pending` (seguro) |

Si solo se arreglara la unidad, el orden de rechazo previsible sería: `hoja-incompleta` en la p. 2 (material, l. 337), después `estructura-no-reconocida` (medida, l. 585) y después `hoja-incompleta` (pie, l. 398). **Supuesto**: no se ejecutó. **Refutado por la corrida 2 (10/11):** el primer rechazo tras la unidad fue `resumen-tabla-vacia` (página 1), que esta lista no preveía porque no miró la fila de la tabla del Resumen (§2.1b, §2.5).

### 2.1b Reapertura de §2.1 (10/11): revisión de cada afirmación — **aprobado por el equipo y el profesor (informado por Santiago el 11/11/2026)**

Motivo: la fila "Tabla del resumen" decía OK mirando solo las anclas del encabezado y la corrida 2 mostró que no lo era. Se revisó cada afirmación de §2.1 contra la corrida 2 (`resumen-tabla-vacia`, página 1) y contra una sonda local (§2.5). "Sonda" = una copia del parser, sin versionar, que anota cada rechazo en vez de abortar; con el Resumen leído (cola y celda extra quitadas, lo que haría R-11). Solo conteos y banderas.

| Afirmación de §2.1 | Qué se verificó el 10/11 | Veredicto |
|---|---|---|
| Unidad: llega sola, cumple la regla; la unión la rechazaba | Con R-4 el parser ya pasa la unidad (corrida 2) | **Confirmada** |
| Fecha: error latente sin aviso (arrastraba la unidad) | Con R-5, la sonda lee `generatedAt` (no queda en `pending`); por construcción del patrón (fecha, hora y "am"/"pm"), sin la unidad. No se imprimió el valor. La comparación con la transcripción ignora espacios (N-1) | **Confirmada** |
| Título del resumen: error latente, "por la lectura de la regla; no se ejecutó" | La corrida 2 **no** ejercitó R-7: el título se resuelve después de leer las filas, y el parser cortó antes (`resumen-tabla-vacia`). Con la sonda (Resumen leído) R-7 no rechaza, y `header.material` y el espesor son iguales a los de la fila de la tabla | **Confirmada solo con la sonda**; la corrida real todavía no la ejercita |
| Tabla del resumen: rótulos presentes, "OK" | Los 5 rótulos están, **en una sola línea de encabezado de 7 segmentos** (dos más que las anclas). La fila de datos no se había mirado: es **una línea de 7 segmentos con una cola de texto en el primer** (`<material> / <n> mm - <2 palabras>`, 7 palabras) y una celda `-` bajo un encabezado sin ancla (supuesto: `Σ Costos`). Ningún separador parte la fila | **Refutada** (era la causa del rechazo de la corrida 2). R-11 |
| Encabezado de hoja: un solo renglón; `SHEET` se encuentra, `MATERIAL` no, `BOARD_SIZE` y `Tablero` no | Con R-6 y R-8, la sonda: contador `i / N` en las 4 páginas; material por la variante /-b en las **4** (el `/` falta siempre); medida y tipo leídos en 3 de 4 | **Confirmada** (la 4.ª es el caso siguiente) |
| Página 4: una letra suelta, origen sin verificar | La banda de la p. 4 tiene una palabra más que las otras (14 contra 13) y R-8 no lee la medida: rechazo `hoja-sin-encabezado-completo`, página 4, el **único** rechazo que queda tras R-11 | **Confirmada.** P-R5 **cerrada** (Santiago, 10/11, mirando el PDF): es un pictograma (ícono de tablero) entre el `-` y la medida, presente en las 4 páginas; en la p. 4 Vision lo leyó como una letra minúscula suelta y en las otras tres no leyó nada. La hipótesis de la etiqueta del diagrama queda descartada. Regla: R-14 |
| Encabezado de tabla: en las p. 2 y 4, no en las 3 y 5, "OK" | Tabla detectada: p. 2 sí, p. 3 no, p. 4 sí, p. 5 no. Las dos hojas tienen las mismas columnas (no habría `hojas-columnas-distintas`) | **Confirmada, pero el OK vale solo para el encabezado.** Las filas de debajo no se habían medido: ver §2.5 |
| Pie: `PIECE_COUNT` no se encuentra; `Longitud de cortes` y `Eficiencia` quedarían en `pending` | Con R-9, el pie se lee en las p. 3 y 5: cantidad de piezas, longitud de cortes y eficiencia, **sin** `pending` | **Confirmada** la falla de antes; la previsión de `pending` ya no aplica (R-9 los lee) |
| "Si solo se arreglara la unidad, el orden de rechazo previsible sería…" | El primer rechazo fue otro (`resumen-tabla-vacia`) | **Refutada** |
| Separaciones y huecos de §2.1 y §2.2 | La fila del Resumen agrega estas medidas (× alto de la caja): palabras consecutivas dentro del primer segmento, 0,25 a 0,67; entre celdas, 2,14 a 9,17; hacia la celda `-`, 42 y 50 | **Ampliada**; los rangos de §2.2 no cambian |

**Lección para el método:** "OK" se había escrito con los rótulos como evidencia y la fila como supuesto. Desde ahora, una afirmación "OK" de esta sección nombra qué se midió (rótulos, filas, valores) y qué no.

### 2.2 Por qué no alcanza con mover un umbral

| Huecos | Rango medido |
|---|---|
| Entre palabras de un mismo campo, PDF real | 0,18 a 0,62 |
| Entre campos distintos de un mismo renglón, PDF real (con un signo en el medio) | 0,27 a 1,0 |
| Entre palabras de un mismo texto, fixture sintético (spec-fixture-sintetico §12) | hasta 1,2 |
| Entre celdas distintas, fixture sintético | desde 1,07 |

En el PDF real, los campos distintos están **más cerca** que las palabras de un mismo texto del fixture sintético. Los rangos reales se solapan entre sí. **Ningún `joinGapRatio` único separa los campos del PDF real y a la vez une los textos del sintético.** La diferencia con el diseño original: el parser supone que cada dato es un segmento aislado, y en el PDF real los datos van en renglón corrido, separados por signos.

### 2.3 Correcciones al diagnóstico anterior (misma fecha)

1. La separación de 1,37 de la p. 2 está entre el material y su espesor, **no** junto a la medida del tablero. La medida no se encuentra porque queda pegada a "- Tablero estándar" (0,50 y 1,00).
2. En el segmento de la unidad, lo que había reportado como "mm" es "pm", que es parte de la hora (P-R6).
3. Las páginas 3 y 5 tienen el mismo renglón de encabezado de hoja que las 2 y 4. Lo verificó el equipo en el PDF (§2.4).

### 2.4 Verificación del equipo en el PDF (10/11, Santiago Borda)

| Hecho | Consecuencia |
|---|---|
| 5 páginas: resumen y 2 tableros (páginas 2-3 y 4-5) | Coincide con spec-esquema §2 |
| La banda de título (material, espesor, medida, "Tablero estándar") y `i / N` están en las páginas 2 a 5, también en las de continuación | INV-15 (b) se mantiene tal cual. P-R1 cerrada |
| El `/` entre material y espesor **es parte del título**; el contador tiene otro `/` | El OCR **perdió** ese `/` en las 4 páginas (llega un hueco de 1,2 a 1,4 en su lugar). No es otro formato. P-R2 cerrada |
| En la banda de título de las hojas, los campos se separan con " - " | P-R3 cerrada para la banda. El OCR devolvió `-` |
| En la cabecera de la página 1, la fecha-hora y la unidad se separan con una barra vertical `\|` | P-R3 cerrada para la cabecera. El OCR devolvió un signo de un carácter |
| "pm" es parte de la hora, pegada a la fecha; la unidad va aparte, después de la barra | P-R6 cerrada. `generatedAt` = fecha + hora con "pm"; nunca la unidad |
| En la página 1, las cinco palabras a la izquierda del `/` son "Diagrama de corte", la barra `\|` y el material, que es **solo** la palabra pegada al `/`. "Diagrama de corte `\|`" es el título del documento y la barra es un separador (Santiago, 10/11) | P-R4 cerrada. La barra es un separador de R-10, así que **hay límite a la izquierda del material**: R-7 se aplica por su primera rama (§4). El título del documento no va a ningún campo del esquema |
| El pie con la cantidad de piezas aparece solo en la última página de cada tablero (3 y 5) | Coincide con INV-15 y con lo observado |
| El código viene partido en dos renglones y, en algunas filas, con un ícono en el medio | Coincide con spec-esquema §7.1 y H-02. **No está verificado cómo lo devuelve Vision** (la corrida no llegó a las filas): riesgo RL-1 (§4.3) |

### 2.5 Lookahead (10/11): qué más falla una vez leído el Resumen — **aprobado por el equipo y el profesor (informado por Santiago el 11/11/2026)**

Para descubrir en un solo ciclo las reglas que faltan, en lugar de una por corrida: la sonda de §2.1b recorre las páginas 2 a 5 con el Resumen leído, anota cada rechazo del parser vigente y sigue con un valor neutro. **Es diagnóstico sobre la respuesta guardada del PDF de la corrida 1; no es una medición de lectura** (§6.2) y no se ajustó ningún parámetro. Solo conteos, banderas y nombres de reglas.

**Rechazos del parser vigente, en orden:** uno solo, `hoja-sin-encabezado-completo`, página 4 (R-8, letra suelta). Todo lo que sigue son `pending`, no rechazos.

| Página | Banda de hoja | Pie | Filas y `pending` (sonda) |
|---|---|---|---|
| 2 (hoja 1/2) | /-b; medida y tipo leídos | no aplica | 6 filas, una de ellas **vacía** (ancla duplicada, H-B); `pending` de código en todas |
| 3 (hoja 1/2, continuación) | /-b; medida y tipo leídos | leído (cantidad, longitud, eficiencia) | 6 filas; `pending` de código en todas |
| 4 (hoja 2/2) | **rechazo R-8** (medida no leída); /-b y tipo leídos | no aplica | 5 filas; `pending` de código y de cantos en todas |
| 5 (hoja 2/2, continuación) | /-b; medida y tipo leídos | leído (cantidad, longitud, eficiencia) | 6 filas, una de ellas **fusión de dos filas** (H-B); `pending` de código y de cantos en todas, y de cantidad, L y A en la fusionada |

Totales de la sonda: 23 filas (12 en la hoja 1/2 y 11 en la 2/2; la referencia contada a ojo por Santiago es 11 y 12, y el total coincide); Σ `quantity` leída 17 de 17 en la hoja 1/2 y 20 de 25 en la 2/2; `pending` por tipo: código 23, nombre 1, cantidad 2, L 2, A 2, cantos 11. Encabezado y resumen: sin `pending` (la unidad, `generatedAt` y el material se leen).

**Hallazgos, candidatos a regla (no redactados; necesitan decisión):**

- **H-A. Código.** El `-` interior del código llega como **palabra aparte** (`M01 - C04`) y §8.2 ("Designación e íconos") descarta toda palabra sin letras ni dígitos: se pierde el guion y **0 de 23 códigos** cumplen el formato. Conservar la palabra `-` recupera 17 de 23 (conservar cualquier signo, salvo íconos privados o el braille en blanco, recupera 14). Las 6 restantes coinciden en número con las filas cuyo primer renglón trae palabras extra con letras o dígitos (12 filas con palabras extra en ese renglón; 6 de ellas con letras o dígitos; no se cruzó fila por fila): el ícono leído como letras, dígitos o signos, es decir RL-1 (§4.3) hecho real, y hoy termina en `pending` (seguro). La pérdida es de tasa de lectura, no un valor falso.
- **H-B. Anclas de la columna "No.".** (i) Una letra de fila llega en **cirílico mayúscula** y el ancla es solo `[A-Z]` ASCII: la fila se **funde con la anterior** (1 caso, p. 5): cantidad, L y A de esa fila quedan en `pending`, y la Σ de cantidad no cierra con el pie (la validación no marca la suma porque hay un `null` con su `pending`, TP-91). (ii) En la p. 2 la misma letra de fila llega **duplicada** (cajas "MM" y "M", a 0,14 del alto): el ancla duplicada abre una fila **vacía** (cantidad, L, A, código y nombre en `pending`). Ninguna da un valor falso; las dos ensucian el recuento de filas.
- **H-C. Cantos.** El paso entre subcolumnas es la menor distancia entre marcas de una fila de toda la hoja, **con tope y sin piso** (§8.2). La fila fusionada de H-B pone dos marcas casi en la misma x: el paso sale 0,01 veces la constante, las 15 marcas de la hoja 2/2 quedan a más de medio paso y las **11 filas** de esa hoja terminan con `pending` en `edges`. En la hoja 1/2, 0. Es seguro, pero pierde todas las marcas de una hoja por una sola fila. Se arregla solo si se arregla H-B, o con un piso (un número nuevo, PROVISORIO).
- **H-D. Razones secundarias.** Con valores neutros de la medida del tablero, la validación da `campo-pendiente`, `formato-invalido`, `codigo-duplicado-en-tablero`, `letra-inconsistente`, `diagrama-no-coincide` y `codigo-ausente`; todas las filas quedan `dudosa`, ninguna se rechaza. Derivan de H-A y H-B (INV-3, INV-4 e INV-6 necesitan código y letra); no se evaluaron aisladas.
- **No se vio ningún valor mal leído sin `pending`** en lo que la sonda llegó a leer. Eso **no** prueba ausencia de errores: es una corrida de desarrollo sobre un PDF (§7).

La afirmación de §4.2 ("Qué no cambia: la lectura de filas, columnas y marcas de canto") queda **sujeta a revisión** con estos hallazgos.

**Ronda 2 (10/11): el lookahead con R-11, R-12 y R-13 simuladas en la sonda.** Misma sonda y mismo método; R-12 y R-13 se aplicaron como están redactadas en §4.5 y §4.6 (con las decisiones de Santiago: ícono "en el medio" = entre palabras del mismo renglón; anclas superpuestas solo si son iguales).

| | Ronda 1 (solo R-11) | Ronda 2 (R-11 + R-12 + R-13) |
|---|---|---|
| Rechazos del parser vigente | `hoja-sin-encabezado-completo`, p. 4 | el mismo, y ninguno más |
| Filas (hoja 1/2 + hoja 2/2) | 12 + 11 | **12 + 12** (referencia a ojo: 11 + 12; la de más es la fila vacía de la p. 2) |
| Σ cantidad / pie | 17/17 y 20/25 | **17/17 y 25/25** |
| Códigos leídos | 0 de 23 | **18 de 24 filas**: 18 de las 23 reales; la fila vacía queda en `pending` |
| `pending` | código 23, nombre 1, cantidad 2, L 2, A 2, cantos 11 | código 6, nombre 1, cantidad 1, L 1, A 1, cantos **0** |
| Cantos, hoja 2/2 | paso 0,01 × constante; 15 de 15 marcas a más de medio paso | paso **0,95** × constante; 0 marcas a más de medio paso |

- **H-C se resuelve solo con R-13.** La causa era la fila fusionada de H-B: separada, el paso de la hoja 2/2 vuelve a 0,95 veces la constante (la hoja 1/2 da 0,88) y no queda ninguna marca a más de medio paso. **No hace falta un piso.** **Riesgo aceptado por Santiago el 10/11/2026 (límite conocido, abajo).** Lo que queda sin cubrir, sin proponer umbral: el paso sigue sin piso, así que cualquier otra causa que ponga dos marcas de una fila casi en la misma x (otra fusión, una marca leída dos veces) volvería a dejar en `pending` los cantos de toda la hoja. Es seguro, pero la pérdida es por hoja y no por fila.
- **Queda:** (1) el rechazo de la p. 4 (R-8, P-R5, sin cambio); (2) la fila vacía de la p. 2 (letras distintas, O-R13-3); (3) 5 códigos reales en `pending`: 4 que no cumplen el formato (por la forma de las palabras, el ícono leído como letras o dígitos; no se cruzó fila por fila) y 1 por la caja duplicada que entra en la designación vecina (medido: excluirla lo recupera); (4) **H-E (nuevo):** 2 gemelas cirílicas sueltas en el área del diagrama de la p. 4. El diagrama solo cuenta `^[A-Z]$`, así que esas letras no se cuentan y aparece `diagrama-no-coincide`. Es seguro (razón de fila, `dudosa`). **Decisión de Santiago (10/11/2026): queda como razón de fila; R-13 no se extiende al diagrama.**
- **Validación del documento de la sonda** (con una medida neutra válida en la hoja 2/2, solo para validar): `validado`; razones `campo-pendiente` 10, `diagrama-no-coincide` 10, `formato-invalido` 5, `letra-inconsistente` 4 y `codigo-ausente` 1; todas las filas `dudosa`, ninguna rechazada. `letra-inconsistente` y parte de `diagrama-no-coincide` vienen de los códigos en `pending` y de H-E.
- **Sin regresión en la sonda:** de las 14 entradas de TP-106 con lectura ok, 12 dan el mismo documento con R-12 y R-13. Las 2 distintas son el replay sintético S1 y S3, por R-12 (O-R12-2): 4 códigos pasan de `pending` a leídos e iguales al esperado; ningún código queda válido y distinto.
- **Ningún valor mal leído sin `pending`** en lo que la sonda leyó. Sigue sin ser una prueba de ausencia (§7).

**Diagnóstico de P-R5 (10/11): la banda de la p. 4.** Sonda local; clases de carácter, posiciones relativas y banderas, sin contenido.
- La banda tiene 14 palabras; las de las p. 2, 3 y 5, 13. La de más es **una letra minúscula ASCII suelta**, la quinta de 14, entre el `-` que sigue al espesor y el primer número de la medida. Tiene el alto de la mediana de la banda, su centro está a 0,06 alturas del centro del renglón (dentro del renglón) y los huecos son 1,37 antes y 0,50 después.
- **La medida sigue presente y entera:** `<n> mm x <n> mm` aparece tal cual y es **igual** a la fila del Resumen (las bandas de las p. 2 y 5 también lo son). Sin la palabra suelta, el patrón de R-8 se cumpliría. **No parte ningún número:** lo anterior es el `-` y lo siguiente empieza un número. La causa del rechazo es solo que a la izquierda de la medida hay una letra y no un separador.
- **Ocupa un hueco que ya existe:** la distancia `-` → primer número es de 2,22 a 2,37 × alto en las 4 páginas (2,37 en la p. 4), y la palabra, de 0,50 de ancho, cabe adentro. En las otras tres páginas no hay ninguna palabra en ese hueco.
- **La hipótesis de la etiqueta del diagrama queda descartada** (la medición tampoco la respaldaba): la palabra es minúscula, las 9 letras del diagrama de la p. 4 son mayúsculas y no hay ninguna letra mayúscula de un carácter a menos de 2 alturas del renglón de la banda.
- **La hipótesis del ícono (equipo): verificada** (Santiago, 10/11, mirando el PDF): entre el `-` que sigue al espesor y la medida hay un pictograma (ícono de tablero), presente en las cuatro páginas. En la p. 4 Vision lo leyó como una letra minúscula suelta; en las otras tres no leyó nada.
- Regla: R-14 (opción C de P-R5, elegida por Santiago el 10/11/2026), §4.7.

**Diagnóstico de las dos cajas superpuestas de "No." (p. 2, 10/11).** Sonda local; sin contenido.
- Una caja de **2 letras mayúsculas ASCII con la misma letra repetida** y otra de **1 letra mayúscula ASCII distinta**: ninguna es prefijo, sufijo ni parte de la otra.
- Se superponen por completo: 1,00 del alto menor en vertical y 1,00 del ancho menor en horizontal; los bordes superiores distan 0,14 × alto y los centros en x, 0,04 × el ancho del rótulo "No.". La de 2 caracteres es **más angosta** (0,38 × rótulo) que la de 1 (0,46 × rótulo), con alto 7,0 y 6,0 en las unidades de la extracción.
- **No son dos filas:** el paso típico entre filas es 9,1 × alto, y la franja tiene 26 elementos, como una fila con datos. Es la única ancla de 2 o 3 letras de las 4 páginas.
- **Lectura:** son dos lecturas de la misma marca de la columna. La geometría no dice cuál es la letra real, y una caja de 2 caracteres más angosta que una de 1 no es compatible con dos letras dibujadas. **Hipótesis, sin verificar:** Vision devolvió dos lecturas de la misma letra. Falta mirar la p. 2 del PDF (P-R10).

**Límite conocido: el paso de los cantos no tiene piso (riesgo aceptado por Santiago el 10/11/2026; aprobado por el equipo y el profesor, informado por Santiago el 11/11/2026).** El paso entre subcolumnas sigue siendo la menor distancia entre marcas de una fila de toda la hoja, con tope y sin piso (spec-esquema §8.2). Si dos marcas de una fila caen casi en la misma x por otra causa (una fusión de filas que R-13 no cubre, una marca leída dos veces), el paso se degrada y las filas de esa hoja quedan con `pending` en `edges`. Es seguro (`pending`, fila `dudosa`) pero pierde las marcas de toda la hoja. **No se propone ningún umbral.** A revisar al validar con otro PDF (§7).

## 3. Opciones para §8.2: cómo localizar datos que comparten renglón

**Decisión (10/11): opción A**, con la noción de "separador" de B como límite.

### Opción A — Patrones sobre la secuencia de palabras, con límites de campo (elegida)

El parser deja de exigir que el segmento entero cumpla la regla. Busca la regla como **secuencia contigua de palabras dentro del renglón**, siempre que esté **delimitada**. Un límite puede ser:
- el inicio o el fin del renglón;
- un hueco mayor que `joinGapRatio`;
- una palabra **separadora**: un signo de un solo carácter, sin letras ni dígitos, que el patrón no consume.

- **Ventajas:** no depende de umbrales nuevos y funciona igual con capa de texto y con OCR. Cada dato sale de su propio patrón con sus límites, así que un dato pegado a otro no lo contamina. Es determinista y explicable.
- **Riesgos:**
  - Límite izquierdo del material: un nombre de varias palabras no tiene marca propia de inicio. Se mitiga con R-6 y R-7.
  - Un separador perdido o leído como letra deja el dato sin límite, como en la p. 4. El resultado es `pending` o rechazo, que es lo seguro, pero baja la tasa de lectura.
  - Un patrón como "<n> mm" aparece cientos de veces en la tabla y el diagrama. Se mitiga con R-2 (zonas).

### Opción B — Cortar segmentos en los separadores (descartada)

Antes de evaluar las reglas, se corta el segmento en cada signo separador y las reglas actuales (`^…$`) siguen iguales. Se descarta por tres motivos:
- No resuelve la fecha sin cortar también por la unidad.
- Los signos que son parte del dato (`/`, `-` del código, `~`, `.`) obligan a una lista de signos por zona.
- Una lista de glifos observada en un solo PDF es el caso típico de sobreajuste.

### Opción C — Umbral de unión que no dependa solo de la altura (descartada)

Se descarta por §2.2: los huecos entre campos y dentro de campos se solapan, y cualquier valor saldría de este único PDF.

## 4. Reglas aprobadas (opción A)

Todas aplican a `TextoPdf` y a `OcrLlm` (un solo parser, C1). Con la entrada sintética de hoy (TP-50, TS-04), el resultado tiene que ser igual byte a byte.

| Id | Regla |
|---|---|
| R-1 | **Patrón delimitado.** Un dato se encuentra si una secuencia contigua de palabras del renglón cumple su patrón y tiene un límite (§3, A) a cada lado. Una regla de hoy que se cumple sobre el segmento entero también se cumple acá (sin regresión) |
| R-2 | **Zonas.** Unidad, fecha y título: solo en la página 1, en los renglones de arriba de la tabla del resumen. Medida, tipo y material de hoja: solo en el renglón que contiene `i / N`. Pie: solo en los renglones que empiezan con un rótulo de `FOOTER_LINE` o lo contienen. Fuera de su zona, un patrón no cuenta |
| R-3 | **Unicidad.** Si un patrón se cumple más de una vez en su zona con valores distintos, el dato no se lee: va a `pending`, o es rechazo si el campo no admite `pending`. Nunca se elige uno |
| R-4 | **Unidad.** Una palabra (o grupo de palabras pegadas por `glueGapRatio`) que cumple `MILLIMETER` entera, en su zona. `OTHER_UNIT` se evalúa igual y primero (`unidad-no-soportada` se conserva) |
| R-5 | **Fecha.** `dd/dd/dddd` más la hora con su "am"/"pm" (P-R6), delimitados. La unidad va después de la barra separadora y nunca entra en la fecha. Si después de la hora (y su "am"/"pm") sigue algo que no es límite, `generatedAt` va a `pending`. **N-1 (decisión de Santiago, 10/11):** `generatedAt` se compara **ignorando espacios**; si fecha y hora no se pueden interpretar con ese patrón, queda `pending` |
| R-6 | **Material de hoja.** Las palabras desde un límite hasta `<n> mm`, con `/` o, sin `/`, según la variante /-b (§4.1) |
| R-7 | **Título del resumen.** El material se toma de la secuencia entre el límite más cercano a la izquierda y el `/`. **Aclaración (decisión de Santiago, 10/11/2026; aprobada por el equipo y el profesor, informado por Santiago el 11/11/2026; R-1 y TP-104 se contradecían):** "límite que lo cierre" es **solo un separador** (R-10) inmediatamente a la izquierda, en el mismo segmento. Con inicio de renglón o un hueco, el material solo se acepta si un final de la secuencia es **exactamente igual** al material de una fila de la tabla del resumen (una sola igualdad); si no, rechazo `resumen-titulo-sin-limite` (`header.material` no admite `null`). **P-R4 cerrada (10/11):** en el PDF del segundo fixture hay límite (la barra `\|`, R-10), así que se aplica la primera rama y el material es solo la palabra pegada al `/`; el título del documento queda fuera. La igualdad con la tabla es el respaldo para cuando no hay límite |
| R-8 | **Medida y tipo de tablero.** `<n> mm x <n> mm` delimitado; `Tablero` más las palabras que siguen hasta un límite. Una medida sin límite a la izquierda (p. 4) no se lee y la regla de l. 585 sigue rechazando. **No** se acepta que un número "se delimita solo": un número partido por el OCR daría un valor falso sin aviso (TP-100) |
| R-9 | **Pie.** `<n> piezas` delimitado (la fibra y el separador lo preceden). `Longitud de cortes` y `Eficiencia`: el valor es lo que sigue al rótulo y al `:` opcional, hasta un límite. Si no es un número, `pending` (como hoy) |
| R-10 | **Separadores.** Cualquier palabra de un carácter sin letras ni dígitos que el patrón no consume. P-R3 verificó los separadores de este PDF (`-` en la banda de hoja, `\|` en la cabecera del resumen), pero el conjunto **no se restringe** a esos glifos: restringirlo con un solo PDF sería sobreajuste, y hacerlo exige una decisión nueva. Sigue PROVISORIO, a calibrar. No se agrega ningún número nuevo |
| R-11 | **Fila de la tabla del Resumen.** *Aprobada por Santiago el 10/11/2026; aprobada por el equipo y el profesor (informado por Santiago el 11/11/2026).* El material de la fila es un patrón delimitado `<material> / <n> mm` y lo que sigue (`- <tipo>`) no entra en él; cada celda se asigna a una columna solo si el rótulo más cercano del encabezado es una ancla conocida; ninguna celda reemplaza a otra; el material dos veces no se elige. Detalle y justificación en §4.4 |
| R-12 | **Código partido: el guion y el ícono en el medio.** *Aprobada por Santiago el 10/11/2026; aprobada por el equipo y el profesor (informado por Santiago el 11/11/2026).* En la designación se conserva la palabra `-` (U+002D, parte del código, P-R9); un ícono entre dos palabras del código en un mismo renglón deja el código en `pending`. Detalle en §4.5 |
| R-13 | **Anclas de la columna "No.".** *Aprobada por Santiago el 10/11/2026; aprobada por el equipo y el profesor (informado por Santiago el 11/11/2026).* Normalización cerrada de mayúsculas cirílicas gemelas de una latina; dos anclas superpuestas con la misma letra abren una sola fila. Excepción acotada a H-02, con su justificación, en §4.6 |
| R-14 | **Palabra suelta (pictograma) antes de la medida de la banda.** *Elegida por Santiago el 10/11/2026 (opción C de P-R5); aprobada por el equipo y el profesor (informado por Santiago el 11/11/2026).* Una palabra de un carácter que no es dígito ni separador, entre un separador y el primer número de la medida, se ignora, y la medida se acepta solo si es exactamente igual a la de la única fila del Resumen de ese material y espesor; si no, rechazo `hoja-medida-sin-respaldo`. Detalle en §4.7 |

### 4.0 Condición de la aprobación: ninguna regla relaja `dudosa` ni `pending`

**Criterio.** Una regla relaja si hace al menos una de estas tres cosas:
- **(a)** una fila pierde `dudosa`, `origen-ocr` u otra razón;
- **(b)** un valor que la regla no puede establecer sin ambigüedad se escribe sin `pending`;
- **(c)** un caso que hoy se rechaza se acepta con menos respaldo del que exige una lectura de `TextoPdf`.

Verificación regla por regla:

| Regla | (a) filas | (b) valores sin `pending` | (c) rechazos | Veredicto |
|---|---|---|---|---|
| R-1 | No toca filas | Solo escribe un valor si hay patrón **y** límite a los dos lados; si no, queda como hoy (`null` + `pending` o rechazo) | Acepta datos que hoy no encuentra, pero con el mismo patrón exacto de hoy; solo cambia dónde se busca | Cumple |
| R-2 | No toca filas | Reduce dónde puede haber coincidencias (más estricta) | No acepta nada nuevo | Cumple |
| R-3 | No toca filas | Ante dos valores, ninguno se escribe | Agrega rechazos, no los quita | Cumple |
| R-4 | No toca filas | No aplica (`unit` es fijo `"mm"`) | Acepta la unidad solo si una palabra cumple `MILLIMETER` entera, y solo después de descartar otra unidad. Es el mismo respaldo que una capa de texto con la unidad aislada | Cumple |
| R-5 | No toca filas | **Más estricta que hoy**: hoy `DATE` acepta el prefijo y arrastra la unidad sin aviso (§2.1); con R-5, lo que no se delimita va a `pending` | No acepta nada nuevo | Cumple |
| R-6 | No toca filas (siguen `dudosa` por `origen-ocr`) | El material de hoja sin `/` solo se acepta si coincide exactamente con `header` | **Salvedad:** acepta sin `/` una banda que hoy da `hoja-incompleta`. El respaldo es la igualdad exacta con otro lugar del mismo documento. Excepción aprobada aparte (decisión 4, /-b). Si no hay igualdad, sigue `hoja-incompleta` | Cumple, con la salvedad aprobada |
| R-7 | No toca filas | **Más estricta que hoy**: hoy `MATERIAL` acepta el segmento entero y captura palabras de más sin aviso (en el PDF del segundo fixture, el título del documento y la barra); con R-7, solo se toma lo que está entre el límite y el `/` y, sin límite izquierdo, solo se acepta la igualdad exacta con una fila de la tabla | Agrega rechazos | Cumple |
| R-8 | No toca filas | Sin límite izquierdo, la medida no se lee; un número partido no se toma | No acepta nada sin límite | Cumple |
| R-9 | No toca filas | Si no es número, `pending`. Un `pieceCount` mal leído lo sigue detectando INV-1 (`suma-tablero-no-coincide`) | Acepta el pie dentro de un renglón corrido, con el mismo patrón | Cumple |
| R-10 | No toca filas | Un separador que corte mal un campo deja el patrón sin cumplir o sin igualdad (R-6, R-7), y eso da `pending` o rechazo | No acepta nada por sí sola | Cumple |
| R-11 | No toca las filas de piezas | **Más estricta que hoy**: hoy `cells.set(...)` deja que una celda reemplace a otra en la misma columna sin aviso, y una celda de una columna sin ancla se asigna a la ancla más cercana; con R-11 eso es `pending` o rechazo, y las celdas de columnas ignoradas se descartan de forma explícita | Acepta una fila del Resumen que hoy se rechaza (la que trae cola). **Salvedad:** la cola descartada no se valida. Lo que la contiene: el material exige `/`, un número y `mm` delimitados, los números de las celdas se validan por columna, y una segunda aparición del material rechaza (R-11 e). Si la cola contuviera otro dato, no llega a ningún campo | Cumple, con la salvedad (aprobada por Santiago el 10/11/2026 junto con R-11, y por el equipo y el profesor, informado por Santiago el 11/11/2026) |
| R-12 | No quita razones: toda fila sigue `dudosa` por `origen-ocr` | Un código solo se escribe si la unión cumple el formato exacto, como hoy. El guion **no se inventa**: es el único signo del formato y está en el PDF (P-R9). Conservarlo solo completa un texto que el OCR ya leyó; un guion de más (ícono leído como `-`) da `--` y rompe el formato (`pending`). Otros guiones (U+2010, U+2013, U+2212) no se convierten (H-02). La parte b (ícono en el medio) es **más estricta**: deja en `pending` una unión que hoy se aceptaría | Acepta códigos que hoy quedan en `pending`, con el mismo respaldo: el formato exacto. Verificado con el replay sintético: 4 códigos pasan de `pending` a leídos y los 4 son iguales al esperado; el resto sigue en `pending`; **ninguno** sale válido y distinto | Cumple |
| R-13 | No quita razones | (a) La letra normalizada se escribe sin `pending` (INV-0 no admite un valor con `pending`). Respaldo: la tabla es cerrada y 1 a 1 (cada gemela tiene una sola latina de glifo idéntico), los rótulos de "No." son latinos, y INV-3, INV-5 e INV-6 cruzan la letra con el diagrama y el código. **Salvedad:** es una corrección de un error del OCR, que H-02 prohíbe para el código; acá se aplica a la letra local, que no es la clave de la fila (H-08). (b) Fundir dos anclas solo si son **iguales**: nunca elige una letra | Separa en dos filas lo que hoy es una fila fusionada en `pending`; cada fila nueva tiene el mismo respaldo que cualquier otra (celdas por columna) | Cumple, con la salvedad de (a) (aprobada por Santiago el 10/11/2026 junto con R-13, y por el equipo y el profesor, informado por Santiago el 11/11/2026) |
| R-14 *(opción C, elegida por Santiago)* | No toca filas. **No quita `dudosa` ni ninguna otra razón:** toda fila sigue `dudosa` por `origen-ocr` (verificado con la sonda, §4.7: 24 de 24 filas `dudosa`, igual que sin R-14) | **No escribe un valor sin respaldo ni quita un `pending`:** la medida se escribe solo si es exactamente igual a la de la única fila del Resumen. Un dígito mal leído daría otra medida y rechazo; un dígito suelto, dos palabras sueltas o una medida distinta no se toleran (verificado: rechazo en los tres casos). Cuando R-8 ya lee la medida, no se compara con el Resumen y ese camino no cambia | Acepta una hoja que hoy se rechaza con el mismo respaldo que /-b (igualdad exacta con otro lugar del mismo documento) | Cumple, con la salvedad ya aprobada para /-b |

Fuera de las reglas, sin cambio: toda fila de `OcrLlm` sale `dudosa` por `origen-ocr` (§7.3, RP8); INV-0 a INV-15 y el cruce con el .dae siguen iguales.

### 4.1 Tolerancia a la pérdida del `/` en el material de hoja: variante /-b (aprobada)

| Variante | Regla | Estado |
|---|---|---|
| /-a | Exige `/` (como hoy) | Descartada: con esta corrida, toda hoja da `hoja-incompleta` |
| /-b | Sin `/`, `<material> <n> mm` se acepta **solo** si material y espesor son exactamente iguales a los de `header` (página 1). Distinto o ausente: `hoja-incompleta` | **Aprobada (10/11)** |
| /-c | Sin `/`, se acepta siempre | Descartada: límite izquierdo incierto |

P-R2 está cerrada: el `/` está en el PDF y el OCR lo pierde. /-b es una tolerancia a un **error de lectura**, no a otro formato. Por eso solo acepta el valor cuando lo respalda el título del resumen, y nunca lo toma por sí solo. Que el OCR pierda el `/` en las 4 páginas de este PDF no quiere decir que lo pierda siempre: /-b tiene que seguir aceptando el título con `/` (TP-101).

### 4.2 Qué no cambia

- `OCR_LAYOUT` (1,5 / 0,4 / 0,3): sin cambios y sigue PROVISORIO.
- Toda fila de `OcrLlm` sale `dudosa` por `origen-ocr` (§7.3, RP8).
- **Errores seguros = 0**: todo dato que no se delimita con certeza va a `pending` o a rechazo.
- La lectura de filas, columnas y marcas de canto. **Sujeto a revisión (10/11; resuelto por R-11 a R-14):** el lookahead de §2.5 muestra que la lectura de filas de este PDF tiene problemas propios (código, anclas, paso de los cantos: H-A a H-C) que esta revisión no resuelve.

### 4.3 Riesgo de lectura del código (RL-1), fuera del arreglo de esta revisión

El equipo verificó en el PDF que el código viene partido en dos renglones y, en algunas filas, con un ícono en el medio (§2.4). spec-esquema §7.1 y §8.2 ("Designación e íconos") ya contemplan las dos cosas para una capa de texto: el ícono es un carácter de uso privado y se descarta. **Con OCR no está verificado**: la corrida 1 se rechazó antes de llegar a las filas, y el fixture sintético dibuja el ícono como un rombo que Vision no devolvió (spec-fixture-sintetico §12, "Íconos").

| Riesgo | Qué podría pasar | Qué lo contiene hoy | Seguro |
|---|---|---|---|
| El ícono llega como letra, dígito o signo | Una palabra de más entre los dos renglones del código | El código se valida con `^_*C_*$`. Un signo suelto se descarta. Una letra o un dígito de más dejan el formato inválido (`formato-invalido`, `dudosa`) | Sí, si el resultado no cumple el formato |
| El ícono llega como dígito **y** el resultado cumple el formato | Un código válido pero equivocado | No lo detecta el parser. Lo detecta el cruce con el .dae (`codigo-sin-instancias`, `cantidad-no-coincide`, spec-esquema §7.2), y la fila igual sale `dudosa` por `origen-ocr` | Parcial: depende del cruce |
| Los dos renglones se unen con el nombre o en otro orden | El código pierde una parte | `codigo-ausente` o `pending` (§8.2: si ninguna unión cumple, el código va a `pending`) | Sí |
| Errores de carácter ya vistos en el sintético ("C" leída como "0" u "O") | Código con formato inválido | `formato-invalido`; **no se autocorrige** (H-02) | Sí |

- **Decisión:** no se cambian reglas del código en esta revisión. Se agrega una prueba sintética (TP-107) y RL-1 se mide en la corrida de desarrollo, contando las filas con `formato-invalido` o con el código en `pending`. Solo se cuentan, no se imprimen códigos.
- Si la corrida muestra que el ícono llega como un carácter que forma un código válido, hace falta otra spec.

### 4.4 R-11: fila de la tabla del Resumen — **aprobada por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026)**

Origen: la corrida 2 (`resumen-tabla-vacia`, §2.1b). Incorpora las decisiones de Santiago del 10/11/2026 (1 a 5). No agrega ningún número nuevo.

**Zona (R-2 para filas, decisión 3).** Las filas se leen debajo de la línea del encabezado de la tabla (la que tiene `Cant.`, `Longitud` y `Anchura`), hasta la **primera línea cuyo primer segmento no tiene material**. Esa línea y las siguientes no son filas. Si no hay ninguna fila, `resumen-tabla-vacia` (sin cambio).

| Parte | Regla |
|---|---|
| **a. Material** (decisión 1) | Patrón delimitado (R-1) `<material> / <n> mm`, con `/` consumido. Límite izquierdo: el inicio del renglón (es la primera columna). Límite derecho: el fin del segmento o un separador (R-10). Lo que sigue, como `- <tipo>`, **no entra en el material**, y el tipo se descarta: `SummaryBoardRow` no tiene ese campo. Hoy el segmento entero tiene que cumplir `MATERIAL`, y la cola lo impide |
| **b. Columna de cada celda** (decisión 2) | Cada celda (los segmentos de la fila distintos del primero) se compara con **todos** los segmentos del encabezado, por la distancia entre centros. **Se asigna solo si el rótulo más cercano es una ancla conocida:** `Cant.`, `Longitud`, `Anchura`, `Σ Areas`, `Σ Partes`. `Σ Costos` es una **columna conocida e ignorada a propósito** (spec-esquema §4, "Qué queda fuera del esquema"): sus celdas se **descartan de forma explícita**, sin `pending` ni rechazo. Un rótulo desconocido se trata igual que uno ignorado (no asigna). Una celda equidistante de dos rótulos no se asigna a ninguno |
| **c. Una celda por ancla** (decisión 2) | Dos celdas asignadas a la misma ancla: **no se elige ninguna** (R-3). Nunca hay reemplazo silencioso |
| **d. Formato por columna** (decisión 2) | `Cant.` y `Σ Partes`: entero. `Longitud` y `Anchura`: número, con `mm` opcional. `Σ Areas`: número, con `m²` o `m2` opcional. Una celda que no cumple el formato de su columna, o la ausencia de la celda, **no se lee** |
| **e. R-3 para el material** (decisión 4) | `<material> / <n> mm` dos veces en el renglón: **rechazo** `resumen-fila-ambigua`, también si los dos valores son iguales |
| **f. Respaldo de R-7** (decisión 5) | Sin cambios: `rowMaterials` sigue saliendo del material de cada fila. Con R-11 el material de la fila queda sin la cola, así que la igualdad exacta de R-7 vuelve a ser posible |

**¿`pending` o rechazo?** (decisión 2: "elegí cuál según lo que ya hacen las otras reglas"). No se inventa un criterio: se aplica el que ya rige, el de R-3 ("`pending`, o rechazo si el campo no admite `pending`") y el que hoy aplica `readSummary`.

| Caso | Campo | ¿Admite `null`? | Tratamiento | Respaldo |
|---|---|---|---|---|
| Celda ausente, de formato inválido (d) o doble (c) en `Cant.`, `Longitud`, `Anchura` o `Σ Partes` | `count`, `lengthMm`, `widthMm`, `parts` | No (`SummaryBoardRow`; INV-2 usa `count` y `parts`) | **Rechazo** `resumen-tabla-sin-valor` (ausente o formato) o `resumen-celda-duplicada` (doble) | Hoy `required()` ya rechaza con `resumen-tabla-sin-valor` |
| Lo mismo en `Σ Areas` | `areaM2` | Sí | `null` + `pending` `summary.boards[i].areaM2` | Hoy `readSummary` ya hace `pending` |
| Material dos veces (e) | `material` | No | **Rechazo** `resumen-fila-ambigua` | R-3 y R-7: `header.material` no admite `null` |

Un `pending` en una columna obligatoria dejaría el documento con un `count` o un `parts` inventado o faltante, y rompería INV-2 sin explicación; por eso rechazo.

**Catálogo de reglas de rechazo (C2).** R-11 agrega dos ids: `resumen-celda-duplicada` y `resumen-fila-ambigua` (OR-18 pasaría de 27 a 29 sitios). `resumen-tabla-sin-valor` y `resumen-tabla-vacia` se mantienen.

**Preguntas de R-11 (O-R11-1 a O-R11-4 aprobadas por Santiago el 10/11/2026, como se proponen abajo; aprobadas también por el equipo y el profesor, informado por Santiago el 11/11/2026):**
- **O-R11-1.** Un rótulo desconocido (ni ancla ni `Σ Costos`): aprobado tratarlo como ignorado, que no asigna y no rechaza. Alternativa: rechazo. Con "ignorado" no hay asignación equivocada; el costo es no enterarse de una columna nueva.
- **O-R11-2.** Formato de `d`: aprobado exigir entero en `Cant.` y `Σ Partes`. Hoy se acepta cualquier número (`readNumber`). Es más estricto, no relaja nada; no cambia las entradas de hoy.
- **O-R11-3.** `e`: rechazar también cuando las dos apariciones del material son iguales (más estricto que R-3, que habla de "valores distintos"), como pidió la decisión 4.
- **O-R11-4.** Equidistancia en `b`: aprobado "no se asigna". Alternativa: elegir la primera. Elegir una sería un criterio arbitrario.
- **P-R8** (§8): **cerrada** (Santiago, 10/11, mirando el PDF): el rótulo es `Σ Costos` y su valor es `-`.

### 4.5 R-12: código partido, el guion y el ícono en el medio — **aprobada por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026)**

Origen: H-A (§2.5); P-R9 cerrada (Santiago, 10/11, mirando el PDF: el `-` es un guion real del código; los íconos son pictogramas junto al código y en algunas filas hay uno en el medio). Decisión de Santiago del 10/11 sobre "en el medio": entre dos palabras del código **en un mismo renglón**. No agrega números ni glifos fuera del formato del código.

| Parte | Regla |
|---|---|
| **a. El guion se conserva** | En la designación se descartan, como hoy, los caracteres de uso privado y las palabras sin letras ni dígitos, **salvo la palabra `-` (U+002D)**, que se conserva para unir los renglones del código (y queda, si sobra, en el nombre). Es el único signo del formato del código (`\d{4}-\d{2}-M\d{2}-C\d{2}`, spec-motor §6.1), así que no es una lista de glifos observados. Otros guiones (U+2010, U+2013, U+2212) **no** se convierten en `-`: no se autocorrige (H-02) |
| **b. Ícono en el medio** | Si en un mismo renglón queda una palabra descartada (un signo, un braille en blanco o un carácter de uso privado) **entre dos palabras que forman el código**, el código va a `pending` aunque la unión cumpla el formato. Un ícono **al final** de un renglón (junto al código, entre la parte 1 y la parte 2, como en TextoPdf y en TP-107 a) se descarta y no impide leer el código |
| **c. Ícono leído como letra o dígito** | Sin cambio: la unión no cumple el formato y el código va a `pending` (TP-107 b y c) |
| **d. Lo demás** | Sin cambio: el código son los primeros renglones cuya unión cumple `^_*C_*$`; si ninguna cumple, el renglón 1 tal cual y el código en `pending` |

Efecto medido con la sonda (§2.5): 0 de 23 códigos con la regla de hoy; **17 de 23** con R-12 sola (las filas leídas como hoy, con la fusión y la fila vacía de R-13 todavía presentes); **18 de las 23 filas reales** con R-12 y R-13 (12 sin ninguna palabra descartada y 6 con un ícono al final de un renglón; **ninguna** con un ícono entre palabras del mismo renglón, de modo que la parte b de R-12 no cambia el resultado en este PDF). De las 6 filas de la sonda que quedan en `pending` (24 filas, contando la vacía): 4 no cumplen el formato (por la forma de sus palabras, el ícono llega como letras o dígitos; no se cruzó fila por fila), 1 es la fila vacía y 1 queda así por la caja duplicada no fundida (§4.6, O-R13-3).

**Preguntas de R-12 (O-R12-1 y O-R12-2 aprobadas por Santiago el 10/11/2026, como se proponen abajo; aprobadas también por el equipo y el profesor, informado por Santiago el 11/11/2026):**
- **O-R12-1.** La palabra `-` conservada también queda en el nombre cuando sobra (el nombre es "tal cual"). Alternativa: conservarla solo para unir el código.
- **O-R12-2.** TP-106 cambia de línea base por R-12: en el replay sintético 4 códigos pasan de `pending` a leídos (iguales al esperado) y otros cambian el texto crudo que acompaña su `pending`. **Línea base nueva registrada** en `docs/test-plan-esquema-pdf.md` (R-12, R-13): TP-50 y TS-04 (capa de texto) no cambian. Sus sha256 se fijan al implementar.
- **Diferencia con R-13 y con H-02:** R-12 **no** convierte otros guiones por H-02. La comparación está en §4.6.

### 4.6 R-13: anclas de la columna "No." — **aprobada por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026)**

Origen: H-B (§2.5); P-R10 **sin verificar** (hipótesis de Santiago: Vision confunde letras latinas con sus gemelas visuales en cirílico; entre las letras de fila del PDF hay C, K, M, O, H y P). Decisión de Santiago del 10/11 sobre la letra duplicada: fundir solo si son iguales. No agrega números.

| Parte | Regla |
|---|---|
| **a. Normalización cerrada** | Una palabra de la columna "No." es letra de fila si, después de reemplazar cada carácter de la **tabla cerrada** por su gemela latina, cumple `^[A-Z]{1,3}$`; la letra de la fila queda con la forma latina. Tabla cerrada: las 11 mayúsculas cirílicas de glifo idéntico a una latina: А→A (U+0410), В→B (U+0412), Е→E (U+0415), К→K (U+041A), М→M (U+041C), Н→H (U+041D), О→O (U+041E), Р→P (U+0420), С→C (U+0421), Т→T (U+0422), Х→X (U+0425). Cualquier otro carácter no latino: no es ancla, como hoy. Solo en la columna "No." (el diagrama no cambia: H-E, §2.5) |
| **b. Anclas superpuestas** | Dos anclas de la columna "No." cuyas cajas se solapan en vertical al menos la mitad del alto de la más baja (el criterio de renglón de §8.2) **y cuyas letras normalizadas son iguales** abren **una sola fila**; la segunda caja no es dato de ninguna celda. Si las letras difieren, **no se funden**: quedan dos filas, como hoy, y la vacía queda con sus campos en `pending` (seguro). Nunca se elige una letra |

Efecto medido con la sonda (§2.5): la letra cirílica de la p. 5 se normaliza (1 caso) y la fila fusionada se separa: la hoja 2/2 queda con 12 filas, Σ cantidad 25 de 25 y, de paso, H-C desaparece. La letra duplicada de la p. 2 tiene textos distintos (2 y 1 caracteres): no se funde y la fila vacía sigue.

**Por qué R-13 es una excepción a H-02 (no autocorregir) — justificación explícita.** H-02 (spec-extraccion §3) y la fila `.code`, `.name`, `.letter` de spec-extraccion §5.1 dicen que no se autocorrige un código ni una letra. R-13 normaliza un carácter de la **letra de fila**, y lo permite por cuatro razones que valen juntas:
1. **Tabla cerrada.** Son 11 pares: cada mayúscula cirílica tiene **una sola** latina de glifo idéntico. No hay elección, distancia de edición ni heurística. Cualquier otro carácter no latino no es ancla, como hoy.
2. **La letra de fila es una etiqueta local, no una clave.** Es local de cada material, se repite entre tableros (H-08) y la clave de la fila es el código. No viaja al listado ni al cruce con el .dae.
3. **Está cruzada.** INV-3 (la letra con su cantidad en el diagrama), INV-5 (una letra por fila en cada tablero) e INV-6 (la misma letra, el mismo código en todo el PDF) la verifican contra el diagrama y el código. Un error de normalización aparece como razón de fila, y toda fila de OCR ya sale `dudosa`.
4. **No corregirla cuesta más.** Sin R-13, una fila se funde con la anterior: se pierden su cantidad, L y A y, por H-C, los cantos de toda la hoja (§2.5).

**Diferencia con R-12 (los otros guiones).** R-12 conserva el guion `-` (U+002D) pero **no** convierte U+2010, U+2013 ni U+2212 en `-`. Las dos reglas son coherentes con H-02 y la diferencia está en lo que se toca:

| | R-12: otros guiones → `-` (no se hace) | R-13: gemelas cirílicas → latina (se hace) |
|---|---|---|
| Qué se tocaría | Un carácter del **código** | Un carácter de una **etiqueta local** |
| Conjunto | Abierto: hay muchos guiones Unicode y no hay una tabla aprobada de cuáles equivalen a `-` | Cerrado: 11 pares de glifo idéntico, listados |
| Si se equivoca | El resultado puede ser un código válido pero distinto, que viaja a la clave del cruce con el .dae y a la cantidad (H-02) | La letra no es clave: INV-3, INV-5 e INV-6 lo detectan y la fila sigue `dudosa` |
| Evidencia en el PDF | En los dos primeros renglones de la designación no apareció ningún otro guion Unicode: no hay nada que corregir | Una letra de fila llega en cirílico (p. 5) |

**Documentos a ajustar si se aprueba R-13 (C6, aprobada por Santiago el 10/11/2026):** spec-extraccion §3 (H-02) y §5.1 (fila `.code`, `.name`, `.letter`), para que digan que `.letter` admite la normalización de R-13 y `.code` no. **Redactados en spec-extraccion v0.3.3, aprobada** (informado por Santiago el 11/11/2026).

**Preguntas de R-13 (decisiones de Santiago del 10/11/2026; aprobadas también por el equipo y el profesor, informado por Santiago el 11/11/2026):**
- **O-R13-1.** Cerrada: la tabla queda en **las 11 letras**. No se agregan І (U+0406), Ј (U+0408) ni Ѕ (U+0405).
- **O-R13-2.** Aprobada: la letra normalizada se escribe sin `pending` (salvedad de §4.0).
- **O-R13-3.** **No se adopta.** Excluir de las celdas toda caja que califique como ancla recuperaría 1 código en este PDF (medido), pero es una decisión nueva.
- **P-R10** (§8): sigue como hipótesis. El diagnóstico de las dos cajas de la p. 2 está en §2.5.

### 4.7 R-14: palabra suelta (pictograma) antes de la medida de la banda — **opción C elegida por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026)**

Origen: P-R5, **cerrada** (Santiago, 10/11, mirando el PDF): entre el `-` que sigue al espesor y la medida de la banda hay un **pictograma** (ícono de tablero), presente en las cuatro páginas; en la p. 4 Vision lo leyó como una letra minúscula suelta y en las otras tres no leyó nada. Es el mismo caso que los íconos intercalados de R-12. La medida está presente, entera e igual a la del Resumen (§2.5). Hoy R-8 rechaza la hoja 2/2 (`hoja-sin-encabezado-completo`, p. 4) porque la medida no tiene límite a la izquierda. R-14 no cambia el caso de un número partido (TP-100). No agrega números ni glifos.

| Parte | Regla |
|---|---|
| **a. Palabra tolerada** | Una palabra de **un solo carácter que no es dígito ni separador** (R-10) entre un separador y el primer número de la medida. En la práctica es una letra: un signo ya es separador y R-8 lo lee. Solo **una** palabra: con dos o más, o con un dígito, no hay tolerancia y rige R-8 (rechazo `hoja-sin-encabezado-completo`) |
| **b. Lectura** | Ignorada esa palabra, la medida se lee con el patrón de R-8 (`<n> mm x <n> mm`, delimitado) |
| **c. Respaldo (el patrón de /-b)** | La medida se acepta **solo si es exactamente igual** a `lengthMm` y `widthMm` de la **única fila del Resumen con el mismo material y espesor** que la hoja, en el mismo orden (largo con `Longitud`, ancho con `Anchura`; sin reordenar, INV-7). Sin fila, con más de una, o con otra medida: rechazo `hoja-medida-sin-respaldo` |
| **d. Lo demás** | Si el patrón de R-8 ya se cumple (hay un separador a la izquierda), R-14 no actúa y la medida **no** se compara con el Resumen: ese camino no cambia. R-3 (dos medidas distintas) sigue igual |

**Catálogo de reglas de rechazo (C2).** R-14 agrega un id, `hoja-medida-sin-respaldo` (con los dos de R-11, OR-18 pasaría de 27 a 30 sitios). Es la contradicción C7.

**Ventajas y riesgos (opción elegida).** *Ventajas:* el mismo diseño que /-b, ya aprobado; la menor relajación de las opciones consideradas; no depende del glifo con que Vision lea el pictograma. *Riesgos:* depende de que el Resumen tenga una sola fila del material y se lea bien (R-11); si la medida real de una hoja difiere de la del Resumen (hojas de otra medida), rechazo: seguro, pero se pierde la hoja. Un pictograma leído como un **dígito** no se tolera: rechazo.

**No relaja `dudosa` ni `pending` (verificado).** Criterio de §4.0: (a) ninguna fila pierde `dudosa` ni otra razón; (b) ningún valor se escribe sin respaldo; (c) el caso que hoy se rechaza se acepta con el respaldo de /-b. Verificación con la **sonda** (10/11; copia local sin versionar del parser con R-11 a R-14 simulados; solo banderas y conteos; **no es la implementación**):

| Caso (sobre las bandas del PDF de la corrida 2) | Resultado de la sonda |
|---|---|
| Datos reales | La hoja 2/2 pasa de rechazada a leída; sin ningún rechazo; la medida es igual a la fila del Resumen; 12 filas; `pending` total 10 **con y sin** R-14; el resto del documento es **idéntico** con y sin R-14; **24 de 24 filas `dudosa`** (con el lector `ocr-llm`, como `parseOcrWords`) |
| Misma palabra suelta y una medida distinta (un dígito cambiado) | Rechazo `hoja-medida-sin-respaldo`, p. 4 |
| Un dígito en lugar de la letra | Rechazo de R-8 (`hoja-sin-encabezado-completo`), p. 4 |
| Dos palabras sueltas | Rechazo de R-8, p. 4 |
| Sin palabra suelta y con otra medida | Se lee como hoy: R-14 no actúa y no compara con el Resumen |
| Un signo en lugar de la letra | Se lee como hoy (ya es separador, R-10) |

**Pruebas.** TP-99 se actualiza (§5.2): pasa de esperar rechazo a leer la medida cuando la palabra suelta es una letra y la medida es igual a la del Resumen; el rechazo pasa a TP-129. TP-100 se mantiene. Nuevas: TP-128 a TP-133. Al implementar, la prueba TP-99 de `tests/pdf.ocrRealLike.test.ts` cambia (hoy espera rechazo).

**Opciones no elegidas (registro).** *A:* tolerar la palabra sin respaldo externo; relajaba (b) y (c) (un dígito mal leído daba una medida falsa sin `pending`). *B:* usar la medida del Resumen cuando hay una sola fila del material; relajaba (c) con respaldo indirecto y ocultaba fallas de lectura de la banda. Quedan descartadas por la elección de Santiago.

## 5. Criterios de aceptación y pruebas

### 5.1 Criterios

| Id | Criterio |
|---|---|
| CA-1 | Valores distintos del esperado sin `pending` = 0 en todos los casos nuevos, **incluido `header.*`** (cierra el error latente de `generatedAt`, §2.1) |
| CA-2 | Sin regresión en `TextoPdf`: TP-50, TP-51 y TS-04 dan el mismo JSON byte a byte; la suite completa en verde |
| CA-3 | Con la geometría observada (§5.3), se leen la unidad, la fecha, la medida, el tipo, el material de hoja y el pie |
| CA-4 | Ante ambigüedad (R-3), límite ausente (R-8) o separador leído como letra, el resultado es `pending` o rechazo, nunca un valor |
| CA-5 | TP-53 sigue igual: toda fila `dudosa` con `origen-ocr` |
| CA-6 | Los fixtures nuevos no contienen datos reales (TS-12 extendido) |
| CA-7 | El script imprime regla y página del rechazo, nunca el `detail` ni texto leído (§6) |
| CA-10 | R-14 nunca escribe una medida de tablero que el Resumen no respalde: una palabra suelta con la medida igual a la del Resumen se acepta; con otra medida, con un dígito o con más de una palabra, se rechaza; no se quita ninguna razón de fila (toda fila de OCR sigue `dudosa`) |
| CA-9 | R-12 y R-13 no aumentan los valores distintos sin `pending` (CA-1): con el replay sintético solo convierten `pending` en valores iguales al esperado; ninguna letra se normaliza fuera de la tabla cerrada y ninguna fila se funde con letras distintas |
| CA-8 | En la tabla del Resumen, ninguna celda reemplaza a otra ni se asigna a una columna sin respaldo del encabezado; dos celdas en una ancla o una celda que no cumple el formato de su columna dan `pending` o rechazo, nunca un valor (R-11) |

### 5.2 Pruebas nuevas

Convención del repo: TP- para el plan del esquema (siguen a TP-94) y OR- para SPEC-B2 (siguen a OR-16). Copiadas a `docs/test-plan-esquema-pdf.md` y a SPEC-B2 §11.

| Id | Criterio | Caso (sintético) | Esperado |
|---|---|---|---|
| TP-95 | CA-1, CA-3; R-4, R-5 | Renglón del resumen: título, hueco grande, fecha, hora, "pm", `\|`, unidad; separaciones de 0,1 a 0,7 × alto. Subcaso: hora y "pm" como dos palabras (N-1) | Unidad leída; `generatedAt` = fecha + hora con "pm", sin la unidad, **comparado ignorando espacios**; si no se interpreta, `pending` |
| TP-96 | R-4 | Igual que TP-95, con otra unidad en lugar de milímetros | `unidad-no-soportada` |
| TP-97 | R-4 | Sin unidad | `estructura-no-reconocida`; regla del catálogo para "resumen sin unidad" (§6) |
| TP-98 | CA-3; R-6, R-8 | Banda de hoja en un renglón: `<material> <e> mm - <L> mm x <A> mm - Tablero estándar`, hueco, `i / N`, con las separaciones de §2.1, con y sin `/` | Medida, tipo, material y espesor leídos (/-b) |
| TP-99 *(actualizada, 11/11/2026)* | CA-4, CA-10; R-8, R-14 | TP-98 con una letra suelta entre el `-` y la medida (caso p. 4), y con la fila del Resumen de la misma medida | **Medida leída**, igual a la del Resumen; la letra no aparece en ningún campo. *Antes (aprobada en la v0.2): rechazo en la primera página de la hoja; ese resultado pasa a TP-129 y a TP-130* |
| TP-100 | CA-4; R-8 | Número de la medida partido en dos palabras con separación de 0,5 | No se lee el número parcial; `pending` o rechazo |
| TP-101 | R-6, §4.1 | Material de hoja sin `/`: igual al resumen; distinto; con `/` | Leído; `hoja-incompleta`; leído (sin regresión) |
| TP-102 | CA-3; R-9 | Pie en un renglón: fibra + signo + `<n> piezas`, hueco, longitud de cortes + signo + eficiencia | `pieceCount` leído; longitud y eficiencia leídas o en `pending`; nunca otro valor |
| TP-103 | CA-4; R-3 | Dos medidas distintas en el renglón de `i / N` | No se elige; rechazo |
| TP-104 | CA-1; R-7 | Título del resumen con un título ficticio de tres palabras a la izquierda del material (sin datos reales): (a) separado del material por `\|`; (b) sin separador y el final coincide con una fila de la tabla; (c) sin separador y no coincide | (a) solo el material, sin el título ni la barra; (b) material de la fila; (c) rechazo; nunca un material con palabras de más |
| TP-105 | R-2 | `<n> mm x <n> mm` en una celda de la tabla o en el diagrama | No cuenta como medida del tablero |
| TP-106 | CA-2 | TP-50, TS-04 y el replay sintético de Vision con el parser nuevo | Idénticos a hoy |
| TP-107 | CA-1, CA-4; RL-1 (§4.3) | Código `9999-` en dos renglones de palabras de OCR, con una palabra suelta en el medio: (a) un signo; (b) una letra; (c) un dígito que deja el formato inválido | (a) código leído; (b) y (c) `formato-invalido` o `pending`; nunca otro código válido sin razón |
| TP-108 | CA-1, CA-3; R-11 a | Fila del Resumen en un renglón: `<material> / <e> mm - <tipo de dos palabras>` en un solo segmento (palabras separadas 0,25 a 0,67 × alto), más las cinco celdas numéricas bien separadas (2,1 a 9,2 × alto) | Fila leída; material y espesor sin la cola; el tipo no aparece en ningún campo; sin `pending` nuevo |
| TP-109 | CA-8; R-11 b | TP-108 con siete rótulos en el encabezado (`Tablero`, `Cant.`, `Longitud`, `Anchura`, `Σ Areas`, `Σ Costos`, `Σ Partes`) y una celda `-` bajo `Σ Costos` (separación 42 a 50 × alto) | La celda se descarta; `parts` conserva su valor (la `-` no lo pisa); ningún `pending` ni rechazo por ella |
| TP-110 | CA-4, CA-8; R-11 d | Una celda `-` (a) bajo `Σ Areas`; (b) bajo `Cant.`; (c) `Cant.` = `2,5` | (a) `areaM2: null` + `pending`; (b) y (c) rechazo `resumen-tabla-sin-valor` |
| TP-111 | CA-4, CA-8; R-11 c | Dos celdas numéricas asignadas a la misma ancla: (a) `Longitud`; (b) `Σ Areas` | (a) rechazo `resumen-celda-duplicada`; (b) `areaM2: null` + `pending`; ningún valor elegido |
| TP-112 | CA-4; R-11 e, R-3 | Dos `<material> / <n> mm` en el renglón: (a) distintos; (b) iguales | (a) y (b) rechazo `resumen-fila-ambigua` |
| TP-113 | R-11 (R-2 para filas) | Dos filas con material, una línea sin material y otra con material; y un Resumen sin ninguna fila | Se leen las dos primeras; la última no es fila. Sin filas: `resumen-tabla-vacia` (sin cambio) |
| TP-114 | CA-4, CA-8; R-11 b | Encabezado con un rótulo desconocido (ni ancla ni `Σ Costos`) entre `Σ Areas` y `Σ Partes`, con una celda numérica debajo | La celda no se asigna a `Σ Areas` ni a `Σ Partes`; ningún valor cambia |
| TP-115 | CA-4; R-11 b | Celda equidistante de dos rótulos | No se asigna a ninguno; se aplica d (rechazo u `areaM2: null` + `pending`, según la columna que falte) |
| TP-116 | CA-1; R-11 f, R-7 | TP-104 (b) y (c) con la fila del Resumen con cola | (b) el material de la fila, sin la cola; (c) rechazo `resumen-titulo-sin-limite` (sin cambio) |
| TP-117 | CA-1, CA-3; R-12 a | Código `9999-` en dos renglones de palabras de OCR: `9999-01-` y `M01`, `-`, `C04` como tres palabras, separadas por huecos mayores que `glueGapRatio` (como en el OCR real) | Código leído, igual al esperado |
| TP-118 | CA-4; R-12 a, H-02 | TP-117 con el guion como U+2010, U+2013 o U+2212 | No se convierte: el código va a `pending` (o `formato-invalido`); nunca un código |
| TP-119 | CA-4; R-12 b | TP-117 con una palabra descartada entre dos palabras del código del mismo renglón: (a) un signo; (b) U+2800 (braille en blanco); (c) un carácter de uso privado; entre `M01` y `-` y entre `-` y `C04` | Código en `pending` aunque la unión cumpla el formato |
| TP-120 | CA-2; R-12 b | Ícono (signo, U+2800 o uso privado) al final del renglón 1, después de `9999-01-` | Código leído (como TP-107 a y TextoPdf) |
| TP-121 | CA-4; R-12 c | Ícono leído como dos dígitos y un signo, o como una letra, al final del renglón 1 | `pending` o `formato-invalido`; nunca otro código válido |
| TP-122 | CA-4; R-12 a | Un `-` de más (ícono leído como `-`) junto al guion del código | La unión da `--`: `pending`; nunca un código |
| TP-123 | CA-3, CA-9; R-13 a | Hoja de dos páginas donde la letra de una fila de la continuación llega como gemela cirílica (cada una de las 11 de la tabla, una por caso); la fila tiene marcas de canto | Fila separada de la anterior, con su letra latina, su cantidad, L y A leídas; Σ cantidad = pie; los cantos de la hoja se asignan (el paso no se degrada) |
| TP-124 | CA-4, CA-9; R-13 a | La letra llega como un carácter no latino fuera de la tabla (por ejemplo una cirílica sin gemela latina) | No es ancla, como hoy: la fila se funde con la anterior y sus campos quedan en `pending`; nunca un valor |
| TP-125 | CA-9; R-13 b | Dos cajas superpuestas (a 0,14 del alto) con la misma letra; y una latina con su gemela cirílica | Una sola fila; la segunda caja no aparece en ninguna celda |
| TP-126 | CA-4, CA-9; R-13 b | Dos cajas superpuestas con letras distintas (una de 2 y otra de 1 caracteres, como en la p. 2) | No se funden; la fila vacía queda con sus campos en `pending`, como hoy; nunca se elige una letra |
| TP-127 | CA-4; H-C (sin piso) | Dos marcas de canto de una fila casi en la misma x, sin fusión de filas | `pending` en `edges` de la hoja, como hoy (TP-90); ningún canto asignado por adivinación |
| TP-128 | CA-3, CA-10; R-14 a, c | Banda de hoja con una palabra suelta de una letra (hueco 1,37 antes y 0,50 después, la altura de las demás) entre el `-` y la medida, en una hoja de dos páginas; el Resumen con **una** fila de ese material y la misma medida | Medida y tipo leídos; la letra no está en ningún campo; toda fila `dudosa` |
| TP-129 | CA-4, CA-10; R-14 c | TP-128 con una medida distinta de la del Resumen (largo o ancho) | Rechazo `hoja-medida-sin-respaldo` en la página; ningún valor de medida |
| TP-130 | CA-4, CA-10; R-14 a | Un **dígito** suelto entre el `-` y la medida, en lugar de la letra | No hay tolerancia: rechazo de R-8 (`hoja-sin-encabezado-completo`); ningún valor (como TP-100) |
| TP-131 | CA-4; R-14 a | Dos palabras sueltas de un carácter entre el `-` y la medida | Rechazo de R-8 |
| TP-132 | CA-4, CA-10; R-14 c | TP-128 con (a) dos filas del Resumen con el mismo material y espesor; (b) ninguna fila de ese material | Rechazo `hoja-medida-sin-respaldo` |
| TP-133 | CA-2; R-14 d | (a) Sin palabra suelta y con una medida distinta de la del Resumen; (b) un signo en lugar de la letra | Se lee como hoy: R-14 no actúa y no compara con el Resumen (TP-98 y TP-106 sin cambio) |
| OR-17 | CA-7 | Lectura rechazada cuyo `detail` contiene texto del documento (por ejemplo `unidad-no-soportada`, que hoy cita el segmento) | Consola: `regla:` y `página:` con valores del catálogo; el texto no aparece |
| OR-18 | §6 | Cada sitio de rechazo del parser (hoy 21) | Tiene un id de regla del catálogo cerrado; ningún id repetido entre sitios con distinto significado |

### 5.3 Fixture con la geometría observada

- Elementos armados **en memoria**, como las variantes V1 a V7 de spec-fixture-sintetico §8. Por ejemplo `tests/helpers/ocrRealLike.ts`, sin PDF nuevo.
- Reproduce solo la **estructura** de §2.1: palabras sueltas, renglón corrido, separaciones en los rangos medidos, separadores (`-` en la banda de hoja, `|` en la cabecera del resumen, otro signo de un carácter en el pie) y la variante de la letra suelta.
- **Fila del Resumen y columna extra (TP-108 a TP-116):** el helper suma la geometría observada en la corrida 2: el primer segmento de la fila lleva una cola de texto `- <tipo de dos palabras>`; el encabezado de la tabla tiene un rótulo más entre `Σ Areas` y `Σ Partes`; esa columna lleva una celda con solo `-`. Separaciones medidas (× alto): dentro del primer segmento 0,25 a 0,67; entre celdas 2,14 a 9,17; hacia la celda `-`, 42 y 50. Los rótulos y el tipo son ficticios: la comprobación de TS-12b se extiende a estos textos.
- **Pictograma (TP-128 a TP-133):** el helper suma, en la banda de la hoja, una palabra suelta de un carácter entre el `-` y el primer número de la medida (huecos medidos: 1,37 antes y 0,50 después; la altura de las demás palabras; la distancia `-` → número queda en 2,2 a 2,4 × alto), y una fila del Resumen con la misma medida o con otra. Textos ficticios.
- **Código y anclas (TP-117 a TP-127):** el helper suma la geometría observada en el lookahead: el renglón 2 del código como tres palabras (`M01`, `-`, `C04`), íconos como palabras extra al final del renglón 1 (signos, U+2800 o letras y dígitos), una letra de fila como gemela cirílica en una página de continuación y dos cajas superpuestas en la columna "No." a 0,14 del alto. Códigos `9999-`, letras y textos ficticios.
- Datos ficticios: código `9999-`, material inventado ("Gris Sintético"), medidas que no repiten ninguna real (la comprobación de TS-12 se extiende a este helper: TS-12b).
- Nada de `.ocr-data/` se copia a `tests/`. La respuesta real no se usa como replay en la suite (sigue vigente spec-fixture-sintetico D2).

## 6. SPEC-B2: diagnóstico del rechazo y valor de la corrida

### 6.1 Qué imprime el script cuando el parser rechaza: D-a (decidida)

**Decisión (10/11, Santiago Borda): D-a.**

| Opción | Cómo | Cuánto diagnóstico da | ¿Toca un contrato aprobado? |
|---|---|---|---|
| **D-a (elegida)** | El rechazo de `PdfReading` lleva `rule` (id de un catálogo cerrado, uno por sitio de rechazo) y `page` (número o `null`). El script imprime `regla: <id>` y `página: <n>` | Completo: los 21 sitios de rechazo tienen id propio (OR-18). Es estable ante cambios de redacción del `detail` | Sí: el tipo `PdfReading` de spec-esquema §8 y spec-extraccion §13. Es la enmienda C2, aprobada |
| D-b (descartada) | El script deduce la regla comparando el `detail` con una tabla de plantillas | Parcial: un mensaje que no está en la tabla sale como "desconocida", y un cambio de texto rompe el diagnóstico sin aviso | No toca contratos, pero obliga al script a leer el `detail`, que hoy no toca |

Plantilla aplicada en SPEC-B2 §7, debajo de `lectura:` solo si hay rechazo:

```
regla: <id del catálogo>
página: <n> | -
```

El catálogo (un id por sitio de `ReadFailure`) se fija en la implementación, con OR-18. Ejemplos de nombre: `resumen-sin-unidad`, `resumen-sin-titulo-o-tabla`, `hoja-sin-material`, `hoja-sin-encabezado-completo`, `hoja-sin-pie`.

### 6.2 La corrida rechazada: dato para P-02, no medición (aprobado)

| Resultado | Corrida 1 (10/11) | Para qué sirve |
|---|---|---|
| Camino PDF → Vision → `PdfTextInput` | Válido: 5 páginas, 1190 palabras, conversión sin error | **Cuenta como dato para P-02** (decisión del 10/11). Cerrar P-02 sigue siendo decisión del equipo (spec-extraccion §15) |
| Lectura (`parseOcrWords`) | Rechazada: **no es una medición** | No hay filas, así que `distintos-sin-pending` no está definido. **Un rechazo no equivale a `distintos-sin-pending = 0`** |

- SPEC-B2 §4 (paso 8) y §14 ya decían que el rechazo "es un resultado, no un fallo del script": se mantiene.
- SPEC-B2 suma un **registro de corridas** (§12b): fecha, quién, resultado del camino, resultado de la lectura, regla y página. Sin hash ni contenido.
- Volver a leer la respuesta guardada con el parser nuevo (sin `--reenviar`, sin red) es la **corrida de desarrollo**. No valida nada (§7).

## 7. Riesgo de sobreajuste: validación con otro PDF (protocolo y enmienda D aprobados)

El ajuste se basa en **un** PDF. Protocolo:

1. **Desarrollo:** solo la respuesta guardada de Cedro 18 y los fixtures sintéticos. Las reglas de §4 salen de la estructura, no de valores medidos; si alguna necesita un número, va como PROVISORIO, a calibrar.
2. **Congelar:** antes de mirar otro PDF, las reglas quedan en un commit, con su versión en `readerVersion` (por ejemplo, `vision-files-annotate/real` + versión del parser).
3. **Validación 1, Blanco 18 del segundo fixture:** una corrida, sin cambiar nada después de verla. Aceptación: con transcripción, `distintos-sin-pending = 0`. Un rechazo con regla es un resultado aceptable, pero quiere decir "no generaliza", no "pasa".
4. **Si hay que cambiar reglas después de la validación 1,** esa corrida pasa a ser de desarrollo y la siguiente validación es el **primer fixture** (variante corta, transcripción ya versionada en `tests/fixtures/pdf/olmo.json`). Necesita su propia enmienda.
5. **Señales de sobreajuste:** una regla que menciona un glifo visto una sola vez (por eso R-10 no se restringe); un número ajustado a los huecos de §2; una regla que solo se cumple en la página 4.
6. **A revisar en esta validación (aprobado, 11/11):** el límite conocido del paso de los cantos sin piso (§2.5); si el pictograma de la banda (R-14) llega leído como letra, dígito u otro signo en otro PDF; si las letras de fila y del diagrama llegan en cirílico (P-R10, H-E).

La lista blanca admite un único hash: cada PDF exige cambiar el hash antes de correr. Detalle y condiciones en `docs/spec-ocr-prueba-real-enmienda-d.md` (**v0.2, aprobada**, informado por Santiago el 11/11/2026; E-1: `--paginas <n>`; E-2: la compuerta sigue antes de la caché).

## 8. Preguntas abiertas

| Id | Pregunta | Estado |
|---|---|---|
| P-R1 | ¿Las páginas de continuación repiten el título de material de la hoja? | **Cerrada (10/11): sí** (§2.4) |
| P-R2 | En la banda de hoja, ¿hay un `/` entre el material y el espesor? | **Cerrada (10/11): sí, el OCR lo pierde** (§2.4, §4.1) |
| P-R3 | ¿Qué signos separan los campos? | **Cerrada (10/11)** para la banda de hoja (" - ") y la cabecera del resumen (`\|`). El signo del pie no se verificó (no bloquea: R-10 es genérica) |
| P-R4 | En el renglón de arriba de la página 1, ¿qué son las 5 palabras pegadas a la izquierda de "<material> / <espesor> mm" y qué parte es el material? | **Cerrada (10/11, Santiago, mirando la página 1):** son "Diagrama de corte", la barra `\|` y el material. "Diagrama de corte `\|`" es el título del documento y la barra es un separador; el material es solo la palabra pegada al `/`. **R-7 sigue coherente sin cambiar su texto:** la barra es un separador (R-10), hay límite a la izquierda y se aplica la primera rama. Cambia solo cuál rama se usa en este PDF; la igualdad con la tabla queda como respaldo (ver §4, R-7) |
| P-R5 | En la página 4, ¿qué hay donde el OCR devolvió una letra suelta entre el " - " y la medida del tablero? | **Cerrada (10/11, Santiago, mirando el PDF):** un pictograma (ícono de tablero) entre el `-` que sigue al espesor y la medida, presente en las cuatro páginas; en la p. 4 Vision lo leyó como una letra minúscula suelta y en las otras tres no leyó nada. Regla: R-14 (opción C, §4.7). La hipótesis de la etiqueta del diagrama queda descartada |
| P-R6 | ¿"pm" es parte de la fecha? | **Cerrada (10/11): sí**, es parte de la hora, pegada a la fecha; la unidad va aparte, después de la barra |
| P-R7 | ¿Pasa lo mismo en el Blanco 18 y en el primer fixture? | Se responde en la validación (§7) |
| P-R8 | En la tabla del Resumen, ¿el séptimo rótulo (entre `Σ Areas` y `Σ Partes`) es `Σ Costos`, y la celda `-` de la fila es su valor? | **Cerrada (10/11, Santiago, mirando el PDF): sí** |
| P-R9 | En la designación, ¿el `-` entre `M01` y `C04` es parte del código? ¿Qué es lo que el OCR lee en lugar de cada ícono (letras, dígitos, signos, braille en blanco)? | **Cerrada (10/11, Santiago, mirando el PDF):** el `-` es un guion real del código, no un ícono. Los íconos son pictogramas junto al código, y en algunas filas hay uno en el medio. R-12 |
| P-R10 | En la columna "No.", ¿la letra de la p. 5 está escrita con una letra cirílica en el PDF o es un error del OCR? ¿Hay una letra duplicada en la p. 2? | **Abierta, como hipótesis** (H-B, §2.5). Verificado: una letra de fila llega con un carácter fuera de `A-Z` (mayúscula cirílica) y otra llega duplicada. **Hipótesis de Santiago (10/11), sin verificar:** Vision confunde letras latinas con sus gemelas visuales en cirílico (entre las letras de fila del PDF hay C, K, M, O, H y P). R-13 no depende de confirmarla. **Diagnóstico de las dos cajas de la p. 2 (10/11; §2.5):** superpuestas por completo, una de 2 letras iguales (más angosta) y otra de 1 letra distinta; no son dos filas. **Sigue abierta como hipótesis y no bloquea** (decisión de Santiago, 10/11): el comportamiento actual es seguro |

**N-1 (decidida, 10/11/2026, por Santiago; a informar al equipo).** El OCR devuelve la hora y "pm" como dos palabras (separación 0,09). `glueGapRatio` solo pega signos, así que `generatedAt` queda "<fecha> <hora> pm", con un espacio, y los ejemplos de la spec lo escriben sin espacio ("5:47pm"). **Decisión: `generatedAt` se compara ignorando espacios; si fecha y hora no se pueden interpretar, queda `pending`.** SPEC-B2 §9 no compara `header`, así que no afecta la métrica de la prueba; vale para CA-1 y TP-95.

## 9. Decisiones (10/11)

| # | Punto | Decisión |
|---|---|---|
| 1 | C1 (spec-extraccion §5, paso 3) | Aprobada |
| 2 | C2 (`rule` y `page` en `PdfReading`, sin texto del documento) | Aprobada |
| 3 | §8.2 | Opción A; R-1 a R-10 aprobadas, con la condición de que ninguna relaje `dudosa` ni `pending` (verificada en §4.0) |
| 4 | Variante del material sin `/` | /-b aprobada |
| 5 | Corrida 1 | Dato para P-02, no medición de lectura |
| 6 | Validación con otro PDF | Protocolo aprobado (§7). Enmienda D a SPEC-B2: **aprobada** (informado por Santiago el 11/11/2026) con E-1 y E-2; aplicada en SPEC-B2 v0.4 (ver 11 y 26) |
| 7 | Formato del diagnóstico | D-a (Santiago Borda, 10/11) |
| 8 | P-R1, P-R2, P-R3, P-R6 | Cerradas con la verificación en el PDF (§2.4) |
| 9 | P-R4 | **Cerrada (10/11, Santiago):** el material es solo la palabra pegada al `/`; "Diagrama de corte \|" es el título del documento. R-7 coherente (§4) |
| 10 | N-1 | **Decidida (10/11, Santiago; a informar al equipo):** `generatedAt` se compara ignorando espacios; si no se interpreta, `pending` |
| 11 | Enmienda D | **Santiago recomienda aceptar E-1 (`--paginas`) y E-2 (la compuerta va antes de la caché).** **Aprobada** (informado por Santiago el 11/11/2026), con E-1 y E-2: `docs/spec-ocr-prueba-real-enmienda-d.md` v0.2 |
| 12 | P-R5 | **Cerrada (10/11, Santiago, mirando el PDF):** pictograma en la banda; ver 23 |
| 13 | R-11 (fila de la tabla del Resumen), decisiones 1 a 5 de Santiago del 10/11/2026 | **Aprobada por Santiago el 10/11/2026, con la salvedad y O-R11-1 a O-R11-4 y por el equipo y el profesor (informado por Santiago el 11/11/2026)** (§4.4) |
| 15 | P-R8 y P-R9 | **Cerradas** (Santiago, 10/11, mirando el PDF) |
| 16 | P-R10 | **Abierta como hipótesis** (gemelas cirílicas); **no bloquea** (decisión de Santiago, 10/11): el comportamiento actual es seguro |
| 17 | R-12 (guion; ícono en el medio = entre palabras del mismo renglón) y R-13 (tabla cerrada; fundir anclas solo si son iguales) | **Aprobadas por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026)** (§4.5, §4.6; ver 19) |
| 18 | H-C (paso de los cantos) | **Sin regla nueva:** se resuelve con R-13 en este PDF (§2.5, ronda 2). No se agrega piso |
| 19 | R-12 con O-R12-1 y O-R12-2 (línea base nueva de TP-106 registrada en el plan de pruebas); R-13 con O-R13-1 (las 11 letras) y O-R13-2; O-R13-3 | **Aprobadas por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026).** O-R13-3 **no se adopta** (§4.5, §4.6) |
| 20 | Excepción de R-13 a H-02 | **Justificada** en §4.6 (tabla cerrada; etiqueta local; INV-3, INV-5 e INV-6), con la diferencia respecto de R-12 (los otros guiones no se convierten). Ajustes a spec-extraccion pendientes (C6) |
| 21 | H-E (gemelas cirílicas en el diagrama) | **Razón de fila** (decisión de Santiago, 10/11): R-13 no se extiende al diagrama |
| 22 | Cantos sin piso | **Riesgo aceptado por Santiago (10/11)**; límite conocido, sin umbral, a revisar al validar con otro PDF (§2.5, §7) |
| 23 | P-R5 cerrada; **opción C elegida**, que da R-14 | **Elegida por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026)** (§4.7). Las opciones A y B quedan descartadas |
| 24 | C6 (excepción de R-13 a H-02: ajustes de spec-extraccion §3 y §5.1) | **Aprobada por Santiago el 10/11/2026 y por el equipo y el profesor (informado por Santiago el 11/11/2026).** Redactada en spec-extraccion v0.3.3 (aprobada) |
| 25 | Paquete de aprobación | **Armado** en `docs/paquete-aprobacion-ocr-real.md`: lista única y autocontenida de lo que se pidió al equipo y al profesor; **aprobado** (ítems 1 a 14, informado por Santiago el 11/11/2026) |
| 14 | Reapertura de §2.1 (§2.1b) y lookahead (§2.5) | **Aprobado** (informado por Santiago el 11/11/2026). H-A a H-C se resuelven con R-12, R-13 y R-11; H-D deriva de ellos; H-E queda como razón de fila (decisión 21) |
| 26 | Aprobación de los ítems 1 a 14 del paquete (R-11 a R-14, C4 a C7, R-7, N-1 y P-R4, límite de los cantos, H-E, línea base de TP-106, enmienda D con E-1 y E-2) | **Aprobados por el equipo y el profesor, informado por Santiago el 11/11/2026** (evidencia: respuestas al mensaje de aprobación, a archivar). Implementación: ver `CLAUDE.md` (rama `ocr-revision-real`) |

## Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 10/11/2026 | Borrador: hechos de la corrida 1, opciones A a C, reglas R-1 a R-10, criterios CA-1 a CA-7, pruebas TP-95 a TP-107, OR-17 y OR-18, diagnóstico D-a o D-b, protocolo de validación |
| 0.2 | 10/11/2026 | **Aprobado por equipo y profesor, informado por Santiago el 10/11/2026; evidencia: a archivar.** Decisiones de §9. Se agrega §4.0 (verificación regla por regla de que ninguna relaja `dudosa` ni `pending`). Respuestas de P-R1, P-R2, P-R3 y P-R6; P-R4 y P-R5 abiertas; nota N-1. Aplicado en spec-esquema, spec-extraccion (v0.3.2), SPEC-B2 (v0.3) y el plan de pruebas. La enmienda D a SPEC-B2 (validación con Blanco 18) queda en borrador aparte |
| 0.3 | 10/11/2026 | Decisiones de Santiago del 10/11/2026 (a informar al equipo; no son parte de la aprobación de la v0.2): **P-R4 cerrada** (el material es solo la palabra pegada al `/`; R-7 coherente, se aplica su primera rama; el error latente de `header.material` queda confirmado por la estructura); **N-1 decidida** (`generatedAt` se compara ignorando espacios, `pending` si no se interpreta); recomendación de aceptar E-1 y E-2 de la enmienda D, que sigue sin aprobar. TP-95 y TP-104 ajustadas. P-R5 sigue abierta |
| 0.4 | 10/11/2026 | **BORRADOR; propuesto, pendiente de aprobación del equipo y del profesor; no aprobado ni implementado.** Origen: la corrida 2 de `ocr:real` (`resumen-tabla-vacia`, página 1). Propone **R-11** (fila de la tabla del Resumen, §4.4) con las decisiones 1 a 5 de Santiago del 10/11/2026, la contradicción C4, CA-8 y las pruebas TP-108 a TP-116 con la geometría observada (§5.3). **Reabre §2.1** (§2.1b): la fila "Tabla del resumen" decía OK mirando solo las anclas del encabezado y no lo era; se marcan como refutadas dos afirmaciones y como confirmadas las demás, cada una con lo que se midió. Agrega el **lookahead** (§2.5) con los hallazgos H-A a H-D (código, anclas de "No.", paso de los cantos, razones secundarias) como candidatos a regla, sin redactar, y las preguntas P-R8 a P-R10. §4.2 queda sujeto a revisión |
| 0.5 | 10/11/2026 | **BORRADOR; propuesto, pendiente de aprobación del equipo y del profesor; no aprobado ni implementado.** R-11 con O-R11-1 a O-R11-4 **aprobada por Santiago** (pendiente del equipo y del profesor). P-R8 y P-R9 cerradas mirando el PDF; P-R10 queda como hipótesis. Propone **R-12** (guion del código; ícono entre palabras del mismo renglón → `pending`, §4.5) y **R-13** (normalización cerrada de 11 gemelas cirílicas en "No."; anclas superpuestas solo se funden si son iguales, §4.6), con C5, CA-9, la verificación de §4.0 y TP-117 a TP-127. **Repite el lookahead** (§2.5, ronda 2): un solo rechazo (p. 4, R-8); 12 + 12 filas; Σ 17/17 y 25/25; 18 códigos leídos de 24 filas; H-C se resuelve con R-13, sin piso; nuevo H-E (gemelas cirílicas en el diagrama). Corrige "Designación e íconos" y "Filas" de spec-esquema §8.2 |
| 0.6 | 10/11/2026 | **BORRADOR; propuesto, pendiente de aprobación del equipo y del profesor; no aprobado ni implementado.** Registra las decisiones de Santiago sobre R-12 (O-R12-1, O-R12-2; línea base nueva de TP-106 en el plan de pruebas) y R-13 (O-R13-1 con las 11 letras, O-R13-2; O-R13-3 no se adopta). Agrega la **justificación de R-13 como excepción a H-02** y la diferencia con R-12 (§4.6) y la contradicción C6. H-E queda como razón de fila. El paso de los cantos sin piso se documenta como **límite conocido** y se revisa al validar con otro PDF (§2.5, §7). **Diagnostica P-R5** (§2.5: letra minúscula suelta en el hueco `-` → medida; la medida está entera e igual a la del Resumen; no es una etiqueta del diagrama) y las **cajas superpuestas de "No." de la p. 2**. Propone tres opciones de regla para P-R5, **sin elegir** (§4.7) |
| 0.7 | 10/11/2026 | **BORRADOR; propuesto, pendiente de aprobación del equipo y del profesor; no aprobado ni implementado.** **P-R5 cerrada** (Santiago, mirando el PDF: pictograma de la banda, presente en las 4 páginas). **Opción C elegida por Santiago:** se redacta **R-14** (§4.7; contradicción C7 con R-8; id `hoja-medida-sin-respaldo`), CA-10, TP-99 actualizada y TP-128 a TP-133; se verifica con la sonda que no relaja `dudosa` ni `pending`. **C6 aprobada por Santiago:** ajustes de H-02 y §5.1 redactados como borrador en spec-extraccion v0.3.3. P-R10 queda abierta como hipótesis y no bloquea. Agrega el paquete de aprobación `docs/paquete-aprobacion-ocr-real.md` |
| 0.8 | 11/11/2026 | **APROBADA** por el equipo y el profesor, informado por Santiago el 11/11/2026: ítems 1 a 14 de `docs/paquete-aprobacion-ocr-real.md`, incluida la enmienda D con E-1 y E-2 (evidencia: respuestas al mensaje de aprobación, a archivar). Las versiones 0.4 a 0.7 quedan aprobadas con esta fecha: sus filas de arriba conservan el texto de cuando eran borrador. Sin cambios de contenido en las reglas. Enmienda D aplicada en SPEC-B2 v0.4 y `docs/spec-ocr-prueba-real-enmienda-d.md` v0.2. Implementación en la rama `ocr-revision-real` |
