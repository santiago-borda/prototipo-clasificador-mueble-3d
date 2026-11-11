# SPEC-B2: prueba manual de OCR con un PDF real (`scripts/ocr-real.ts`)

| Campo | Valor |
|---|---|
| Proyecto | PFG-Muebles-3D (Casa Mueble) |
| Módulo | B, apoyo de IA: extracción de datos del PDF (OCR). Prueba puntual, sin integrar |
| Versión | 0.4 (0.2 **aprobada el 10/11** con los cambios de O-5 y la prueba OR-16. La 0.3 aplica `docs/spec-revision-ocr-real.md` v0.2, aprobado por equipo y profesor, informado por Santiago el 10/11/2026; evidencia: a archivar: diagnóstico del rechazo D-a, registro de corridas, OR-17 y OR-18. La 0.4 (11/11) aplica la **enmienda D** (`docs/spec-ocr-prueba-real-enmienda-d.md` v0.2), **aprobada por el equipo y el profesor, informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar**: segundo PDF real (Blanco 18 del segundo fixture), `--paginas <n>` obligatorio (E-1) y compuerta antes de la caché (E-2); cambian OR-06 y OR-07 y se agregan OR-19 a OR-21; ver Historial) |
| Fecha | 10/11/2026 (0.4: 11/11/2026) |
| Autores | Santiago Borda, Lautaro Salina |
| Depende de | `docs/spec-extraccion-pdf.md` v0.3.1 (§8, §8.1, §8.2, §9, §13), `docs/spec-fixture-sintetico.md` §6, §12, `docs/spec-esquema-pdf.md` §8.2 y `CLAUDE.md` |
| Si chocan | Mandan `spec-esquema-pdf.md` y `spec-extraccion-pdf.md`, salvo en las enmiendas aprobadas de §2 |

## 1. Propósito y alcance

Correr **una vez, a mano, por una persona con su propia clave**, el camino `PDF → Cloud Vision (files:annotate, PDF inline) → PdfTextInput → parseOcrWords` con **un PDF real por corrida** del segundo fixture (de 1 a 5 páginas, 1 pedido; enmienda D: el Cedro 18, de 5 páginas, y el Blanco 18, de 3, este último para la validación 1), y dejar un resultado local comparable con una transcripción hecha a mano. Es la prueba con una página real que la spec de extracción deja pendiente en P-02. **No es una métrica de calidad del OCR** (una sola corrida, un solo PDF) y no valida los valores provisorios de `OCR_LAYOUT`: solo da el primer dato.

**Dentro del alcance:** el script manual `scripts/ocr-real.ts` (`npm run ocr:real -- <ruta al PDF>`), su lista blanca local, sus salidas locales y sus pruebas con datos sintéticos.

**Fuera del alcance:**
- Integrarlo a `src/`, a la app o a una ruta API. El cliente de red de Vision no se conecta a la app.
- Cualquier otro PDF real (incluido el primer fixture: necesita su propia enmienda), el LLM (Gemini), la reconciliación, la rasterización (P-12) y Tesseract. La validación con un segundo PDF (Blanco 18 del segundo fixture) está **dentro del alcance** desde la enmienda D (§2), aprobada por el equipo y el profesor, informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar.
- Dependencias nuevas (`@google-cloud/vision` ya está aprobada desde el 10/11).
- Cambiar el parser, `OCR_LAYOUT` o la validación. Si la corrida muestra que hay que cambiarlos, es otra spec. Después de la corrida 1 esa spec es `docs/spec-revision-ocr-real.md` (aprobada el 10/11): el parser cambia ahí, no acá.

## 2. Enmiendas aprobadas (A a C: 10/11, por Santiago Borda en nombre del equipo; D: 11/11, equipo y profesor, informado por Santiago el 11/11/2026)

Esta prueba contradice tres reglas vigentes (A a C). Quedan enmendadas **solo para este script y estos PDF**; se aplican a los otros documentos cuando se apruebe esta spec (§13). La enmienda D amplía A y fija cómo se declara el número de páginas.

