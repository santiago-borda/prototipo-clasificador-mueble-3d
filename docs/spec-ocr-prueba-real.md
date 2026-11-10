# SPEC-B2: prueba manual de OCR con un PDF real (`scripts/ocr-real.ts`)

| Campo | Valor |
|---|---|
| Proyecto | PFG-Muebles-3D (Casa Mueble) |
| Módulo | B, apoyo de IA: extracción de datos del PDF (OCR). Prueba puntual, sin integrar |
| Versión | 0.3 (0.2 **aprobada el 10/11** con los cambios de O-5 y la prueba OR-16. La 0.3 aplica `docs/spec-revision-ocr-real.md` v0.2, aprobado por equipo y profesor, informado por Santiago el 10/11/2026; evidencia: a archivar: diagnóstico del rechazo D-a, registro de corridas, OR-17 y OR-18; ver Historial) |
| Fecha | 10/11/2026 |
| Autores | Santiago Borda, Lautaro Salina |
| Depende de | `docs/spec-extraccion-pdf.md` v0.3.1 (§8, §8.1, §8.2, §9, §13), `docs/spec-fixture-sintetico.md` §6, §12, `docs/spec-esquema-pdf.md` §8.2 y `CLAUDE.md` |
| Si chocan | Mandan `spec-esquema-pdf.md` y `spec-extraccion-pdf.md`, salvo en las enmiendas aprobadas de §2 |

## 1. Propósito y alcance

Correr **una vez, a mano, por una persona con su propia clave**, el camino `PDF → Cloud Vision (files:annotate, PDF inline) → PdfTextInput → parseOcrWords` con **un único PDF real** del segundo fixture (5 páginas, 1 pedido), y dejar un resultado local comparable con una transcripción hecha a mano. Es la prueba con una página real que la spec de extracción deja pendiente en P-02. **No es una métrica de calidad del OCR** (una sola corrida, un solo PDF) y no valida los valores provisorios de `OCR_LAYOUT`: solo da el primer dato.

**Dentro del alcance:** el script manual `scripts/ocr-real.ts` (`npm run ocr:real -- <ruta al PDF>`), su lista blanca local, sus salidas locales y sus pruebas con datos sintéticos.

**Fuera del alcance:**
- Integrarlo a `src/`, a la app o a una ruta API. El cliente de red de Vision no se conecta a la app.
- Cualquier otro PDF real, el LLM (Gemini), la reconciliación, la rasterización (P-12) y Tesseract. La validación con un segundo PDF (Blanco 18 del segundo fixture) está propuesta en `docs/spec-ocr-prueba-real-enmienda-d.md` (**borrador, sin aprobar**): hasta que se apruebe, sigue fuera del alcance.
- Dependencias nuevas (`@google-cloud/vision` ya está aprobada desde el 10/11).
- Cambiar el parser, `OCR_LAYOUT` o la validación. Si la corrida muestra que hay que cambiarlos, es otra spec. Después de la corrida 1 esa spec es `docs/spec-revision-ocr-real.md` (aprobada el 10/11): el parser cambia ahí, no acá.

## 2. Enmiendas aprobadas (10/11, por Santiago Borda en nombre del equipo)

Esta prueba contradice tres reglas vigentes. Quedan enmendadas **solo para este script y este PDF**; se aplican a los otros documentos cuando se apruebe esta spec (§13).

| ID | Regla vigente | Enmienda |
|---|---|---|
| A | `CLAUDE.md` ("Adaptador de OCR (6/11)"): no conectar Vision "a PDF reales antes de resolver P-02 y P-12 (y la captura escrita, P-04)"; spec de extracción, encabezado: "el adaptador de OCR no se programa antes de resolver P-02 y P-12" | Se permite el script manual `scripts/ocr-real.ts` con **un único PDF real**, solo si su sha256 está en la lista blanca local (§5). La app, las rutas API y cualquier otro PDF siguen vedados. P-12 no aplica (PDF inline, sin rasterizar). P-02 sigue parcial hasta que el equipo decida cerrarla con el resultado. **P-04 (captura escrita) sigue sin archivar** (§3) |
| B | `CLAUDE.md` y spec de extracción §8.2: las salidas del OCR van "solo en `.ocr-data/`" | Se mantiene: este script escribe **solo** en `.ocr-data/real/`. La transcripción manual (entrada, no salida) vive en `Sabrina/ocr-real/`, como ya admite la regla para datos de ese fixture. No hay excepción a §8.2 |
| C | Spec de extracción §8: la lista blanca real "arranca vacía y vive fuera del repo" (sin ubicación ni cargador) | Se define el cargador (§5): archivo con un sha256 por línea, ruta en `OCR_LISTA_BLANCA` |

