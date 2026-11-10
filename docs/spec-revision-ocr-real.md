# Borrador — Revisión de la lectura por OCR tras la primera corrida real

| Campo | Valor |
|---|---|
| Estado | **BORRADOR v0.1, sin aprobar** (10/11/2026). No cambia ningún documento vigente hasta su aprobación |
| Revisa | `docs/spec-esquema-pdf.md` §8.2 ("Granularidad con OCR", "Textos esperados") y `docs/spec-ocr-prueba-real.md` (SPEC-B2) §7, §12 y §14 |
| Toca además (ver §1) | `docs/spec-extraccion-pdf.md` v0.3.1 §5 (paso 3) y §13 (tipo `PdfReading`) |
| Origen | Primera corrida de `npm run ocr:real` con un PDF real del segundo fixture (Cedro 18 mm, 5 páginas): `lectura: rechazado (estructura-no-reconocida)`. Diagnóstico local sobre la respuesta guardada, sin red |
| Regla de datos | Este documento no contiene texto, códigos, medidas ni hashes del PDF real. Solo estructura: cantidad de palabras, clases de palabra (número, palabra, signo), rótulos que ya figuran en la spec y separaciones relativas al alto de la caja |

---

## 1. Contradicciones con specs aprobadas (aviso previo)

Antes de proponer nada: tres puntos chocan con texto aprobado. Si el borrador se aprueba, cada uno necesita su enmienda explícita.

| Id | Texto aprobado | Qué propone este borrador | Qué hay que enmendar |
|---|---|---|---|
| C1 | `spec-extraccion-pdf.md` §5, paso 3: las palabras del OCR alimentan `parseCutListText` "**sin cambios**"; §1: el parser "se reutiliza" | Cambiar cómo el parser localiza unidad, medida del tablero, material, tipo de tablero y pie (§4) | §5 paso 3: "sin cambios" pasa a decir "con el mismo parser para `TextoPdf` y `OcrLlm`". Ya hay un antecedente: el 10/11 se agregó `layout` a `PdfTextInput` |
| C2 | `spec-esquema-pdf.md` §8 y `spec-extraccion-pdf.md` §13: `PdfReading` no ok = `{ ok, reason, detail }` | Agregar un diagnóstico estructurado (`rule`, `page`) al rechazo (§6, opción D-a) | El tipo de los dos documentos |
| C3 | SPEC-B2 §1: "un único PDF real"; "cualquier otro PDF real" queda fuera del alcance | Validación con un segundo PDF (§7) | Una enmienda D a SPEC-B2, o una spec aparte. **No** se propone ampliar el alcance en este borrador: solo se deja descrito el protocolo |

No choca: SPEC-B2 §1 ya dice que cambiar el parser "es otra spec" (es esta) y §7 prohíbe imprimir el `detail`; la propuesta de §6 lo mantiene.

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
| Unidad | `MILLIMETER` sobre el **segmento entero** (l. 183) | La palabra llega sola y cumple la regla. Comparte renglón con fecha, hora y un marcador de dos letras, y la precede un signo de un carácter. Separaciones entre esas palabras: 0,09 a 0,64 | Se une en un segmento de 30 caracteres. **Primer rechazo** (`estructura-no-reconocida`) |
| Fecha | `DATE` = prefijo `^dd/dd/dddd\s+\d` | La misma unión | **Error latente sin aviso.** Si la unidad se leyera, `header.generatedAt` tomaría todo el segmento, unidad incluida. Es un valor mal leído sin `pending` |
| Título del resumen | `MATERIAL` sobre el segmento | Cumple. Antes del material hay 5 palabras y signos pegados (separaciones 0,2 a 0,44); hacia la derecha hay un hueco de 12,9 | **Riesgo**: `header.material` puede capturar palabras de más. Eso no se puede saber sin mirar el PDF (P-R4) |
| Tabla del resumen | Rótulos `Cant.`, `Longitud`, `Anchura`, `Σ Areas`, `Σ Partes`; `Configuraciones`, `Estadísticas` | Se encuentran todos | OK |
| Encabezado de hoja | `SHEET`, `MATERIAL`, `BOARD_SIZE` y `/^Tablero/` en segmentos separados | **Un solo renglón** en las 4 páginas: `<palabra> <n> mm <signo> <n> mm x <n> mm <signo> Tablero estándar`, después un hueco de unos 19 y `i / N`. Separaciones: palabra → número 1,2 a 1,4; dentro de cada campo 0,25 a 0,62; signo → número 2,2 a 2,4; signo → "Tablero" 0,8 a 1,0. **No llega ningún `/` suelto** en las páginas 2 a 5 | `SHEET` se encuentra. `MATERIAL` no (falta `/`). `BOARD_SIZE` y `Tablero` no: la medida queda pegada a "<signo> Tablero estándar" |
| Página 4 | — | En el hueco signo → número (2,2 a 2,4 en las otras páginas) llega una **letra suelta**, con separaciones 1,37 y 0,50. Todo el renglón queda unido | Con cualquier regla, la medida de esa hoja queda sin límite claro (§4) |
| Encabezado de tabla | `Finales`, `Ajustadas`, `No.`, `Cant.`, `Tiras de cantos`, `L`, `A` | Están en las páginas 2 y 4. En las 3 y 5 faltan, como ya decía §8.2 ("la continuación no repite el encabezado de la tabla") | OK |
| Pie | `PIECE_COUNT` = `^\d+\s*piezas?$` sobre el segmento | Páginas 3 y 5 (solo en la última de cada hoja, como dice INV-15). **Un solo renglón**: `La fibra sigue la longitud <signo> <n> piezas`, un hueco de 12 a 14 y `Longitud de cortes : <dec> <letra> <signo> Eficiencia : <dec> %`. Separaciones internas de 0,0 a 0,73 | `PIECE_COUNT` no se encuentra (rechazo `hoja-incompleta`). `Longitud de cortes` y `Eficiencia` quedarían en `pending` (seguro) |

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

