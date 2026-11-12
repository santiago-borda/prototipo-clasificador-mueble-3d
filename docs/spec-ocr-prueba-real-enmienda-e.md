# SPEC-B2, enmienda E: validación con un PDF nuevo no visto (primer fixture, Olmo)

| Campo | Valor |
|---|---|
| Estado | **APROBADA v0.2**, aprobada por el equipo y el profesor, informado por Santiago el 12/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar. Santiago Borda eligió el criterio **C**, confirmó **3 páginas** y aprobó la autorización (12/11/2026). **Condición previa a correr (E-4): Santiago confirma que la transcripción de `olmo.json` es manual.** Aplicada en SPEC-B2 v0.5 |
| Enmienda a | `docs/spec-ocr-prueba-real.md` (SPEC-B2) v0.4, con la enmienda D v0.2: §1, §2, §5, §12, §12b y §14 |
| Origen | Protocolo de `docs/spec-revision-ocr-real.md` §7, punto 4: tras cambiar reglas después de la validación 1, la corrida del Blanco 18 pasa a ser de desarrollo (decisión de Santiago, 11/11/2026; pendiente del equipo y del profesor) y la validación siguiente es el primer fixture |
| Regla de datos | Ni este documento ni ningún archivo versionado escriben el hash, el texto, los códigos ni las medidas de los PDF reales. Solo nombres de reglas, conteos y descripciones. El nombre del PDF figura porque lo da el fixture versionado `tests/fixtures/pdf/olmo.json` |

## 1. Qué permite

| Id | Regla vigente | Enmienda |
|---|---|---|
| E-1 | SPEC-B2 §1 (con D-1): solo el Cedro 18 y el Blanco 18; cualquier otro PDF real, incluido el primer fixture, queda fuera | Se admite **un** PDF del primer fixture: *1 Optimizacion Blanco Nature (echo con CutList)*, el primero de los tres de `olmo.json` (en el fixture, `source.fileName` = "1) Optimizacion Blanco Nature (echo con CutList).pdf"; **Santiago confirma que es el mismo archivo**). Los otros dos (Gaudi, fondo de 3 mm) siguen fuera y necesitan su propia enmienda |
| E-2 | D-2: la lista blanca tiene **una sola entrada** | **Se mantiene.** Antes de la corrida la persona **reemplaza a mano** el hash de su lista local por el de este PDF y quita el anterior. Cada reemplazo se registra en SPEC-B2 §12 (fecha, quién, el PDF por descripción, cuál se quita), **sin hash**. Con E-2 de la enmienda D, para releer la caché de otro PDF hay que restituir su hash |
| E-3 | D / E-1: `--paginas <n>` obligatorio | **`--paginas 3`** (confirmado por Santiago, 12/11/2026: resumen más una hoja de 2 páginas, como dice la transcripción) |
| E-4 | SPEC-B2 §9: la comparación usa un `CutListPdf` con `reader = "transcripcion-manual"` | Se usa la transcripción **ya versionada** (`olmo.json`, documento 0), **si se confirma que es manual** (condición abajo). El script espera **un** `CutListPdf` por archivo, así que la persona **copia ese documento a un archivo local ignorado** (por ejemplo en `Sabrina/ocr-real/`) **sin modificar ningún valor ni el `.json` versionado**, y verifica con diff que la copia es idéntica al documento 0 |

**Condición de E-4: la transcripción tiene que ser manual (Santiago, 12/11/2026).** Si salió de un extractor automático (por ejemplo el anterior con Gemini), no sirve como verdad para medir errores seguros y esta validación **no se corre** hasta tener otra transcripción manual. Lo que el repo registra: `_nota` de `olmo.json` ("Transcripcion manual (28/10/2026) … se leyeron como imagen. No se corrigio nada"); `readerVersion = "manual/2026-10-28"` y `reader = "transcripcion-manual"` en los tres documentos; el commit del 28/10/2026 (`6ddcc8e`), anterior al adaptador de OCR (6/11) y a toda corrida de Vision (10/11); y la revisión página por página de los PDF del primer fixture del 3/11 (spec-esquema, encabezado). **Lo que el repo no registra:** quién la hizo ni si se asistió con una herramienta automática. **Santiago confirma el origen antes de correr la validación** y lo anota en el registro previo (§4); la aprobación de esta enmienda no lo reemplaza.