## 3. Autorización y estado de P-04

- **Autorización:** Casa Mueble autorizó enviar los PDF de OpenCutList, incluidos los del segundo fixture, a Cloud Vision y Gemini. La decisión del 3/11 fue informada por el equipo y **Santiago Borda la reconfirmó con Casa Mueble el 10/11**. La atribución es a Casa Mueble.
- **P-04 sigue abierta:** no hay captura ni confirmación escrita archivada. Esta spec no la reemplaza ni la da por cerrada; lo único que cambia es que el equipo decide correr esta prueba con ese respaldo.
- La autorización habilita el envío; **la lista blanca decide cuál PDF se envía de verdad** (spec de extracción §9).
- Los términos de Cloud Vision (si usa el contenido enviado, P-16) siguen sin verificarse. Se acepta ese riesgo para esta prueba, igual que para el PDF sintético.

## 4. Contrato del script

```
npm run ocr:real -- <ruta al PDF> [--transcripcion <ruta al JSON>] [--reenviar]
```

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
| 3 | Lee el PDF (una sola ruta) y verifica que empiece con `%PDF-` | `entrada-invalida` |
| 4 | `puedeEnviar(pdf, process.env, { synthetic: ∅, whitelist })`. Debe dar `ok` con `via = "lista-blanca"` | `compuerta` (motivo de la compuerta); con `PERMITIR_DATOS_REALES` definida la compuerta lanza y no se envía nada |
| 5 | Si ya existe `.ocr-data/real/<id>.vision.json` y no se pasó `--reenviar`, **usa esa respuesta sin red** y salta al paso 8 | n/a |
| 6 | Un único pedido `batchAnnotateFiles` con el PDF inline, `DOCUMENT_TEXT_DETECTION` y `pages: [1, 2, 3, 4, 5]` (explícitas) | `proveedor-error` (solo el código) |
| 7 | Verifica el total de páginas (§6) antes de guardar o leer nada | `paginas-excedidas`, `paginas-no-confirmadas` |
| 8 | Guarda la respuesta cruda, convierte con `visionToTextInput` y lee con `parseOcrWords` (§8) | `conversion-fallida` (motivo de la conversión) o lectura rechazada (es un resultado, no un error: sale con 0; imprime `regla` y `página`, §7) |
| 9 | Si se pasó `--transcripcion`, compara (§9) | `transcripcion-invalida` |

`<id>` es el hex del sha256 del PDF. El `pdfId` del documento es `sha256:<hex>`.

## 5. Lista blanca local

