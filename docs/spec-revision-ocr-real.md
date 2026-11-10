# Revisión de la lectura por OCR tras la primera corrida real

| Campo | Valor |
|---|---|
| Versión | 0.3 (0.2 **aprobada**; la 0.3 suma tres decisiones de Santiago del 10/11/2026: P-R4, N-1 y la recomendación sobre la enmienda D; ver Historial) |
| Estado | **Aprobado** (v0.2) por equipo y profesor, informado por Santiago el 10/11/2026; evidencia: a archivar. Los cambios de la v0.3 son decisiones de Santiago del 10/11/2026, **a informar al equipo** |
| Revisa | `docs/spec-esquema-pdf.md` §8 (tipo `PdfReading`) y §8.2 ("Granularidad con OCR", "Textos esperados"), `docs/spec-extraccion-pdf.md` §5 (paso 3) y §13, y `docs/spec-ocr-prueba-real.md` (SPEC-B2) §4, §7, §11 y §14 |
| Aplicado en | `spec-esquema-pdf.md` (§8, §8.2, §13), `spec-extraccion-pdf.md` (v0.3.2), `spec-ocr-prueba-real.md` (v0.3) y `test-plan-esquema-pdf.md` (TP-95 a TP-107). **La validación con otro PDF (§7) no está aplicada**: su enmienda a SPEC-B2 es un borrador aparte, `docs/spec-ocr-prueba-real-enmienda-d.md`, sin aprobar |
| Origen | Primera corrida de `npm run ocr:real` con un PDF real del segundo fixture (Cedro 18 mm, 5 páginas): `lectura: rechazado (estructura-no-reconocida)`. Diagnóstico local sobre la respuesta guardada, sin red |
| Regla de datos | Este documento no contiene texto, códigos, medidas ni hashes del PDF real. Solo estructura: cantidad de palabras, clases de palabra (número, palabra, signo), rótulos que ya figuran en la spec, signos separadores verificados por el equipo y separaciones relativas al alto de la caja |

---

## 1. Contradicciones con specs aprobadas

| Id | Texto aprobado | Qué cambia | Estado |
|---|---|---|---|
| C1 | `spec-extraccion-pdf.md` §5, paso 3: las palabras del OCR alimentan `parseCutListText` "**sin cambios**"; §1: el parser "se reutiliza" | Cambia cómo el parser localiza unidad, fecha, medida del tablero, material, tipo de tablero y pie (§4). §5 paso 3 pasa a decir "con el mismo parser para `TextoPdf` y `OcrLlm`" | **Aprobada (10/11).** Aplicada en spec-extraccion v0.3.2 |
| C2 | `spec-esquema-pdf.md` §8 y `spec-extraccion-pdf.md` §13: `PdfReading` no ok = `{ ok, reason, detail }` | Se agregan `rule` (id de un catálogo cerrado) y `page` (número o `null`), sin texto del documento (§6) | **Aprobada (10/11).** Aplicada en los dos documentos. `src/pdf/types.ts` no cambia hasta la implementación |
| C3 | SPEC-B2 §1: "un único PDF real" | Validación con un segundo PDF (§7) | Protocolo **aprobado**. Su enmienda D a SPEC-B2 está en borrador (`docs/spec-ocr-prueba-real-enmienda-d.md`): **no aplicada** |

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
| Tabla del resumen | Rótulos `Cant.`, `Longitud`, `Anchura`, `Σ Areas`, `Σ Partes`; `Configuraciones`, `Estadísticas` | Se encuentran todos | OK |
| Encabezado de hoja | `SHEET`, `MATERIAL`, `BOARD_SIZE` y `/^Tablero/` en segmentos separados | **Un solo renglón** en las 4 páginas: `<material> <n> mm - <n> mm x <n> mm - Tablero estándar`, después un hueco de unos 19 y `i / N`. Separaciones: material → número 1,2 a 1,4 (ahí está el `/` que el OCR perdió, §2.4); dentro de cada campo 0,25 a 0,62; `-` → número 2,2 a 2,4; `-` → "Tablero" 0,8 a 1,0 | `SHEET` se encuentra. `MATERIAL` no (falta `/`). `BOARD_SIZE` y `Tablero` no: la medida queda pegada a "- Tablero estándar" |
| Página 4 | — | En el hueco `-` → número (2,2 a 2,4 en las otras páginas) llega una **letra suelta**, con separaciones 1,37 y 0,50. Todo el renglón queda unido | La medida de esa hoja queda sin límite claro (§4). Origen sin verificar (P-R5) |
| Encabezado de tabla | `Finales`, `Ajustadas`, `No.`, `Cant.`, `Tiras de cantos`, `L`, `A` | Están en las páginas 2 y 4. En las 3 y 5 faltan, como ya decía §8.2 ("la continuación no repite el encabezado de la tabla") | OK |
| Pie | `PIECE_COUNT` = `^\d+\s*piezas?$` sobre el segmento | Páginas 3 y 5. **Un solo renglón**: `La fibra sigue la longitud <signo> <n> piezas`, un hueco de 12 a 14 y `Longitud de cortes : <dec> <letra> <signo> Eficiencia : <dec> %`. Separaciones internas de 0,0 a 0,73. El signo del pie **no se verificó** en el PDF | `PIECE_COUNT` no se encuentra (rechazo `hoja-incompleta`). `Longitud de cortes` y `Eficiencia` quedarían en `pending` (seguro) |