**Autorización:** aprobada por Santiago (12/11/2026): Casa Mueble ya autorizó el uso de Olmo y Sabrina para pruebas e implementaciones (SPEC-B2 §3 cubre los PDF de OpenCutList). **P-04 sigue sin archivar.**

## 2. Qué es "no visto" y qué es distinto en este PDF
- **No visto** quiere decir: nunca se corrió OCR sobre él ni se miró una salida suya, y ninguna regla (R-1 a R-15) se diseñó con sus estructuras. Sí fue visto por el equipo para transcribirlo (esa transcripción es la verdad de la comparación).
- **Distinto de los dos PDF del segundo fixture** (según la transcripción versionada): una sola hoja de dos páginas (resumen + 2 páginas: **3 páginas**), 13 filas de piezas, cantidad de piezas del pie 20, y **sin las columnas "Ajustadas" ni "Tiras de cantos"** (solo "Finales"): `edges = "columna-ausente"`. Por eso **esta validación no mide la lectura de los cantos** ni el paso entre subcolumnas.
- Responde P-R7 de spec-revision (si pasa lo mismo en el primer fixture).

## 3. Páginas a pedir (E-3)
**n = 3**, confirmado por Santiago (12/11/2026). La persona lo declara con `--paginas 3` y Vision lo confirma después (`totalPages`); si no coincide, el script se niega (SPEC-B2 §6).

## 4. Condiciones (como D §3, más lo que pide este caso)
1. **Reglas congeladas:** las reglas de spec-revision §4 (incluida R-15, si se aprueba) están implementadas y commiteadas. La corrida usa ese commit, sin cambios locales; se anota su hash corto en el registro previo.
2. **Criterio escrito antes de correr:** el criterio C (§5) y la lista de hallazgos (§6), tal cual, en el registro previo.
3. **Transcripción lista antes y de origen manual** (E-4).
4. **Una sola corrida, sin `--reenviar`.**
5. **No se ajusta nada después de ver el resultado:** ni el parser, ni `OCR_LAYOUT`, ni la transcripción, ni el criterio, ni la lista de qué cuenta como hallazgo. Un problema va a una revisión nueva; esta corrida pasa a contar como de desarrollo (igual que la del Blanco) y no queda como validación.
6. **La corre una persona con su clave**, nunca Claude Code ni CI; consola solo con conteos, `regla` y `página`.

**Registro previo** (se completa antes de correr, en SPEC-B2 §12b, sin hash ni contenido): fecha, quién, hash corto del commit congelado, criterio C, n = 3, "PDF: primero del primer fixture (descripción)", origen de la transcripción (confirmado manual) y confirmación de que el hash de la lista es solo el de este PDF.

## 5. Criterio de aceptación: **C, por capas** (elegido por Santiago, 12/11/2026; pendiente del equipo y del profesor)

| Capa | Qué se mide | Efecto |
|---|---|---|
| **1. Seguridad (bloqueante)** | Sobre una lectura `leído` **y comparable**: `distintos-sin-pending = 0` y toda fila `dudosa` | Si se cumple, la validación **pasa**. Un solo valor mal leído sin `pending` (`distintos-sin-pending > 0`) es falla de seguridad: **no pasa** |
| **2. Generalización (se informa)** | `leído`, o rechazo con `regla` y `página` | Un rechazo es "no generaliza": resultado válido de la prueba, no una medición, y no equivale a `distintos-sin-pending = 0`. No se puede evaluar la capa 1 |
| **3. Cobertura (se informa)** | Conteos de `iguales`, `pending` y `distintos-sin-pending`, y filas leídas contra las de la transcripción | **Sin umbral**: no aprueba ni rechaza. Un umbral sería un valor nuevo (PROVISORIO) y no se define |