1. La separación de 1,37 de la p. 2 está entre el material y su espesor, **no** junto a la medida del tablero. La medida no se encuentra porque queda pegada a "<signo> Tablero estándar" (0,50 y 1,00).
2. En el segmento de la unidad, lo que había reportado como "mm" es una palabra de dos letras (posiblemente el marcador horario), no "mm".
3. Las páginas 3 y 5 tienen el mismo renglón de encabezado de hoja que las 2 y 4, con la misma estructura de palabras. **Verificado por el equipo en el PDF (10/11):** las cuatro páginas de hoja, incluidas las de continuación, traen la banda de título (material, espesor, medida, "Tablero estándar") y el contador `i / N`.

### 2.4 Verificación del equipo en el PDF (10/11, Santiago Borda)

| Hecho | Consecuencia |
|---|---|
| 5 páginas: resumen y 2 tableros (páginas 2-3 y 4-5) | Coincide con spec-esquema §2 |
| La banda de título y `i / N` están en las páginas 2 a 5, también en las de continuación | INV-15 (b) se mantiene tal cual. P-R1 cerrada |
| El `/` entre material y espesor **es parte del título**; el contador tiene otro `/` | El OCR **perdió** ese `/` en las 4 páginas (llega un hueco de 1,2 a 1,4 en su lugar). No es otro formato: "Textos esperados" de §8.2 no cambia. P-R2 cerrada |
| El pie con la cantidad de piezas aparece solo en la última página de cada tablero (3 y 5) | Coincide con INV-15 y con lo observado |
| El código viene partido en dos renglones y, en algunas filas, con un ícono en el medio | Coincide con spec-esquema §7.1 y H-02. **No está verificado cómo lo devuelve Vision** (la corrida no llegó a las filas): riesgo RL-1 (§4.3) |

## 3. Opciones para §8.2: cómo localizar datos que comparten renglón

### Opción A — Patrones sobre la secuencia de palabras, con límites de campo

El parser deja de exigir que el segmento entero cumpla la regla. Busca la regla como **secuencia contigua de palabras dentro del renglón**, siempre que esté **delimitada**. Un límite puede ser:
- el inicio o el fin del renglón;
- un hueco mayor que `joinGapRatio`;
- una palabra **separadora**: un signo de un solo carácter, sin letras ni dígitos, que el patrón no consume.

- **Ventajas:** no depende de umbrales nuevos y funciona igual con capa de texto y con OCR. Cada dato sale de su propio patrón con sus límites, así que un dato pegado a otro no lo contamina. Es determinista y explicable: se puede decir qué patrón y qué límites encontró.
- **Riesgos:**
  - Límite izquierdo del material: un nombre de varias palabras no tiene marca propia de inicio. Se mitiga con R-6 y R-7.
  - Un separador perdido o leído como letra deja el dato sin límite, como en la p. 4. El resultado es `pending` o rechazo, que es lo seguro, pero baja la tasa de lectura.
  - Un patrón como "<n> mm" aparece cientos de veces en la tabla y el diagrama. Se mitiga con R-2 (zonas).
  - Hay que definir el conjunto de separadores (P-R3).