| ID | Regla vigente | Enmienda |
|---|---|---|
| A | `CLAUDE.md` ("Adaptador de OCR (6/11)"): no conectar Vision "a PDF reales antes de resolver P-02 y P-12 (y la captura escrita, P-04)"; spec de extracción, encabezado: "el adaptador de OCR no se programa antes de resolver P-02 y P-12" | Se permite el script manual `scripts/ocr-real.ts` con **un único PDF real**, solo si su sha256 está en la lista blanca local (§5). La app, las rutas API y cualquier otro PDF siguen vedados. P-12 no aplica (PDF inline, sin rasterizar). P-02 sigue parcial hasta que el equipo decida cerrarla con el resultado. **P-04 (captura escrita) sigue sin archivar** (§3) |
| B | `CLAUDE.md` y spec de extracción §8.2: las salidas del OCR van "solo en `.ocr-data/`" | Se mantiene: este script escribe **solo** en `.ocr-data/real/`. La transcripción manual (entrada, no salida) vive en `Sabrina/ocr-real/`, como ya admite la regla para datos de ese fixture. No hay excepción a §8.2 |
| C | Spec de extracción §8: la lista blanca real "arranca vacía y vive fuera del repo" (sin ubicación ni cargador) | Se define el cargador (§5): archivo con un sha256 por línea, ruta en `OCR_LISTA_BLANCA` |
| D | §1: "un único PDF real" (enmienda A); §6: el pedido siempre lleva `pages: [1, 2, 3, 4, 5]` | **Aprobada el 11/11/2026** (`docs/spec-ocr-prueba-real-enmienda-d.md` v0.2). **D-1:** se admite un **segundo** PDF real, el Blanco 18 del segundo fixture (3 páginas), para la validación 1 de `docs/spec-revision-ocr-real.md` §7; cualquier otro PDF real (incluido el primer fixture) sigue fuera del alcance y necesita su propia enmienda. **D-2:** la lista blanca **sigue con una sola entrada** (`lista-blanca-multiple`): la persona reemplaza a mano el hash antes de cada corrida; nunca hay dos hashes. **D-3:** cada reemplazo se registra en §12 (sin hash). **D-4:** la corrida de validación se registra en §12b. **E-1:** `--paginas <n>` obligatorio (§4, §6). **E-2:** la compuerta sigue **antes** de la caché (§4): para releer la respuesta guardada del Cedro 18 hay que restituir su hash en la lista |

## 3. Autorización y estado de P-04

- **Autorización:** Casa Mueble autorizó enviar los PDF de OpenCutList, incluidos los del segundo fixture, a Cloud Vision y Gemini. La decisión del 3/11 fue informada por el equipo y **Santiago Borda la reconfirmó con Casa Mueble el 10/11**. La atribución es a Casa Mueble.
- **P-04 sigue abierta:** no hay captura ni confirmación escrita archivada. Esta spec no la reemplaza ni la da por cerrada; lo único que cambia es que el equipo decide correr esta prueba con ese respaldo.
- La autorización habilita el envío; **la lista blanca decide cuál PDF se envía de verdad** (spec de extracción §9).
- Los términos de Cloud Vision (si usa el contenido enviado, P-16) siguen sin verificarse. Se acepta ese riesgo para esta prueba, igual que para el PDF sintético.

## 4. Contrato del script

```
npm run ocr:real -- <ruta al PDF> --paginas <n> [--transcripcion <ruta al JSON>] [--reenviar]
```

`--paginas <n>` es **obligatorio** (E-1, enmienda D): la persona declara cuántas páginas tiene el PDF (entero de 1 a 5) y Vision lo confirma después (§6). Cedro 18: `--paginas 5`; Blanco 18: `--paginas 3`.

Variables de entorno (ninguna se escribe en el repo ni se imprime):

| Variable | Uso |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta absoluta a la clave (`$HOME\.secrets\gcp`). El script no la lee: la toma el cliente |
| `PROCESAMIENTO_EXTERNO` | Debe ser `permitir` (la compuerta, `src/pdf/ocr/gate.ts`) |
| `OCR_LISTA_BLANCA` | Ruta absoluta al archivo de la lista blanca (§5), fuera del repo |

Orden de los pasos. Cada rechazo ocurre **antes de cualquier llamada de red** y termina con código distinto de 0:

