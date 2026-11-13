# Paquete de aprobación: lectura por OCR de un PDF real (revisión tras la primera corrida)

| Campo | Valor |
|---|---|
| Para | El equipo y el profesor |
| Pide | Aprobar (o rechazar) cada ítem de §3. Santiago Borda ya aprobó o eligió lo que se indica; falta el equipo y el profesor |
| Fecha | 10/11/2026 |
| Estado | **Aprobado el 11/11/2026** (ítems 1 a 14, incluida la enmienda D con E-1 y E-2), por el equipo y el profesor, informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar. Implementación en la rama `ocr-revision-real` (ver `CLAUDE.md`) |
| Regla de datos | No contiene texto, códigos, medidas ni hashes del PDF real. Solo estructura: conteos, clases de carácter y nombres de reglas |

## 1. De dónde viene

La primera corrida de `npm run ocr:real` con un PDF real del segundo fixture (Cedro 18 mm, 5 páginas) fue **rechazada** por el parser. Desde entonces hubo dos corridas más y un diagnóstico local sobre la respuesta guardada, sin red:

- **Corrida 1:** `estructura-no-reconocida`; la unidad llegaba pegada a la fecha y a la hora.
- **Corrida 2** (con las reglas R-1 a R-10 ya implementadas): `resumen-tabla-vacia`, página 1. La fila de la tabla del Resumen trae una cola de texto y el encabezado una columna que el esquema no usa.
- **Diagnóstico por adelantado** (copia local del parser, sin versionar, que anota cada rechazo en vez de abortar): con el Resumen leído, quedan problemas en las filas de las hojas (el código, las letras de la columna "No.", la letra suelta de la banda de la página 4).

Cada ítem de §3 corresponde a uno de esos hallazgos. Ninguno es una medición de la calidad del OCR: es un solo PDF.