- Archivo de texto UTF-8, **un sha256 por línea** (64 caracteres hexadecimales, con o sin el prefijo `sha256:`; se normaliza a minúsculas). Se ignoran las líneas vacías y las que empiezan con `#`.
- Vive **fuera del repo** (por ejemplo `$HOME\.secrets\`). Su ruta va solo en `OCR_LISTA_BLANCA`. **El hash del PDF real no se escribe en el código, en las pruebas, en esta spec ni en ningún archivo versionado.** `.gitignore` ya cubre `.secrets/`.
- Fail-closed: sin variable o archivo inexistente → `lista-blanca-ausente`; sin ninguna entrada → `lista-blanca-vacia`; una línea que no es un sha256 → `lista-blanca-invalida`; **más de una entrada → `lista-blanca-multiple`** (este script es de un solo PDF).
- La lista sintética de la compuerta se pasa **vacía**: un PDF del fixture sintético no corre con este script (para eso está `ocr:sintetico`), y si la compuerta devuelve `via = "sintetico"` el script se niega.
- Que Santiago Borda agregue el hash a mano cuenta como la decisión explícita del equipo que pide spec de extracción §9. Se registra en §12.

## 6. Páginas

- El pedido pide las páginas 1 a 5 de forma explícita.
- `AnnotateFileResponse.totalPages` existe en los tipos del cliente (`@google-cloud/vision` 6.2.0, `protos.d.ts`) y las respuestas reales del 10/11 con PDF sintético lo traen (en un PDF de 6 páginas, ambos pedidos devolvieron 6).
- El script **se niega** (no guarda, no lee, no compara) si `totalPages` falta, no es un entero, es menor que 1 o es mayor que 5, o si la cantidad de páginas con respuesta no es igual a `totalPages`. Si es mayor que 5 el motivo es `paginas-excedidas`; en los otros casos, `paginas-no-confirmadas`. "No puedo confirmar que son 5 o menos" equivale a negarse.
- **Límite conocido:** esta verificación ocurre **después** del envío. La barrera previa es el hash: solo sale el archivo cuyo sha256 el equipo puso en la lista. Si ese archivo resultara tener más de 5 páginas, ya habría salido (con la autorización vigente) y el script solo evita procesarlo y guardarlo. Ver O-1.

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
| OR-06 | El pedido tiene un único `batchAnnotateFiles` con `pages: [1,2,3,4,5]` | Verificado con el cliente simulado |
| OR-07 | `totalPages` = 6, ausente, `5.5`, `0`, o menos respuestas que `totalPages` | Se niega; **no se escribe ningún archivo**; nada se lee |
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
| OR-18 | Cada sitio de rechazo del parser (hoy 21, `src/pdf/parseText.ts`) | Tiene un `rule` del catálogo cerrado; ningún id repetido entre sitios con distinto significado; `page` es un número cuando el rechazo es de una página |

## 12. Registro de la lista blanca (quién y cuándo)

El hash **no** se escribe acá. Solo se registra la decisión.

| Fecha | Quién | Qué | Nota |
|---|---|---|---|
| 10/11/2026 | Santiago Borda | Agrega a su lista local el sha256 del PDF autorizado de 5 páginas del segundo fixture | Autorización de Casa Mueble informada por el equipo el 3/11/2026 y reconfirmada por Santiago el 10/11/2026; captura sin archivar (P-04). Hash guardado fuera del repositorio. |

## 12b. Registro de corridas

Sin hash ni contenido. "Camino" es PDF → Vision → `PdfTextInput`; "lectura" es `parseOcrWords`. **Una lectura rechazada no es una medición**: no hay filas, así que `distintos-sin-pending` no está definido, y un rechazo no equivale a `distintos-sin-pending = 0` (spec-revision-ocr-real §6.2).

| # | Fecha | Quién | Camino | Lectura | Regla y página | Para qué cuenta |
|---|---|---|---|---|---|---|
| 1 | 10/11/2026 | a completar | Válido: 5 páginas, 1190 palabras, conversión sin error | Rechazada (`estructura-no-reconocida`) | Resumen sin unidad (`parseText.ts` l. 183; el id del catálogo se fija en la implementación), página 1 | Dato para P-02 (decisión del 10/11); **no** es medición de lectura. Diagnóstico y cambios: `docs/spec-revision-ocr-real.md` |

- Releer la respuesta guardada con el parser nuevo (sin `--reenviar`, sin red) es una **corrida de desarrollo**: se registra acá con "Para qué cuenta: desarrollo" y no valida nada (spec-revision-ocr-real §7).

## 13. Cambios a otros documentos (al aprobarse esta spec)

1. `CLAUDE.md`: en "Adaptador de OCR (6/11)", reemplazar la prohibición por la enmienda A; en "Extracción OCR / Cloud Vision" agregar `OCR_LISTA_BLANCA`, el script `ocr:real` y que P-04 sigue sin archivar; actualizar P-02 ("falta la prueba" → "script listo, a correr por una persona").
2. `docs/spec-extraccion-pdf.md`: en el Estado, en §8 (cargador de la lista blanca, remite a esta spec), en §9 (fecha de reconfirmación, 10/11) y en P-02 y P-04.

## 14. Qué mira la persona que corre el script

Comando (PowerShell, en el worktree o después del merge; el worktree necesita `npm install`):

```
$env:PROCESAMIENTO_EXTERNO = "permitir"
$env:OCR_LISTA_BLANCA = "$HOME\.secrets\ocr-lista-blanca.txt"   # un sha256, a mano
$env:GOOGLE_APPLICATION_CREDENTIALS = "<ruta absoluta a tu clave>"
npm run ocr:real -- "<ruta al PDF>" --transcripcion "Sabrina\ocr-real\transcripcion.json"
```

Qué mirar en la consola:
1. `páginas leídas: 5` (si dice `rechazado: paginas-...`, el PDF no es el esperado).
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