Si solo se arreglara la unidad, el orden de rechazo previsible sería: `hoja-incompleta` en la p. 2 (material, l. 337), después `estructura-no-reconocida` (medida, l. 585) y después `hoja-incompleta` (pie, l. 398). **Supuesto**: no se ejecutó.

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
| R-7 | **Título del resumen.** El material se toma de la secuencia entre el límite más cercano a la izquierda y el `/`. Si a la izquierda no hay un límite que lo cierre, el valor solo se acepta si es **exactamente igual** al material de una fila de la tabla del resumen; si no, rechazo (`header.material` no admite `null`). **P-R4 cerrada (10/11):** en el PDF del segundo fixture hay límite (la barra `\|`, R-10), así que se aplica la primera rama y el material es solo la palabra pegada al `/`; el título del documento queda fuera. La igualdad con la tabla es el respaldo para cuando no hay límite |
| R-8 | **Medida y tipo de tablero.** `<n> mm x <n> mm` delimitado; `Tablero` más las palabras que siguen hasta un límite. Una medida sin límite a la izquierda (p. 4) no se lee y la regla de l. 585 sigue rechazando. **No** se acepta que un número "se delimita solo": un número partido por el OCR daría un valor falso sin aviso (TP-100) |
| R-9 | **Pie.** `<n> piezas` delimitado (la fibra y el separador lo preceden). `Longitud de cortes` y `Eficiencia`: el valor es lo que sigue al rótulo y al `:` opcional, hasta un límite. Si no es un número, `pending` (como hoy) |
| R-10 | **Separadores.** Cualquier palabra de un carácter sin letras ni dígitos que el patrón no consume. P-R3 verificó los separadores de este PDF (`-` en la banda de hoja, `\|` en la cabecera del resumen), pero el conjunto **no se restringe** a esos glifos: restringirlo con un solo PDF sería sobreajuste, y hacerlo exige una decisión nueva. Sigue PROVISORIO, a calibrar. No se agrega ningún número nuevo |

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
- La lectura de filas, columnas y marcas de canto.

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

### 5.2 Pruebas nuevas

Convención del repo: TP- para el plan del esquema (siguen a TP-94) y OR- para SPEC-B2 (siguen a OR-16). Copiadas a `docs/test-plan-esquema-pdf.md` y a SPEC-B2 §11.

| Id | Criterio | Caso (sintético) | Esperado |
|---|---|---|---|
| TP-95 | CA-1, CA-3; R-4, R-5 | Renglón del resumen: título, hueco grande, fecha, hora, "pm", `\|`, unidad; separaciones de 0,1 a 0,7 × alto. Subcaso: hora y "pm" como dos palabras (N-1) | Unidad leída; `generatedAt` = fecha + hora con "pm", sin la unidad, **comparado ignorando espacios**; si no se interpreta, `pending` |
| TP-96 | R-4 | Igual que TP-95, con otra unidad en lugar de milímetros | `unidad-no-soportada` |
| TP-97 | R-4 | Sin unidad | `estructura-no-reconocida`; regla del catálogo para "resumen sin unidad" (§6) |
| TP-98 | CA-3; R-6, R-8 | Banda de hoja en un renglón: `<material> <e> mm - <L> mm x <A> mm - Tablero estándar`, hueco, `i / N`, con las separaciones de §2.1, con y sin `/` | Medida, tipo, material y espesor leídos (/-b) |
| TP-99 | CA-4; R-8 | TP-98 con una letra suelta entre el `-` y la medida (caso p. 4) | Medida sin leer; rechazo en la primera página de la hoja; ningún valor de medida |
| TP-100 | CA-4; R-8 | Número de la medida partido en dos palabras con separación de 0,5 | No se lee el número parcial; `pending` o rechazo |
| TP-101 | R-6, §4.1 | Material de hoja sin `/`: igual al resumen; distinto; con `/` | Leído; `hoja-incompleta`; leído (sin regresión) |
| TP-102 | CA-3; R-9 | Pie en un renglón: fibra + signo + `<n> piezas`, hueco, longitud de cortes + signo + eficiencia | `pieceCount` leído; longitud y eficiencia leídas o en `pending`; nunca otro valor |
| TP-103 | CA-4; R-3 | Dos medidas distintas en el renglón de `i / N` | No se elige; rechazo |
| TP-104 | CA-1; R-7 | Título del resumen con un título ficticio de tres palabras a la izquierda del material (sin datos reales): (a) separado del material por `\|`; (b) sin separador y el final coincide con una fila de la tabla; (c) sin separador y no coincide | (a) solo el material, sin el título ni la barra; (b) material de la fila; (c) rechazo; nunca un material con palabras de más |
| TP-105 | R-2 | `<n> mm x <n> mm` en una celda de la tabla o en el diagrama | No cuenta como medida del tablero |
| TP-106 | CA-2 | TP-50, TS-04 y el replay sintético de Vision con el parser nuevo | Idénticos a hoy |
| TP-107 | CA-1, CA-4; RL-1 (§4.3) | Código `9999-` en dos renglones de palabras de OCR, con una palabra suelta en el medio: (a) un signo; (b) una letra; (c) un dígito que deja el formato inválido | (a) código leído; (b) y (c) `formato-invalido` o `pending`; nunca otro código válido sin razón |
| OR-17 | CA-7 | Lectura rechazada cuyo `detail` contiene texto del documento (por ejemplo `unidad-no-soportada`, que hoy cita el segmento) | Consola: `regla:` y `página:` con valores del catálogo; el texto no aparece |
| OR-18 | §6 | Cada sitio de rechazo del parser (hoy 21) | Tiene un id de regla del catálogo cerrado; ningún id repetido entre sitios con distinto significado |