### Opción B — Cortar segmentos en los separadores y mantener la regla de segmento entero

Antes de evaluar las reglas, en los renglones de encabezado, resumen y pie se corta el segmento en cada signo separador. Las reglas actuales (`^…$`) siguen iguales.

- **Ventajas:** es el cambio mínimo y las reglas quedan como están.
- **Riesgos:**
  - **No resuelve la unidad.** Entre la hora y la unidad hay un signo, pero entre el marcador horario y la fecha no. La fecha se arreglaría solo si se corta también por la unidad.
  - Los signos que son parte del dato (`/` del título, `-` del código, `~` del canto, `.` de `Cant.`) obligan a una lista de signos permitidos por zona.
  - Una lista de glifos observada en un solo PDF es el caso típico de sobreajuste.

### Opción C — Umbral de unión que no dependa solo de la altura

Por ejemplo, un hueco relativo a la mediana de los huecos del renglón, o al ancho de un carácter estimado.

- **Ventajas:** no toca las reglas de texto.
- **Riesgos:** los datos de §2.2 la desaconsejan: los huecos entre campos y dentro de campos se solapan. Cualquier valor saldría de este único PDF (sobreajuste) y rompería el sintético o el real. Además agrega un valor que habría que calibrar sin datos suficientes.

### Recomendación: A, tomando de B solo la noción de "separador" como límite

Se recomienda A porque es la única de las tres que no depende de un número calibrado con un PDF. Lo que no delimita con certeza va a `pending` o a rechazo. No cambia ningún valor de `OCR_LAYOUT`. **La decisión queda abierta.**

## 4. Reglas propuestas (si se elige A)

Todas aplican a `TextoPdf` y a `OcrLlm` (un solo parser). Con la entrada sintética de hoy (TP-50, TS-04), el resultado tiene que ser igual byte a byte.

| Id | Regla |
|---|---|
| R-1 | **Patrón delimitado.** Un dato se encuentra si una secuencia contigua de palabras del renglón cumple su patrón y tiene un límite (§3, A) a cada lado. Una regla de hoy que se cumple sobre el segmento entero también se cumple acá (sin regresión) |
| R-2 | **Zonas.** Unidad, fecha y título: solo en la página 1, en los renglones de arriba de la tabla del resumen. Medida, tipo y material de hoja: solo en el renglón que contiene `i / N`. Pie: solo en los renglones que empiezan con un rótulo de `FOOTER_LINE` o lo contienen. Fuera de su zona, un patrón no cuenta |
| R-3 | **Unicidad.** Si un patrón se cumple más de una vez en su zona con valores distintos, el dato no se lee: va a `pending`, o es rechazo si el campo no admite `pending`. Nunca se elige uno |
| R-4 | **Unidad.** Una palabra (o grupo de palabras pegadas por `glueGapRatio`) que cumple `MILLIMETER` entera, en su zona. `OTHER_UNIT` se evalúa igual y primero (`unidad-no-soportada` se conserva) |
| R-5 | **Fecha.** `dd/dd/dddd` + hora, más como mucho un marcador horario si P-R6 lo confirma, delimitados. Si después de la hora sigue algo que no es límite, `generatedAt` va a `pending`. **Nunca incluye la unidad** |
| R-6 | **Material de hoja.** Las palabras desde un límite hasta `<n> mm`, con o sin `/` según la variante elegida en §4.1 |
| R-7 | **Título del resumen.** El material se toma de la secuencia entre el límite más cercano a la izquierda y el `/`. Si a la izquierda no hay un límite que lo cierre (como en la corrida 1), el valor solo se acepta si es **exactamente igual** al material de una fila de la tabla del resumen; si no, rechazo (`header.material` no admite `null`). Pendiente de P-R4 |
| R-8 | **Medida y tipo de tablero.** `<n> mm x <n> mm` delimitado; `Tablero` más las palabras que siguen hasta un límite. Una medida sin límite a la izquierda (p. 4) no se lee y la regla de l. 585 sigue rechazando. **No** se acepta que un número "se delimita solo": un número partido por el OCR daría un valor falso sin aviso (TP-100) |
| R-9 | **Pie.** `<n> piezas` delimitado (la fibra y el separador lo preceden). `Longitud de cortes` y `Eficiencia`: el valor es lo que sigue al rótulo y al `:` opcional, hasta un límite. Si no es un número, `pending` (como hoy) |
| R-10 | **Separadores.** El conjunto es **PROVISORIO, a calibrar**: hoy, cualquier palabra de un carácter sin letras ni dígitos que el patrón no consume. Si P-R3 identifica los glifos, se puede restringir. No se agrega ningún número nuevo |