**Lo que ya está aprobado y no se pide de nuevo:** las reglas R-1 a R-10, la variante /-b y el diagnóstico D-a (aprobados por el equipo y el profesor con `spec-revision-ocr-real.md` v0.2, informado por Santiago el 10/11/2026). Están **implementados** en la rama `ocr-revision-real` (PR #11, sin merge). **Ninguna de las reglas R-11 a R-14 está implementada.**

## 2. Documentos y versiones

| Documento | Versión | Estado |
|---|---|---|
| `docs/spec-revision-ocr-real.md` | **0.8 aprobada** (0.2 aprobada el 10/11; el resto, el 11/11) | Define R-11 a R-14, C4 a C7, el lookahead y las pruebas TP-108 a TP-133 |
| `docs/spec-esquema-pdf.md` | Sin número: aprobada el 3/11; §8 y §8.2 revisadas el 10/11 con la v0.2 de la revisión; **aprobada el 11/11** con R-11 a R-14 en §8.2 y la aclaración de R-7 | Modificada, aprobada |
| `docs/spec-extraccion-pdf.md` | **0.3.3 aprobada** (0.3.2 aprobada el 10/11 con C1 y C2) | Modificada, aprobada (§3 H-02, §5.1) |
| `docs/spec-ocr-prueba-real.md` (SPEC-B2) | **0.4** (aprobada) | Modificada por la enmienda D (ítem 14), aprobada |
| `docs/spec-ocr-prueba-real-enmienda-d.md` | **0.2 aprobada** | Aprobada con E-1 y E-2 |
| `docs/test-plan-esquema-pdf.md` | Sin número: 3/11; TP-95 a TP-107 aprobados con la v0.2; **aprobado el 11/11** con TP-99 actualizada, TP-108 a TP-133 y la línea base nueva de TP-106 | Modificado, aprobado |

## 3. Lista de lo pendiente

Leyenda de la columna **Santiago**: "aprobó" o "eligió" = decisión suya del 10/11/2026; "a informar" = decisión suya que el equipo todavía no recibió formalmente; "—" = nada. **Contrato aprobado** = si cambia un texto, un tipo o un catálogo ya aprobados.

| # | Ítem | Santiago | Spec que modifica | ¿Toca un contrato aprobado? | Prueba que lo cubre |
|---|---|---|---|---|---|
| 1 | **C1** Un solo parser para texto y OCR | — (aprobada en v0.2) | spec-extraccion §1 y §5 (paso 3); spec-esquema §8.2 | **Sí:** "sin cambios" de spec-extraccion §5, paso 3 | TP-106 (salidas idénticas), TS-04, TS-05 |
| 2 | **C2** `rule` y `page` en el rechazo | — (aprobada en v0.2) | spec-esquema §8; spec-extraccion §13; SPEC-B2 §7 | **Sí:** el tipo `PdfReading` | OR-17, OR-18 |
| 3 | **C3** Validación con un segundo PDF (protocolo) | — (protocolo aprobado en v0.2) | SPEC-B2 §1 (vía la enmienda D, ítem 14) | **Sí:** "un único PDF real" | OR-19 a OR-21 (propuestas) |
| 4 | **C4 + R-11** Fila de la tabla del Resumen | aprobó | spec-esquema §8.2; spec-revision §4.4 | **Sí:** "Textos esperados" de §8.2; catálogo de rechazos (+2 ids) | TP-108 a TP-116, CA-8 |
| 5 | **R-12** Código partido: guion e ícono | aprobó | spec-esquema §8.2 ("Designación e íconos"); spec-revision §4.5 | **Sí:** "Designación e íconos" de §8.2 | TP-117 a TP-122; TP-107 y TP-106 (línea base nueva) |
| 6 | **R-13** Anclas de la columna "No." | aprobó | spec-esquema §8.2 ("Filas"); spec-revision §4.6 | **Sí:** "Filas" de §8.2 | TP-123 a TP-127, CA-9 |
| 7 | **C6 + excepción a H-02** `.letter` sí, `.code` no | aprobó | spec-extraccion §3 (H-02) y §5.1; spec-esquema §8.2 (R-13) | **Sí:** H-02 y la fila `.code`, `.name`, `.letter` | TP-123, TP-124 (letra); TP-118 y TP-122 (el código y los guiones no cambian) |
| 8 | **R-14 + C7** Pictograma antes de la medida de la banda (opción C de P-R5) | eligió | spec-esquema §8.2 (R-8); spec-revision §4.7 | **Sí:** R-8 aprobada; catálogo de rechazos (+1 id) | TP-99 (actualizada), TP-128 a TP-133, CA-10 |
| 9 | **R-7, aclaración de texto** | a informar | spec-esquema §8.2 (R-7); spec-revision §4 (R-7) | **Sí:** el texto de R-7 | TP-104 (a), (b), (c) |
| 10 | **Decisiones de la v0.3** P-R4 y N-1 | a informar | spec-esquema §8.2 (R-5, R-7) | **Sí:** R-5 (fecha) y R-7 (título) | TP-95, TP-104 |
| 11 | **Límite conocido:** el paso de los cantos no tiene piso | aprobó el riesgo | spec-esquema §8.2 (marcas de canto); spec-revision §2.5 | No (documenta un límite) | TP-90 y TP-127 (el límite es seguro: `pending`) |
| 12 | **H-E:** gemelas cirílicas en el diagrama quedan como razón de fila | aprobó | spec-revision §2.5 | No | Sin prueba nueva (hoy da `diagrama-no-coincide`) |
| 13 | **Línea base nueva de TP-106** | aprobó (O-R12-2) | test-plan-esquema-pdf (TP-106) | No | TP-106 |
| 14 | **Enmienda D** Segundo PDF real (Blanco 18) | recomienda E-1a y E-2 | SPEC-B2 §1, §2, §5, §6, §12, §12b y §14 | **Sí:** "un único PDF real" (§1) y el orden de la compuerta | OR-19, OR-20, OR-21; cambian OR-06 y OR-07 |

## 4. Detalle de cada ítem

### 1. C1: un solo parser para texto y OCR (aprobada en v0.2; evidencia por archivar)
- **Qué cambia:** spec-extraccion §5, paso 3, decía que las palabras del OCR alimentan el parser "sin cambios". Pasa a decir que alimentan **el mismo parser** que el texto, con las reglas de spec-esquema §8.2 ("Datos que comparten renglón"). Sigue habiendo un solo parser.
- **Estado:** implementada en PR #11. Pide ratificar con la evidencia archivada.

### 2. C2: `rule` y `page` en el rechazo (aprobada en v0.2; evidencia por archivar)
- **Qué cambia:** el rechazo de una lectura suma `rule` (el id de un **catálogo cerrado**, uno por sitio de rechazo) y `page` (número o `null`). Ningún texto del documento. La consola del script imprime `regla:` y `página:`, y nunca el `detalle`.
- **Estado:** implementada en PR #11, con 27 ids. R-11 y R-14 suman 3 ids (30).

### 3. C3: segundo PDF real (protocolo aprobado en v0.2)
- **Qué cambia:** el protocolo de validación con otro PDF se aprobó. Su efecto sobre SPEC-B2 ("un único PDF real") está en la enmienda D (ítem 14), que no está aprobada.

### 4. C4 + R-11: fila de la tabla del Resumen (Santiago aprobó, con O-R11-1 a O-R11-4)
- **Qué cambia:** hoy una fila del Resumen se lee solo si su primer segmento es **exactamente** `<material> / <n> mm`. En el PDF real trae una cola `- <tipo>`, y toda la tabla se pierde. R-11:
  - el material es un patrón delimitado `<material> / <n> mm`; la cola `- <tipo>` no entra y el tipo se descarta;
  - cada celda se asigna a una columna **solo si el rótulo más cercano del encabezado es una ancla conocida** (`Cant.`, `Longitud`, `Anchura`, `Σ Areas`, `Σ Partes`); `Σ Costos` es una columna conocida e ignorada a propósito, y un rótulo desconocido tampoco asigna;
  - **sin reemplazo silencioso:** dos celdas en una ancla, o una que no cumple el formato de su columna, no se leen: **rechazo** en las columnas obligatorias (`count`, `lengthMm`, `widthMm`, `parts`) y `pending` en `Σ Areas`, que admite `null`;
  - el material dos veces en una fila: rechazo, aunque las dos sean iguales;
  - las filas se leen hasta la primera línea sin material.
- **Salvedad aprobada por Santiago:** la cola descartada no se valida.
- **No relaja `dudosa` ni `pending`:** es más estricta que hoy en las celdas. Verificación regla por regla en spec-revision §4.0.
- **Catálogo:** `resumen-celda-duplicada` y `resumen-fila-ambigua`.

### 5. R-12: código partido (Santiago aprobó, con O-R12-1 y O-R12-2)
- **Qué cambia:** el guion del código llega como palabra aparte (`M01 - C04`) y spec-esquema §8.2 descarta toda palabra sin letras ni dígitos: con eso **0 de 23** códigos reales cumplen el formato. R-12:
  - se conserva la palabra `-` (U+002D); **no** se convierte ningún otro guion;
  - si un ícono (signo, braille en blanco o carácter de uso privado) queda **entre dos palabras del código en un mismo renglón**, el código queda en `pending`; un ícono al final de un renglón se descarta y el código se lee (como en el texto y en TP-107 a);
  - un ícono leído como letra o dígito rompe el formato y queda en `pending`, como hoy.
- **Efecto medido en el PDF real:** de 0 de 23 códigos a 17 de 23 con R-12 sola, y a 18 de las 23 filas reales con R-12 y R-13 (ver spec-revision §4.5 y §2.5). Ningún ícono cayó entre palabras del mismo renglón: la parte b de R-12 no cambia el resultado en este PDF.
- **No relaja `dudosa` ni `pending`:** un código solo se escribe si cumple el formato exacto. En el replay sintético, 4 códigos pasan de `pending` a leídos y los 4 son iguales al esperado; ninguno sale válido y distinto.

### 6. R-13: anclas de la columna "No." (Santiago aprobó, con O-R13-1 y O-R13-2; O-R13-3 no se adopta)
- **Qué cambia:** una letra de fila llega en cirílico y la fila se funde con la anterior (se pierden cantidad, L y A); otra llega duplicada y abre una fila vacía. R-13:
  - normalización cerrada de **11 mayúsculas cirílicas** idénticas a una latina (А В Е К М Н О Р С Т Х); la letra queda en latín;
  - dos anclas superpuestas se funden en una sola fila **solo si son iguales** después de normalizar; si difieren, no se funden (la fila vacía queda con sus campos en `pending`).
- **Efecto medido:** la hoja 2/2 pasa de 11 a 12 filas y Σ cantidad de 20 a 25 (el pie dice 25); además se resuelve H-C (los cantos de la hoja 2/2).
- **No relaja `dudosa` ni `pending`:** la letra normalizada se escribe sin `pending` (INV-0 no admite `pending` con valor); la salvedad está en spec-revision §4.0 y la justificación en el ítem 7.

### 7. C6 + excepción a H-02 (Santiago aprobó)
- **Qué cambia:** H-02 y la fila `.code`, `.name`, `.letter` de spec-extraccion §5.1 dicen que no se autocorrige un código ni una letra. R-13 corrige un carácter de la **letra de fila**. Queda escrito, en spec-extraccion v0.3.3 (borrador), que **`.letter` admite la normalización y `.code` no**.
- **Por qué es una excepción justificada (cuatro razones juntas):**
  1. **tabla cerrada**: 11 pares, una sola latina por gemela, sin heurística;
  2. **la letra de fila es una etiqueta local**, no una clave: se repite entre tableros y la clave de la fila es el código;
  3. **está cruzada**: INV-3 (diagrama), INV-5 (unicidad por tablero) e INV-6 (letra y código estables en el PDF) la verifican y la fila sigue `dudosa`;
  4. **no corregirla cuesta más**: fusiona dos filas y, por H-C, pierde los cantos de toda la hoja.
- **Diferencia con R-12:** R-12 no convierte otros guiones porque tocaría el **código**; el conjunto de guiones Unicode es abierto, no hay tabla aprobada y un error viajaría a la clave del cruce con el .dae. En el PDF real no apareció ningún otro guion Unicode.

### 8. R-14 + C7: pictograma antes de la medida (Santiago eligió la opción C de P-R5)
- **Qué cambia:** P-R5 quedó **cerrada**: entre el `-` que sigue al espesor y la medida de la banda hay un pictograma (ícono de tablero), presente en las cuatro páginas; en la página 4 Vision lo leyó como una letra minúscula suelta, y R-8 rechaza (la medida no tiene límite a la izquierda). R-14:
  - se ignora **una** palabra de un carácter que no es dígito ni separador, entre un separador y el primer número de la medida;
  - la medida se acepta **solo si es exactamente igual** a la de la **única fila del Resumen** con el mismo material y espesor (el patrón de /-b); si no, rechazo `hoja-medida-sin-respaldo`;
  - con un dígito suelto o con dos palabras sueltas no hay tolerancia (rige R-8); si R-8 ya lee la medida, no se compara con el Resumen.
- **No relaja `dudosa` ni `pending` (verificado con la copia local del parser, no con la implementación):** 24 de 24 filas `dudosa`; el resto del documento es idéntico con y sin R-14; una medida distinta, un dígito suelto y dos palabras sueltas rechazan.
- **Opciones descartadas:** A (tolerar sin respaldo) y B (usar la medida del Resumen sin comparar).
- **Cambia TP-99:** hoy espera rechazo; pasa a esperar la medida leída. El rechazo pasa a TP-129 y TP-130. TP-100 se mantiene.
- **Catálogo:** `hoja-medida-sin-respaldo`. Es la contradicción **C7** con R-8.

### 9. R-7, aclaración de texto (decisión de Santiago, a informar)
- **Qué cambia:** el texto de R-7 y R-1 se contradecían: el inicio de renglón es un límite según R-1, pero TP-104 (b) y (c) exigen rechazo sin separador. Decisión: **solo un separador** inmediatamente a la izquierda cierra el material; con inicio de renglón o un hueco, el material solo se acepta si un final de la secuencia es **exactamente igual** al material de una fila de la tabla del Resumen. Está **implementada** en PR #11; **falta reflejarla en el texto** de R-7.

### 10. Decisiones de la v0.3 (a informar)
- **P-R4:** el material del título es solo la palabra pegada al `/`; "Diagrama de corte `|`" es el título del documento.
- **N-1:** `generatedAt` se compara ignorando espacios (el OCR separa la hora de "am"/"pm"); si no se interpreta, queda `pending`.

### 11. Límite conocido: el paso de los cantos no tiene piso (Santiago aceptó el riesgo)
- El paso entre subcolumnas de canto es la menor distancia entre marcas de una fila de toda la hoja, con tope y **sin piso**. Si dos marcas de una fila caen casi en la misma posición, el paso se degrada y toda esa hoja queda con `pending` en `edges`. Es seguro, pero pierde las marcas de la hoja entera. **No se propone ningún umbral.** Se revisa al validar con otro PDF.

### 12. H-E: gemelas cirílicas en el diagrama (Santiago aprobó)
- Hay 2 en la página 4. El diagrama solo cuenta letras `A-Z`, y aparece `diagrama-no-coincide`, razón de fila (seguro). R-13 **no** se extiende al diagrama.

### 13. Línea base nueva de TP-106 (Santiago aprobó O-R12-2)
- 12 de las 14 entradas con lectura ok no cambian. Cambia el replay sintético S1 (3 códigos pasan de `pending` a leídos e iguales al esperado; `pending` baja de 31 a 28) y S3 (1 código; de 5 a 4). S2 sigue rechazando en la misma regla y página. Los sha256 nuevos de S1 y S3 se fijan al implementar.

### 14. Enmienda D: segundo PDF real (borrador v0.1, sin aprobar)
- **Qué cambia en SPEC-B2:** admite un **segundo** PDF real (el Blanco 18 del segundo fixture); la lista blanca sigue con **una sola entrada** y se reemplaza el hash a mano antes de cada corrida (D-1 a D-4); se registra cada reemplazo, sin hash.
- **E-1a (Santiago recomienda):** argumento obligatorio `--paginas <n>` (1 a 5); el pedido lleva `pages: [1..n]` y el script se niega si `totalPages` no es `n`. El Blanco 18 tiene 3 páginas y no está verificado qué hace Vision si se piden páginas de más.
- **E-2 (Santiago recomienda):** la compuerta sigue **antes** de la caché. Para releer la respuesta guardada del Cedro 18 hay que restituir su hash en la lista.
- **Condiciones:** corrida solo con las reglas congeladas y commiteadas (R-11 a R-14 incluidas, si se aprueban); transcripción hecha antes de ver la salida; una sola corrida sin ajustes posteriores; sin `--reenviar`.
- **No toca `src/`:** cambia `scripts/ocr-real/` y sus pruebas (OR-06, OR-07; nuevas OR-19 a OR-21).

## 5. Lo que queda abierto y no necesita aprobación
- **P-R10:** hipótesis de que Vision confunde letras latinas con gemelas cirílicas; sigue abierta y no bloquea (el comportamiento actual es seguro).
- **P-04:** falta archivar la captura de la confirmación escrita de Casa Mueble.
- **P-02:** sigue parcial; cerrarla es decisión del equipo.

## 6. Qué se pide

1. Ratificar los ítems **1 a 3** con la evidencia archivada (ya figuran como aprobados en la v0.2).
2. Aprobar o rechazar los ítems **4 a 8**, que Santiago ya aprobó o eligió.
3. Tomar nota de los ítems **9 y 10** (decisiones de Santiago a informar) y aprobar el **9** para que el texto de R-7 se corrija.
4. Aprobar o rechazar los ítems **11 a 13** (decisiones de Santiago).
5. Aprobar o rechazar el ítem **14** (enmienda D) y, si se aprueba, E-1 y E-2.
6. Si se aprueba, el orden de trabajo es: implementar R-11 a R-14 con sus pruebas, congelar y commitear las reglas, y recién después correr la validación del ítem 14.

## 7. Aprobación (11/11/2026)

El equipo y el profesor aprobaron los ítems 1 a 14, incluida la enmienda D con E-1 y E-2. Informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar. Las specs de §2 pasaron a "Aprobado" con ese registro textual. La validación del ítem 14 (Blanco 18) la corre Santiago en su consola, después de congelar y commitear las reglas.