**`comparacion-desalineada` es "no concluyente": ni pasa ni falla** (Santiago, 12/11/2026). El emparejamiento es por posición y puede desalinear por un artefacto que no es de calidad (por ejemplo, una fila vacía por anclas superpuestas, R-13 b, como en el Cedro y el Blanco). En ese caso la capa 1 **no se puede evaluar**: no se informa "pasa" ni "falla de seguridad", solo los conteos de filas por tablero, y el resultado se registra como hallazgo H3. Tampoco se corrige la transcripción para alinearla (condición 5). Lo mismo vale para `lectura-rechazada`: no hay comparación.

**Opciones descartadas (registro).** *A* (seguridad estricta, `leído` y `distintos-sin-pending = 0`): demasiado débil, una lectura "leída" con todo en `pending` pasaría. *B* (A más alineación y suma igual al pie): depende del emparejamiento por posición, que ya falló por artefactos y podría reprobar por eso y no por calidad.

No se propone ningún número nuevo.

## 6. Qué cuenta como hallazgo

| Id | Hallazgo | Tratamiento |
|---|---|---|
| H1 | Un valor mal leído sin `pending` (`distintos-sin-pending > 0`) | **Falla de seguridad.** Revisión nueva; no se corrige en el momento |
| H2 | Lectura rechazada (se anota `regla` y `página`) | "No generaliza"; no hay medición |
| H3 | `comparacion-desalineada` (solo conteos de filas por tablero) | **No concluyente**; hallazgo informativo; no cuenta campos |
| H4 | Un supuesto de una regla que no se cumple, aunque la lectura salga bien (por ejemplo, un `/` o un separador que aparece o no, una estructura de columnas distinta) | Hallazgo informativo |
| H5 | `pending` sistemáticos en una misma columna o campo | Se anota; no es falla de seguridad |
| H6 | Diferencias propias de este PDF (sin "Ajustadas" ni "Tiras de cantos") | Informativo; no es hallazgo de las reglas |

**No son hallazgo:** que toda fila salga `dudosa` por `origen-ocr`; los `pending` aislados y seguros.

## 7. Qué no cambia
- Un hash por vez en la lista blanca, fuera del repo. Salidas solo en `.ocr-data/real/`. Consola solo con conteos, `regla` y `página`.
- Sin dependencias nuevas; sin cambios en `src/` ni en `scripts/` (el script ya tiene `--paginas`).
- Toda fila sigue `dudosa` por `origen-ocr`: esta validación no cambia ningún nivel.

## 8. Qué se aprobó (12/11/2026)
1. E-1 a E-4, incluida la condición de origen manual de la transcripción y la copia local con diff.
2. El criterio **C** con `comparacion-desalineada` como "no concluyente" (§5) y la lista de hallazgos (§6).
3. Cuándo se corre: después de implementar y congelar R-15 (§4, condición 1).

## Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 11/11/2026 | Borrador: PDF del primer fixture (primero de `olmo.json`), reemplazo del hash, páginas (a definir), tres opciones de criterio sin elegir, hallazgos y condiciones |
| 0.2 | 12/11/2026 | Decisiones de Santiago: criterio **C** (A y B descartadas), `comparacion-desalineada` = "no concluyente", **3 páginas** confirmadas, autorización aprobada. Condición de E-4: la transcripción tiene que ser manual; se registra qué dice el repo y qué no. propuesto, pendiente de aprobación del equipo y del profesor |
| 0.2 (aprobación) | 12/11/2026 | **APROBADA** por el equipo y el profesor, informado por Santiago el 12/11/2026 (evidencia: respuestas al mensaje de aprobación, a archivar): E-1 a E-4, criterio C con `comparacion-desalineada` "no concluyente" y la lista de hallazgos. Queda la condición de origen manual de la transcripción. Aplicada en SPEC-B2 v0.5 |