### 4.1 Tolerancia a la pérdida del `/` en el material de hoja

| Variante | Regla | Riesgo |
|---|---|---|
| /-a | Exige `/` (como hoy) | Con esta corrida, toda hoja da `hoja-incompleta` |
| /-b (**recomendada**) | Sin `/`, `<material> <n> mm` se acepta **solo** si material y espesor son exactamente iguales a los de `header` (página 1). Distinto o ausente: `hoja-incompleta` | Depende de que el resumen se lea bien (R-7). Si el resumen falla, falla todo, que es lo seguro |
| /-c | Sin `/`, se acepta siempre | Límite izquierdo incierto; un material mal leído entraría a INV-10 sin aviso. No se recomienda |

P-R2 está cerrada (§2.4): el `/` está en el PDF y el OCR lo pierde. /-b es una tolerancia a un **error de lectura**, no a otro formato. Por eso solo acepta el valor cuando lo respalda otra parte del mismo documento (el título del resumen), y nunca lo toma por sí solo. Que el OCR pierda el `/` en las 4 páginas de este PDF no quiere decir que lo pierda siempre: /-b tiene que seguir aceptando el título con `/` (TP-101).

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

- **Propuesta:** no cambiar reglas del código en esta revisión. Agregar una prueba sintética (TP-107) y medir RL-1 en la corrida de desarrollo, contando las filas con `formato-invalido` o con el código en `pending`. Solo se cuentan, no se imprimen códigos.
- Si la corrida muestra que el ícono llega como un carácter que forma un código válido, hace falta otra spec: este borrador no lo resuelve.

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

Convención del repo: TP- para el plan del esquema (siguen a TP-94) y OR- para SPEC-B2 (siguen a OR-16).

| Id | Criterio | Caso (sintético) | Esperado |
|---|---|---|---|
| TP-95 | CA-1, CA-3; R-4, R-5 | Renglón del resumen: título, hueco grande, fecha, hora, marcador, signo, unidad; separaciones de 0,1 a 0,7 × alto | Unidad leída; `generatedAt` sin la unidad (o `pending`) |
| TP-96 | R-4 | Igual que TP-95, con otra unidad en lugar de milímetros | `unidad-no-soportada` |
| TP-97 | R-4 | Sin unidad | `estructura-no-reconocida`; regla `resumen-sin-unidad` (§6) |
| TP-98 | CA-3; R-6, R-8 | Encabezado de hoja en un renglón: `<material> <e> mm <signo> <L> mm x <A> mm <signo> Tablero estándar`, hueco, `i / N`, con las separaciones de §2.1 | Medida, tipo, material y espesor leídos (con /-b) |
| TP-99 | CA-4; R-8 | TP-98 con el separador previo a la medida reemplazado por una letra suelta (caso p. 4) | Medida sin leer; rechazo en la primera página de la hoja; ningún valor de medida |
| TP-100 | CA-4; R-8 | Número de la medida partido en dos palabras con separación de 0,5 | No se lee el número parcial; `pending` o rechazo |
| TP-101 | R-6, §4.1 | Material de hoja sin `/`: igual al resumen; distinto; con `/` | Leído; `hoja-incompleta`; leído (sin regresión) |
| TP-102 | CA-3; R-9 | Pie en un renglón: fibra + signo + `<n> piezas`, hueco, longitud de cortes + signo + eficiencia | `pieceCount` leído; longitud y eficiencia leídas o en `pending`; nunca otro valor |
| TP-103 | CA-4; R-3 | Dos medidas distintas en el renglón de `i / N` | No se elige; rechazo |
| TP-104 | CA-1; R-7 | Título con palabras pegadas a la izquierda: (a) el final coincide con una fila de la tabla; (b) no coincide | (a) material de la fila; (b) rechazo; nunca un material con palabras de más |
| TP-105 | R-2 | `<n> mm x <n> mm` en una celda de la tabla o en el diagrama | No cuenta como medida del tablero |
| TP-106 | CA-2 | TP-50, TS-04 y el replay sintético de Vision con el parser nuevo | Idénticos a hoy |
| TP-107 | CA-1, CA-4; RL-1 (§4.3) | Código `9999-` en dos renglones de palabras de OCR, con una palabra suelta en el medio: (a) un signo; (b) una letra; (c) un dígito que deja el formato inválido | (a) código leído; (b) y (c) `formato-invalido` o `pending`; nunca otro código válido sin razón |
| OR-17 | CA-7 | Lectura rechazada cuyo `detail` contiene texto del documento (por ejemplo `unidad-no-soportada`, que hoy cita el segmento) | Consola: `regla:` y `página:` con valores del catálogo; el texto no aparece |
| OR-18 | §6 | Cada sitio de rechazo del parser (hoy 21) | Tiene un id de regla del catálogo cerrado; ningún id repetido entre sitios con distinto significado |