| Paso | Qué hace | Rechazo (código de motivo, §7) |
|---|---|---|
| 1 | Falta `GOOGLE_APPLICATION_CREDENTIALS` | `sin-credenciales` |
| 2 | Carga la lista blanca desde `OCR_LISTA_BLANCA` (§5) | `lista-blanca-ausente`, `lista-blanca-vacia`, `lista-blanca-invalida`, `lista-blanca-multiple` |
| 3 | Lee los argumentos: una sola ruta de PDF y `--paginas <n>` con n entero de 1 a 5; lee el PDF y verifica que empiece con `%PDF-` | `entrada-invalida` (ruta mal formada, `--paginas` ausente, repetida, no entera o menor que 1); `paginas-excedidas` (n > 5) |
| 4 | `puedeEnviar(pdf, process.env, { synthetic: ∅, whitelist })`. Debe dar `ok` con `via = "lista-blanca"` | `compuerta` (motivo de la compuerta); con `PERMITIR_DATOS_REALES` definida la compuerta lanza y no se envía nada |
| 5 | Si ya existe `.ocr-data/real/<id>.vision.json` y no se pasó `--reenviar`, **usa esa respuesta sin red** y salta al paso 8 | n/a |
| 6 | Un único pedido `batchAnnotateFiles` con el PDF inline, `DOCUMENT_TEXT_DETECTION` y `pages: [1, …, n]` (explícitas, con el n de `--paginas`) | `proveedor-error` (solo el código) |
| 7 | Verifica el total de páginas contra n (§6) antes de guardar o leer nada | `paginas-excedidas`, `paginas-no-confirmadas` |
| 8 | Guarda la respuesta cruda, convierte con `visionToTextInput` y lee con `parseOcrWords` (§8) | `conversion-fallida` (motivo de la conversión) o lectura rechazada (es un resultado, no un error: sale con 0; imprime `regla` y `página`, §7) |
| 9 | Si se pasó `--transcripcion`, compara (§9) | `transcripcion-invalida` |

`<id>` es el hex del sha256 del PDF. El `pdfId` del documento es `sha256:<hex>`.

**Orden compuerta-caché (E-2, enmienda D).** El paso 4 va **antes** que el paso 5, y no se cambia: con el hash de un PDF en la lista, el script **no puede releer** la respuesta guardada de otro, aunque no use la red; la compuerta lo rechaza (`compuerta`). Para releer la caché del Cedro 18 (corrida de desarrollo) hay que **restituir su hash** en la lista blanca y registrar el cambio (§12). Saltear la compuerta para leer la caché sería una excepción nueva a fail-closed y no se admite.

## 5. Lista blanca local