### 5.3 Fixture con la geometría observada

- Elementos armados **en memoria**, como las variantes V1 a V7 de spec-fixture-sintetico §8. Por ejemplo `tests/helpers/ocrRealLike.ts`, sin PDF nuevo.
- Reproduce solo la **estructura** de §2.1: palabras sueltas, renglón corrido, separaciones en los rangos medidos, separadores (`-` en la banda de hoja, `|` en la cabecera del resumen, otro signo de un carácter en el pie) y la variante de la letra suelta.
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

## 7. Riesgo de sobreajuste: validación con otro PDF (protocolo aprobado; enmienda en borrador)

El ajuste se basa en **un** PDF. Protocolo:

1. **Desarrollo:** solo la respuesta guardada de Cedro 18 y los fixtures sintéticos. Las reglas de §4 salen de la estructura, no de valores medidos; si alguna necesita un número, va como PROVISORIO, a calibrar.
2. **Congelar:** antes de mirar otro PDF, las reglas quedan en un commit, con su versión en `readerVersion` (por ejemplo, `vision-files-annotate/real` + versión del parser).
3. **Validación 1, Blanco 18 del segundo fixture:** una corrida, sin cambiar nada después de verla. Aceptación: con transcripción, `distintos-sin-pending = 0`. Un rechazo con regla es un resultado aceptable, pero quiere decir "no generaliza", no "pasa".
4. **Si hay que cambiar reglas después de la validación 1,** esa corrida pasa a ser de desarrollo y la siguiente validación es el **primer fixture** (variante corta, transcripción ya versionada en `tests/fixtures/pdf/olmo.json`). Necesita su propia enmienda.
5. **Señales de sobreajuste:** una regla que menciona un glifo visto una sola vez (por eso R-10 no se restringe); un número ajustado a los huecos de §2; una regla que solo se cumple en la página 4.

La lista blanca admite un único hash: cada PDF exige cambiar el hash antes de correr. Detalle y condiciones en `docs/spec-ocr-prueba-real-enmienda-d.md` (**borrador, sin aprobar**).

## 8. Preguntas abiertas

| Id | Pregunta | Estado |
|---|---|---|
| P-R1 | ¿Las páginas de continuación repiten el título de material de la hoja? | **Cerrada (10/11): sí** (§2.4) |
| P-R2 | En la banda de hoja, ¿hay un `/` entre el material y el espesor? | **Cerrada (10/11): sí, el OCR lo pierde** (§2.4, §4.1) |
| P-R3 | ¿Qué signos separan los campos? | **Cerrada (10/11)** para la banda de hoja (" - ") y la cabecera del resumen (`\|`). El signo del pie no se verificó (no bloquea: R-10 es genérica) |
| P-R4 | En el renglón de arriba de la página 1, ¿qué son las 5 palabras pegadas a la izquierda de "<material> / <espesor> mm" y qué parte es el material? | **Cerrada (10/11, Santiago, mirando la página 1):** son "Diagrama de corte", la barra `\|` y el material. "Diagrama de corte `\|`" es el título del documento y la barra es un separador; el material es solo la palabra pegada al `/`. **R-7 sigue coherente sin cambiar su texto:** la barra es un separador (R-10), hay límite a la izquierda y se aplica la primera rama. Cambia solo cuál rama se usa en este PDF; la igualdad con la tabla queda como respaldo (ver §4, R-7) |
| P-R5 | **ABIERTA, sin verificar.** En la página 4, ¿qué hay donde el OCR devolvió una letra suelta entre el " - " y la medida del tablero? **Hipótesis del equipo:** una etiqueta de una letra del diagrama de cortes que queda a la altura de la banda de título | No bloquea: R-8 la trata como "sin límite" (rechazo seguro, TP-99). Si se confirma, la letra cae en la zona de R-2 y habría que ver si la zona por renglón alcanza |
| P-R6 | ¿"pm" es parte de la fecha? | **Cerrada (10/11): sí**, es parte de la hora, pegada a la fecha; la unidad va aparte, después de la barra |
| P-R7 | ¿Pasa lo mismo en el Blanco 18 y en el primer fixture? | Se responde en la validación (§7) |