### 5.3 Fixture con la geometría observada

- Elementos armados **en memoria**, como las variantes V1 a V7 de spec-fixture-sintetico §8. Por ejemplo `tests/helpers/ocrRealLike.ts`, sin PDF nuevo.
- Reproduce solo la **estructura** de §2.1: palabras sueltas, renglón corrido, separaciones en los rangos medidos, signos entre campos y la variante de la letra suelta.
- Datos ficticios: código `9999-`, material inventado ("Gris Sintético"), medidas que no repiten ninguna real (la comprobación de TS-12 se extiende a este helper: TS-12b).
- El glifo separador real no se conoce (P-R3): las pruebas usan `-` y otro signo de un carácter, sin copiar el del PDF.
- Nada de `.ocr-data/` se copia a `tests/`. La respuesta real no se usa como replay en la suite (sigue vigente spec-fixture-sintetico D2).

## 6. SPEC-B2: diagnóstico del rechazo y valor de la corrida

**`docs/spec-ocr-prueba-real.md` tiene cambios sin commitear: este borrador no lo edita.** Las enmiendas quedan acá, para aplicarlas cuando se aprueben.

### 6.1 Qué imprime el script cuando el parser rechaza

Hoy imprime `lectura: rechazado (<razón>)`. El `detail` no se puede imprimir: algunos citan texto del documento (l. 182 cita el segmento de la unidad; l. 369 cita números de hoja).

| Opción | Cómo | Ventajas | Riesgos |
|---|---|---|---|
| D-a (**recomendada**) | El rechazo lleva `rule` (id de un catálogo cerrado, uno por sitio de rechazo) y `page` (número o `null`). El script imprime `regla: <id>` y `página: <n>` | Estable, verificable (OR-18), sin texto del documento | Cambia el tipo `PdfReading` (C2) |
| D-b | El script deduce la regla comparando el `detail` con una tabla de plantillas | No cambia el contrato | Frágil: cambiar un mensaje rompe el diagnóstico en silencio. El script tendría que leer el `detail`, que hoy no toca |

Plantilla propuesta para §7 de SPEC-B2, a agregar debajo de `lectura:` solo si hay rechazo:

```
regla: <id del catálogo>
página: <n> | -
```

Catálogo inicial: un id por sitio de `ReadFailure` (por ejemplo `resumen-sin-unidad`, `resumen-sin-titulo-o-tabla`, `hoja-sin-material`, `hoja-sin-encabezado-completo`, `hoja-sin-pie`). Se fija en la implementación, con OR-18.

### 6.2 ¿Una corrida rechazada cuenta como resultado válido?

Propuesta: **se separan dos resultados**.

| Resultado | Corrida 1 (10/11) | Para qué sirve |
|---|---|---|
| Camino PDF → Vision → `PdfTextInput` | Válido: 5 páginas, 1190 palabras, conversión sin error | Dato para P-02. Lo cierra el equipo (spec-extraccion §15) |
| Lectura (`parseOcrWords`) | Rechazada: **no es una medición** | No hay filas, así que `distintos-sin-pending` no está definido. **Un rechazo no equivale a `distintos-sin-pending = 0`** |

- SPEC-B2 §4 (paso 8) y §14 ya dicen que el rechazo "es un resultado, no un fallo del script": se mantiene.
- Se propone agregar a SPEC-B2 un **registro de corridas** (como §12): fecha, quién, resultado del camino, resultado de la lectura, regla y página. Sin hash ni contenido.
- Volver a leer la respuesta guardada con el parser nuevo (sin `--reenviar`, sin red) es la **corrida de desarrollo**. No valida nada (§7).