- Archivo de texto UTF-8, **un sha256 por línea** (64 caracteres hexadecimales, con o sin el prefijo `sha256:`; se normaliza a minúsculas). Se ignoran las líneas vacías y las que empiezan con `#`.
- Vive **fuera del repo** (por ejemplo `$HOME\.secrets\`). Su ruta va solo en `OCR_LISTA_BLANCA`. **El hash del PDF real no se escribe en el código, en las pruebas, en esta spec ni en ningún archivo versionado.** `.gitignore` ya cubre `.secrets/`.
- Fail-closed: sin variable o archivo inexistente → `lista-blanca-ausente`; sin ninguna entrada → `lista-blanca-vacia`; una línea que no es un sha256 → `lista-blanca-invalida`; **más de una entrada → `lista-blanca-multiple`** (un hash por vez: D-2).
- La lista sintética de la compuerta se pasa **vacía**: un PDF del fixture sintético no corre con este script (para eso está `ocr:sintetico`), y si la compuerta devuelve `via = "sintetico"` el script se niega.
- Que Santiago Borda agregue el hash a mano cuenta como la decisión explícita del equipo que pide spec de extracción §9. Se registra en §12.
- **Un hash por vez (D-2).** Para correr otro PDF (por ejemplo el Blanco 18) la persona **reemplaza a mano** el hash de su lista local por el de ese PDF antes de la corrida; el anterior se quita. Cada reemplazo se registra en §12 (D-3), sin hash.

## 6. Páginas

- El pedido pide las páginas 1 a n de forma explícita, con el n declarado en `--paginas` (E-1, enmienda D; 1 ≤ n ≤ 5). La persona declara cuántas páginas tiene el PDF y Vision lo confirma después. Motivo: el Blanco 18 tiene 3 páginas y **no está verificado** qué hace `files:annotate` si se piden páginas que el PDF no tiene (podría rechazar el pedido con el PDF ya enviado).
- `AnnotateFileResponse.totalPages` existe en los tipos del cliente (`@google-cloud/vision` 6.2.0, `protos.d.ts`) y las respuestas reales del 10/11 con PDF sintético lo traen (en un PDF de 6 páginas, ambos pedidos devolvieron 6).
- El script **se niega** (no guarda, no lee, no compara) si `totalPages` falta, no es un entero, es menor que 1, es mayor que 5 o **no es igual a n**, o si la cantidad de páginas con respuesta no es igual a `totalPages`. Si `totalPages` es mayor que 5 el motivo es `paginas-excedidas` (también cuando no coincide con n); en los otros casos, `paginas-no-confirmadas`. Un `--paginas` mayor que 5 se rechaza antes de la red con `paginas-excedidas` (§4, paso 3). "No puedo confirmar que son n" equivale a negarse.
- **Límite conocido:** esta verificación ocurre **después** del envío. La barrera previa es el hash: solo sale el archivo cuyo sha256 el equipo puso en la lista. Si ese archivo resultara tener más páginas que las declaradas, ya habría salido (con la autorización vigente) y el script solo evita procesarlo y guardarlo. Ver O-1.

## 7. Salida de consola: solo conteos

El script imprime **únicamente** las líneas de esta lista, armadas con texto fijo y números. Nunca imprime el nombre del archivo, el hash, el texto reconocido, el `detail` del parser ni mensajes de error del proveedor.

```
páginas leídas: <n>
palabras: <n>
lectura: leído | rechazado (<razón del catálogo>)
regla: <id del catálogo de rechazos>     (solo si la lectura se rechazó)
página: <n> | -                          (solo si la lectura se rechazó)
filas: <n>
pending: code=<n> name=<n> finalL=<n> finalA=<n> quantity=<n> cantos=<n> otros=<n>
hoja-incompleta: sí | no
comparación: iguales=<n> pending=<n> distintos-sin-pending=<n>     (solo con --transcripcion; o
             comparacion-desalineada (filas ocr=<n>, transcripción=<n>) | lectura-rechazada)
salidas: .ocr-data/real/
```

- `lectura: rechazado (...)` imprime solo la razón del catálogo (`estructura-no-reconocida`, `hoja-incompleta`, etc.). `hoja-incompleta: sí` se muestra cuando la razón del rechazo es `hoja-incompleta`.
- **Diagnóstico del rechazo (D-a, 10/11):**
  - `regla` y `página` salen de `PdfReading.rule` y `PdfReading.page` (enmienda C2, spec-esquema §8): un id de un catálogo cerrado y un número, nunca texto del documento.
  - `página: -` cuando `page` es `null`.
  - El `detail` **sigue sin imprimirse**: algunos citan texto del documento (por ejemplo, el de `unidad-no-soportada`). Queda solo en `<id>.lectura.json`.
- `filas` = piezas de todos los tableros; `0` si la lectura se rechazó.
- `pending` clasifica cada `PendingField.path` por su último segmento (`code`, `name`, `finalL`, `finalA`, `quantity`); `cantos` agrupa cualquier ruta que contiene `.edges`; `otros` es el resto (encabezado, resumen, pie, diagrama). No se imprime ninguna ruta.
- Un rechazo del script (§4, paso 1 a 7) imprime una sola línea: `rechazado: <código de motivo>`.

## 8. Salidas locales (solo `.ocr-data/real/`)

| Archivo | Contenido |
|---|---|
| `<id>.vision.json` | Respuesta cruda de Vision (los lotes), sin el PDF |
| `<id>.lectura.json` | El `PdfReading` de `parseOcrWords` completo (documento con sus `pending`, o razón, `detail`, `rule` y `page`) |
| `<id>.comparacion.json` | Solo con `--transcripcion`: el detalle campo a campo (con valores) |

- Contienen datos de Casa Mueble: no se commitean. `.ocr-data/` ya está en `.gitignore` (`/.ocr-data/`); se verifica con `git check-ignore -v` antes del primer commit.
- Se crea la carpeta si no existe. El script **no escribe en ninguna otra ruta**; la ruta de salida se arma solo a partir de la raíz del repo y `<id>` (un hex), nunca de la ruta del PDF.
- `readerVersion` = `vision-files-annotate/real` (mismo formato que `ocr-sintetico`).
- Caché (spec de extracción §5, paso 1): con la respuesta ya guardada no se vuelve a enviar el PDF salvo `--reenviar`.

## 9. Comparación con la transcripción manual

- Entrada opcional: un `CutListPdf` con `source.reader = "transcripcion-manual"`, hecho por Santiago, en `Sabrina/ocr-real/` (el script no la escribe ni la copia).
- Se validan solo el esquema y `reader`; si no es un `CutListPdf` reconocible → `transcripcion-invalida`.
- Se emparejan **tableros por `index` y piezas por posición** dentro del tablero, **solo si las filas coinciden**. Si la cantidad de tableros o la de piezas de algún tablero difiere de la transcripción, la comparación termina con el resultado `comparacion-desalineada`: **no se empareja nada por posición** y no se cuentan campos. `comparacion.json` lleva solo las cantidades de filas (totales y por tablero) y la consola imprime `comparación: comparacion-desalineada (filas ocr=<n>, transcripción=<n>)`. Si la lectura fue rechazada no hay con qué comparar: `comparación: lectura-rechazada`.
- Campos comparados por pieza: `code`, `name`, `quantity`, `finalL`, `finalA`, `edges` (s1 a s4 por presencia de marca y material). Un campo de la lectura que es `null` **con** `pending` cuenta `pending`; igual a la transcripción cuenta `iguales`; distinto y sin `pending` cuenta `distintos-sin-pending` (la métrica que bloquea una entrega en el harness, spec de extracción §11). Un campo distinto pero con `pending` y valor no nulo no ocurre (INV-0: `null` ⇔ `pending`).
- Esto **no** reemplaza al Eval Harness de la sesión 3.

## 10. Código (después de la aprobación)

- `scripts/ocr-real.ts`: punto de entrada delgado (`process.env`, `process.argv`, cliente real de Vision, sistema de archivos).
- `scripts/ocr-real/`: la lógica, con las dependencias **inyectadas** (`io`: leer archivos, escribir en `.ocr-data/real/`, cliente de Vision, consola). Funciones puras y testeables: `parseWhitelist`, `classifyPending`, `compareReading`, `formatSummary`. Importan de `@/pdf/ocr/*` y `@/pdf/types`; **no se agrega nada en `src/`**.
- `package.json`: un script `ocr:real` (`vite-node -c vitest.config.ts scripts/ocr-real.ts`), igual que `ocr:sintetico`. Sin dependencias nuevas.
- Tipado estricto, sin `any`, sin `@ts-ignore`, sin `it.skip` ni `it.only`.

## 11. Pruebas (solo datos sintéticos, sin red)

Usan las respuestas de replay del fixture sintético (`tests/fixtures/pdf-sintetico/replay/`), el cliente de Vision simulado y directorios temporales. `tests/setup/sinRed.ts` sigue haciendo fallar todo `fetch`.

| Id | Caso | Esperado |
|---|---|---|
| OR-01 | Lista blanca: archivo ausente, vacío, con línea inválida, con dos hashes, con comentarios y prefijo `sha256:` | Rechazos y normalización de §5 |
| OR-02 | `OCR_LISTA_BLANCA` sin definir | `lista-blanca-ausente`; el cliente simulado no se llama |
| OR-03 | PDF cuyo hash no está en la lista; sin `PROCESAMIENTO_EXTERNO`; con `PERMITIR_DATOS_REALES` definida | `compuerta` (o el error de la bandera); 0 llamadas al cliente |
| OR-04 | PDF del fixture sintético con la lista sintética vacía y fuera de la lista blanca | Bloqueado; 0 llamadas |
| OR-05 | PDF que no empieza con `%PDF-`, o dos rutas | `entrada-invalida` |
| OR-06 | El pedido tiene un único `batchAnnotateFiles` con `pages: [1, …, n]` según `--paginas` (por ejemplo `--paginas 5` y `--paginas 3`) | Verificado con el cliente simulado |
| OR-07 | Con `--paginas 5`: `totalPages` = 6, ausente, `5.5`, `0`, o menos respuestas que `totalPages` | Se niega (`paginas-excedidas` con 6; `paginas-no-confirmadas` en los demás); **no se escribe ningún archivo**; nada se lee |
| OR-08 | Respuesta válida de 3 páginas (replay) con lista blanca de prueba | Escribe solo bajo `.ocr-data/real/` del directorio temporal; los tres nombres de §8 |
| OR-09 | Salida de consola de una corrida exitosa y de una con lectura rechazada | Cada línea coincide con una plantilla de §7; no aparece ningún código de pieza, medida, nombre de archivo ni hash (se comparan contra las cadenas del fixture); el `detail` no se imprime |
| OR-10 | Error del proveedor con un mensaje que incluye texto del documento | Consola: solo `rechazado: proveedor-error`; el mensaje no aparece |
| OR-11 | `classifyPending` con rutas de cada tipo (`.code`, `.name`, `.finalL`, `.finalA`, `.quantity`, `.edges`, `.edges.s2.material`, `header.*`) | Conteos de §7 |
| OR-12 | `compareReading` con una transcripción igual, con un campo distinto con `pending` y uno distinto sin `pending`, y con distinta cantidad de piezas | Conteos de §9 |
| OR-13 | Caché: respuesta ya guardada y sin `--reenviar` | 0 llamadas al cliente; mismo resultado. Con `--reenviar`, 1 llamada |
| OR-14 | Rutas de salida | Todas bajo `.ocr-data/real/`; ninguna deriva de la ruta del PDF |
| OR-15 | `git ls-files "*.pdf"` vacío; `.ocr-data/` y `Sabrina/` ignorados (`git check-ignore`) | Se verifica en la sesión, no en `vitest` |
| OR-16 | `compareReading` con distinta cantidad de filas o de tableros (también con el mismo total repartido distinto entre tableros), y de punta a punta | `comparacion-desalineada`, sin emparejar por posición; sale con 0; `comparacion.json` sin campos |
| OR-17 | Lectura rechazada cuyo `detail` contiene texto del documento (por ejemplo `unidad-no-soportada`, que cita el segmento leído) | Consola: `regla:` y `página:` con valores del catálogo; el texto del `detail` no aparece (spec-revision-ocr-real CA-7) |
| OR-18 | Cada sitio de rechazo del parser (`src/pdf/parseText.ts`; con R-11 y R-14, 30 sitios: spec-revision §4.4 y §4.7) | Tiene un `rule` del catálogo cerrado; ningún id repetido entre sitios con distinto significado; `page` es un número cuando el rechazo es de una página |
| OR-19 | `--paginas` ausente, `0`, `6`, `2.5` o repetida (enmienda D) | Rechazo antes de la red: `entrada-invalida` (ausente, `0`, `2.5`, repetida) o `paginas-excedidas` (`6`); 0 llamadas al cliente |
| OR-20 | `--paginas 3` con respuesta simulada de 3 páginas; y `--paginas 3` con `totalPages` 5 | El pedido lleva `pages: [1, 2, 3]`; con `totalPages` 5 (que no supera 5 pero no coincide con n), `paginas-no-confirmadas` y ningún archivo escrito |
| OR-21 | Lista blanca con el hash de **otro** PDF y respuesta guardada del primero (E-2) | `compuerta`; la caché no se lee (0 lecturas del `.vision.json`); 0 llamadas al cliente |

## 12. Registro de la lista blanca (quién y cuándo)

El hash **no** se escribe acá. Solo se registra la decisión. **Cada reemplazo de hash (D-2, D-3) se registra con fecha, quién, qué PDF se habilita por descripción (por ejemplo "Blanco 18 del segundo fixture") y cuál se quita.** Para releer la caché del Cedro 18 hay que restituir su hash (E-2) y registrarlo.

| Fecha | Quién | Qué | Nota |
|---|---|---|---|
| 10/11/2026 | Santiago Borda | Agrega a su lista local el sha256 del PDF autorizado de 5 páginas del segundo fixture | Autorización de Casa Mueble informada por el equipo el 3/11/2026 y reconfirmada por Santiago el 10/11/2026; captura sin archivar (P-04). Hash guardado fuera del repositorio. |

## 12b. Registro de corridas

Sin hash ni contenido. "Camino" es PDF → Vision → `PdfTextInput`; "lectura" es `parseOcrWords`. **Una lectura rechazada no es una medición**: no hay filas, así que `distintos-sin-pending` no está definido, y un rechazo no equivale a `distintos-sin-pending = 0` (spec-revision-ocr-real §6.2).

| # | Fecha | Quién | Camino | Lectura | Regla y página | Para qué cuenta |
|---|---|---|---|---|---|---|
| 1 | 10/11/2026 | Santiago | Válido: 5 páginas, 1190 palabras, conversión sin error | Rechazada (`estructura-no-reconocida`) | Resumen sin unidad (`parseText.ts` l. 183; el id del catálogo se fija en la implementación), página 1 | Dato para P-02 (decisión del 10/11); **no** es medición de lectura. Diagnóstico y cambios: `docs/spec-revision-ocr-real.md` |
| 2 | 10/11/2026 | Santiago | Válido: 5 páginas, 1190 palabras, desde la caché, sin `--reenviar` | Rechazada (`estructura-no-reconocida`) | Tabla del Resumen sin filas (`resumen-tabla-vacia`), página 1 | Dato para el diagnóstico de R-11; **no** es medición de lectura. Diagnóstico y cambios: `docs/spec-revision-ocr-real.md` |
| 3 | 11/11/2026 | Santiago | Válido: 5 páginas, 1190 palabras, desde la caché, sin `--reenviar`, `--paginas 5`; commit `bca1193` | Leída: 24 filas (23 reales y 1 fila vacía por la letra duplicada de la página 2, R-13); `pending`: code=6, name=1, finalL=1, finalA=1, quantity=1, cantos=0, otros=0; `hoja-incompleta`: no | Sin rechazo | Primera lectura completa del Cedro 18 mm. **No** es medición de errores seguros: falta la comparación con una transcripción manual |
| 4 | 11/11/2026 | Santiago | Válido: 3 páginas, 605 palabras, llamada real a Vision (sin caché previa), `--paginas 3`; Blanco 18 mm; commit `bca1193` | Rechazada (`estructura-no-reconocida`) | Tabla del Resumen sin filas (`resumen-tabla-vacia`), página 1 | Validación con un segundo PDF (enmienda D): R-11 no generaliza al Blanco 18. Hallazgo; no se ajustó el parser tras ver el resultado. **No** es medición de lectura |

- La corrida de validación del Blanco 18 (D-4) se registra con "Para qué cuenta: validación 1" y la versión del parser congelada (el commit con R-11 a R-14); una sola corrida, sin `--reenviar`, sin ajustes posteriores (enmienda D §3).
- Releer la respuesta guardada con el parser nuevo (sin `--reenviar`, sin red) es una **corrida de desarrollo**: se registra acá con "Para qué cuenta: desarrollo" y no valida nada (spec-revision-ocr-real §7).

## 13. Cambios a otros documentos (al aprobarse esta spec)

1. `CLAUDE.md`: en "Adaptador de OCR (6/11)", reemplazar la prohibición por la enmienda A; en "Extracción OCR / Cloud Vision" agregar `OCR_LISTA_BLANCA`, el script `ocr:real` y que P-04 sigue sin archivar; actualizar P-02 ("falta la prueba" → "script listo, a correr por una persona").
3. Enmienda D (11/11): `CLAUDE.md` ("Extracción OCR / Cloud Vision": `--paginas`, un hash por vez, E-2) y `docs/spec-extraccion-pdf.md` (Estado).
2. `docs/spec-extraccion-pdf.md`: en el Estado, en §8 (cargador de la lista blanca, remite a esta spec), en §9 (fecha de reconfirmación, 10/11) y en P-02 y P-04.

## 14. Qué mira la persona que corre el script

Comando (PowerShell, en el worktree o después del merge; el worktree necesita `npm install`):

```
$env:PROCESAMIENTO_EXTERNO = "permitir"
$env:OCR_LISTA_BLANCA = "$HOME\.secrets\ocr-lista-blanca.txt"   # un sha256, a mano
$env:GOOGLE_APPLICATION_CREDENTIALS = "<ruta absoluta a tu clave>"
npm run ocr:real -- "<ruta al PDF>" --paginas 5 --transcripcion "Sabrina\ocr-real\transcripcion.json"
```

`--paginas` es obligatorio: las páginas del PDF (Cedro 18: 5; Blanco 18: 3). **Un hash por vez:** antes de correr otro PDF, reemplazá a mano el hash de la lista y registralo (§12). **Para releer la caché del Cedro 18** (corrida de desarrollo, sin red) hay que **restituir su hash** en la lista: con el hash del Blanco 18 la compuerta rechaza antes de mirar la caché (E-2).

Qué mirar en la consola:
1. `páginas leídas: <n>` igual al `--paginas` declarado (si dice `rechazado: paginas-...`, el PDF no es el esperado).
2. `lectura: leído`. Si dice `rechazado (estructura-no-reconocida)` es el resultado esperable si los rótulos o la granularidad provisoria no encajan con la fuente real: es un dato, no un fallo del script. Anotar `regla` y `página` en el registro de corridas (§12b). Una lectura rechazada no es una medición.
3. `filas` contra la cantidad esperada, y `pending: ...` (qué tipo de campo queda sin leer).
4. Con transcripción: **`distintos-sin-pending` debe ser 0**; es la métrica que importa. Si no es 0, hay un valor mal leído que llegó sin aviso.
5. Detalle con valores, solo local: `.ocr-data/real/<id>.lectura.json` y `.comparacion.json`. No pegarlos en un chat.

## 15. Decisiones abiertas (para aprobar con la spec)

| Id | Pregunta | Propuesta |
|---|---|---|
| O-1 | ¿Contar las páginas **antes** de enviar, sin dependencias (buscar `/Type /Page` en el PDF sin comprimir)? Con object streams no se puede contar. | No: el hash ya fija el archivo; se acepta el límite de §6 |
| O-2 | ¿La lista blanca de este script admite exactamente una entrada? | Sí (`lista-blanca-multiple`), por "un solo PDF" |
| O-3 | ¿Reusar la respuesta guardada y pedir `--reenviar` para volver a enviar? | Sí, para no reenviar datos reales en cada prueba |
| O-4 | ¿La lógica vive en `scripts/ocr-real/` y se prueba desde `tests/`? | Sí; `src/` no cambia |
| O-5 | ¿Emparejar piezas por posición en la comparación? | Sí en esta prueba; el emparejamiento por clave es del harness |

## Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 10/11/2026 | Borrador: contrato del script, lista blanca local, páginas, salida de consola, salidas locales, pruebas y enmiendas A a C |
| 0.2 | 10/11/2026 | Aprobada con O-1 a O-5. O-5 cambia: filas distintas → `comparacion-desalineada` sin emparejar por posición (§7, §9, OR-16). §13 aplicado en `CLAUDE.md` y `spec-extraccion-pdf.md`. Registro de §12 con quién y cuándo vacíos. Implementación en `scripts/ocr-real.ts` y `scripts/ocr-real/` |
| 0.3 | 10/11/2026 | Aplica `docs/spec-revision-ocr-real.md` v0.2 (aprobado por equipo y profesor, informado por Santiago el 10/11/2026; evidencia: a archivar). Cambios: diagnóstico del rechazo D-a (§7: líneas `regla` y `página`; el `detail` sigue sin imprimirse); `lectura.json` con `rule` y `page` (§8); OR-17 y OR-18 (§11); registro de corridas con la corrida 1 (§12b: dato para P-02, no medición); §1 y §14. **Sin implementar.** La validación con un segundo PDF queda en `docs/spec-ocr-prueba-real-enmienda-d.md`, borrador sin aprobar |
| 0.4 | 11/11/2026 | Aplica la **enmienda D** (`docs/spec-ocr-prueba-real-enmienda-d.md` v0.2), **aprobada por el equipo y el profesor, informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar**. §1 y §2 (D-1 a D-4: segundo PDF real, el Blanco 18; la lista blanca sigue con una entrada), §4 (`--paginas <n>` obligatorio, E-1; orden compuerta-caché, E-2), §5, §6 (pedido `pages: [1..n]`, `totalPages` contra n), §11 (OR-06 y OR-07 cambian; OR-19 a OR-21; OR-18 con 30 sitios), §12, §12b, §13 y §14. Implementación en `scripts/ocr-real/`; `src/` no cambia. La validación del Blanco 18 la corre Santiago en su consola |