**N-1 (decidida, 10/11/2026, por Santiago; a informar al equipo).** El OCR devuelve la hora y "pm" como dos palabras (separación 0,09). `glueGapRatio` solo pega signos, así que `generatedAt` queda "<fecha> <hora> pm", con un espacio, y los ejemplos de la spec lo escriben sin espacio ("5:47pm"). **Decisión: `generatedAt` se compara ignorando espacios; si fecha y hora no se pueden interpretar, queda `pending`.** SPEC-B2 §9 no compara `header`, así que no afecta la métrica de la prueba; vale para CA-1 y TP-95.

## 9. Decisiones (10/11)

| # | Punto | Decisión |
|---|---|---|
| 1 | C1 (spec-extraccion §5, paso 3) | Aprobada |
| 2 | C2 (`rule` y `page` en `PdfReading`, sin texto del documento) | Aprobada |
| 3 | §8.2 | Opción A; R-1 a R-10 aprobadas, con la condición de que ninguna relaje `dudosa` ni `pending` (verificada en §4.0) |
| 4 | Variante del material sin `/` | /-b aprobada |
| 5 | Corrida 1 | Dato para P-02, no medición de lectura |
| 6 | Validación con otro PDF | Protocolo aprobado (§7). Enmienda D a SPEC-B2 redactada como borrador aparte; no aplicada |
| 7 | Formato del diagnóstico | D-a (Santiago Borda, 10/11) |
| 8 | P-R1, P-R2, P-R3, P-R6 | Cerradas con la verificación en el PDF (§2.4) |
| 9 | P-R4 | **Cerrada (10/11, Santiago):** el material es solo la palabra pegada al `/`; "Diagrama de corte \|" es el título del documento. R-7 coherente (§4) |
| 10 | N-1 | **Decidida (10/11, Santiago; a informar al equipo):** `generatedAt` se compara ignorando espacios; si no se interpreta, `pending` |
| 11 | Enmienda D | **Santiago recomienda aceptar E-1 (`--paginas`) y E-2 (la compuerta va antes de la caché).** Sigue **sin aprobar**: `docs/spec-ocr-prueba-real-enmienda-d.md` |
| 12 | P-R5 | **Abierta** (hipótesis: etiqueta del diagrama; no bloquea) |

## Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 10/11/2026 | Borrador: hechos de la corrida 1, opciones A a C, reglas R-1 a R-10, criterios CA-1 a CA-7, pruebas TP-95 a TP-107, OR-17 y OR-18, diagnóstico D-a o D-b, protocolo de validación |
| 0.2 | 10/11/2026 | **Aprobado por equipo y profesor, informado por Santiago el 10/11/2026; evidencia: a archivar.** Decisiones de §9. Se agrega §4.0 (verificación regla por regla de que ninguna relaja `dudosa` ni `pending`). Respuestas de P-R1, P-R2, P-R3 y P-R6; P-R4 y P-R5 abiertas; nota N-1. Aplicado en spec-esquema, spec-extraccion (v0.3.2), SPEC-B2 (v0.3) y el plan de pruebas. La enmienda D a SPEC-B2 (validación con Blanco 18) queda en borrador aparte |
| 0.3 | 10/11/2026 | Decisiones de Santiago del 10/11/2026 (a informar al equipo; no son parte de la aprobación de la v0.2): **P-R4 cerrada** (el material es solo la palabra pegada al `/`; R-7 coherente, se aplica su primera rama; el error latente de `header.material` queda confirmado por la estructura); **N-1 decidida** (`generatedAt` se compara ignorando espacios, `pending` si no se interpreta); recomendación de aceptar E-1 y E-2 de la enmienda D, que sigue sin aprobar. TP-95 y TP-104 ajustadas. P-R5 sigue abierta |