## 7. Riesgo de sobreajuste: validación con otro PDF

El ajuste se basa en **un** PDF. Protocolo propuesto, sin ampliar el alcance de este borrador:

1. **Desarrollo:** solo la respuesta guardada de Cedro 18 y los fixtures sintéticos. Las reglas de §4 salen de la estructura, no de valores medidos; si alguna necesita un número, va como PROVISORIO, a calibrar.
2. **Congelar:** antes de mirar otro PDF, las reglas quedan en un commit, con su versión en `readerVersion` (por ejemplo, `vision-files-annotate/real` + versión del parser).
3. **Validación 1, Blanco 18 del segundo fixture:** una corrida, sin cambiar nada después de verla. Necesita una enmienda D a SPEC-B2: reemplazar el hash de la lista blanca (sigue habiendo una sola entrada) y agregar ese PDF al alcance. La autorización de Casa Mueble ya lo cubre; P-04 sigue sin archivar. Aceptación: con transcripción, `distintos-sin-pending = 0`. Un rechazo con regla es un resultado aceptable pero quiere decir "no generaliza", no "pasa".
4. **Si hay que cambiar reglas después de la validación 1,** esa corrida pasa a ser de desarrollo y la siguiente validación es el **primer fixture** (variante corta, otra cantidad de páginas, transcripción ya versionada en `tests/fixtures/pdf/olmo.json`). Necesita su propia enmienda.
5. **Señales de sobreajuste, a revisar en la aprobación:** una regla que menciona un glifo visto una sola vez; un número ajustado a los huecos de §2; una regla que solo se cumple en la página 4.

## 8. Preguntas abiertas (las verifica el equipo en el PDF; no se suponen)

| Id | Pregunta | Por qué importa |
|---|---|---|
| P-R1 | ¿Las páginas de continuación (3 y 5) repiten el título de material de la hoja? | **Cerrada (10/11): sí** (§2.4) |
| P-R2 | En el encabezado de hoja, ¿hay un `/` entre el material y el espesor? | **Cerrada (10/11): sí, el OCR lo pierde** (§2.4, §4.1) |
| P-R3 | ¿Qué signos separan los campos del encabezado de hoja, del renglón de fecha y unidad, y del pie? El OCR devolvió `-` en la hoja y otro signo de un carácter en el resumen y el pie (no se imprimió) | R-10 |
| P-R4 | En el título del resumen, ¿las palabras a la izquierda de "<material> / <e> mm" son parte del título o es otro texto? | R-7; posible error latente en `header.material` |
| P-R5 | En la página 4, ¿qué hay donde el OCR devolvió una letra suelta antes de la medida del tablero? | TP-99; saber si es un error del OCR o un carácter del PDF |
| P-R6 | ¿El marcador de dos letras después de la hora (am/pm) es parte de la fecha? El ejemplo de §4 ("5:47pm") sugiere que sí | R-5 |
| P-R7 | ¿Pasa lo mismo en el Blanco 18 y en el primer fixture? | Se responde recién en la validación (§7), no antes |

## 9. Qué necesita aprobación

1. Las enmiendas C1 (spec-extraccion §5 paso 3) y C2 (tipo `PdfReading`), o descartarlas, en cuyo caso cae la opción D-a.
2. La opción para §8.2: A (recomendada), B o C.
3. Si se elige A: las reglas R-1 a R-10, y la variante de §4.1 (/-b recomendada; P-R2 ya cerrada).
4. Los criterios CA-1 a CA-7 y las pruebas TP-95 a TP-107 y OR-17 y OR-18. El fixture en memoria de §5.3 y TS-12b. Para RL-1 (§4.3): no cambiar reglas del código ahora, solo TP-107 y el conteo en la corrida de desarrollo.
5. SPEC-B2: el diagnóstico D-a o D-b, la plantilla de consola y el registro de corridas (§6), para aplicar en `spec-ocr-prueba-real.md` **después** de que commitees tus cambios.
6. Que la corrida 1 cuente como dato para P-02 y **no** como medición de lectura (§6.2).
7. El protocolo de §7 y si se tramita la enmienda D a SPEC-B2 (Blanco 18) ahora o después de implementar.
8. Las respuestas a P-R3 a P-R6 (P-R1 y P-R2 ya están cerradas), antes de fijar R-5, R-7 y R-10.
