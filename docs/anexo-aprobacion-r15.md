# Anexo de aprobación (incremental): R-15, el `/` opcional del material

| Campo | Valor |
|---|---|
| Para | El equipo y el profesor |
| Complementa | `docs/paquete-aprobacion-ocr-real.md` (ítems 1 a 14, aprobados el 11/11/2026). No reabre nada de ese paquete |
| Pide | Aprobar (o rechazar) cada ítem de §2: **aprobados el 12/11/2026** |
| Fecha | 11/11/2026 (actualizado 12/11/2026) |
| Estado | **APROBADO** por el equipo y el profesor en una sola ronda, informado por Santiago el 12/11/2026 (evidencia: respuestas al mensaje de aprobación, a archivar). Santiago Borda ya había aprobado, aceptado o decidido los ítems 1 a 7 (11/11/2026 y 12/11/2026). R-15 (ítems 1 a 5) está **implementada, pendiente de commit** (12/11/2026) |
| Regla de datos | No contiene texto, códigos, medidas ni hashes de ningún PDF real. Solo conteos, clases de palabra y nombres de reglas |

## 1. De dónde viene

La validación 1 (Blanco 18 mm del segundo fixture, 3 páginas, 11/11/2026, reglas R-11 a R-14 commiteadas en bca1193) dio `lectura: rechazado`, regla `resumen-tabla-vacia`, página 1. **La causa verificada:** la fila de la tabla del Resumen no trae la palabra `/` (el OCR la perdió; el título de la página 1 sí la conserva) y R-11 a la exige. Con un `/` insertado, la lectura pasa a "leído" (1 tablero, 7 piezas, 9 `pending` todos en la hoja, pie 50 = suma 50, 7 de 7 filas `dudosa`). El material de dos palabras no es el problema. Detalle en `docs/spec-revision-ocr-real.md` v0.9 §2.6.

Dato nuevo: el OCR pierde el `/` **por aparición y por PDF** (en el Cedro, en las bandas; en el Blanco, en la fila). Solo el título lo conservó en los dos.

## 2. Lista de lo pendiente

Leyenda de la columna **Santiago**: su decisión previa (11/11/2026 y 12/11/2026). **El equipo y el profesor aprobaron los ítems 1 a 7 el 12/11/2026.**

| # | Ítem | Santiago | Spec que modifica | ¿Toca un contrato aprobado? | Prueba que lo cubre |
|---|---|---|---|---|---|
| 1 | **R-15 (C8)** El `/` del material es opcional en cada aparición. La fila del Resumen sin `/` se acepta solo si es exactamente igual al material y al espesor del título (leído con `/` y con `\|` a la izquierda, R-7); la banda ya lo tiene (/-b). Sin ids nuevos | aprobó | spec-esquema §8.2 (R-11 a y una fila R-15 nueva); spec-revision §4.8 | **Sí:** R-11 a ("con `/` consumido") | TP-134 a TP-146, CA-11 |
| 2 | **Salvedad de R-15:** cada aparición sin `/` tiene como único respaldo a la otra (la fila al título y el título a la fila), nunca las dos a la vez | aprobó | spec-revision §4.0 | No (igual que /-b) | TP-137, TP-138, TP-140, TP-139 |
| 3 | **O-R15-1 (alternativa adoptada)** Un título sin `/` se acepta si es exactamente igual a la fila del Resumen que sí tiene `/` y el título lleva el `\|` a la izquierda; si falta el `/` en las dos, o faltan el `/` y el `\|` del título, rechazo. Parte g de R-15 | decidió | spec-esquema §8.2 ("Título del resumen", R-7); spec-revision §4.8 | **Sí:** R-7 (el título exige `/`) | TP-139, TP-146 |
| 4 | **O-R15-2** El contador `i / N` y la fecha quedan sin variante sin `/` (seguro: `hoja-sin-contador` y `pending`). **Límite conocido a revisar con el próximo PDF** | aceptó | spec-revision §4.8 y §7 (punto 8) | No (documenta un límite) | Sin prueba nueva |
| 5 | **O-R15-3** La fila sin `/` que no coincide da `resumen-tabla-vacia`, sin id propio: el catálogo queda en **30 sitios** | aceptó | spec-revision §4.8 | No | TP-137, TP-138, OR-18 |
| 6 | **Consecuencia sobre el protocolo** (spec-revision §7 punto 4 y 7; enmienda D §3 punto 5): la corrida del Blanco 18 pasa a contar como **de desarrollo**; la validación siguiente es con el primer fixture y necesita su propia enmienda | decidió | spec-revision §7; enmienda D §3; SPEC-B2 §12b | **Sí:** el protocolo aprobado | — |
| 7 | **Enmienda E (borrador v0.2)**: validación con un PDF nuevo no visto, el primero del primer fixture (Olmo). Reemplazo del hash, `--paginas 3` (confirmado), **criterio C** (por capas), `comparacion-desalineada` = "no concluyente", hallazgos y condiciones. Condición: la transcripción tiene que ser manual | eligió C, confirmó 3 páginas y aprobó la autorización (12/11/2026) | `docs/spec-ocr-prueba-real-enmienda-e.md` (nueva); SPEC-B2 §1, §12, §12b, §14 | **Sí:** "un PDF real" por corrida entre los ya admitidos (§1) | Sin pruebas nuevas (el script no cambia) |

## 3. Detalle

### 1 a 3. R-15
- **Qué cambia:** la fila del Resumen deja de exigir el `/`. Se busca `<palabras del material> <n> mm`, delimitado y desde la primera palabra del primer segmento, y se acepta solo si es **exactamente** `<material del título> <espesor del título> mm`. La cola `- <tipo>` no entra. Si el material aparece dos veces en el renglón (con o sin `/`), rechazo `resumen-fila-ambigua`.
- **Título sin `/` (parte g):** si en la zona del título no hay `<material> / <n> mm`, se busca `<material> <n> mm` justo después de un `\|` y se acepta solo si es exactamente igual al material y al espesor de una fila leída **con** `/`. Sin `\|`, con otro material o espesor, o con el `/` ausente también en la fila: rechazo vigente (`resumen-sin-titulo-o-tabla`). **Texto confirmado por Santiago (12/11/2026):** un título sin `/` se acepta solo si lleva `\|` a la izquierda y es igual a una fila del Resumen que sí tiene `/`; se rechaza si faltan el `/` del título y el de la fila, o si faltan el `/` y el `\|` del título.
- **Auditoría (spec-revision §4.8):** el título, la fila del Resumen y la banda usan el `/` como material; el contador y la fecha, como separador; el resto no lo usa. Solo la banda tenía variante. Con R-15: título (g) y fila (a) nuevas, banda sin cambio.
- **No relaja `dudosa` ni `pending` (verificado otra vez):** ninguna fila de pieza cambia; los valores se escriben solo con igualdad exacta contra una aparición que conserva el `/` (el mismo respaldo que /-b); las celdas siguen en R-11 b a d; `header.material` no admite `null` y, sin respaldo, hay rechazo. Evidencia, con la sonda local y solo banderas: con el `/` insertado, 7 de 7 filas `dudosa` por `origen-ocr`, ningún `pending` de encabezado ni de estadísticas; y en los dos PDF (Cedro y Blanco) el título sin `/` y la fila sin `/` son idénticos palabra por palabra y los dos títulos llevan el `\|` a la izquierda.
- **Salvedad:** cada aparición sin `/` tiene como único respaldo a la otra; si el OCR leyera mal la misma palabra en las dos, la igualdad pasaría (igual que /-b).

### 4. Límite conocido (O-R15-2)
El contador `i / N` y la fecha pueden perder el `/`. No pasó en los dos PDF medidos. Hoy da `hoja-sin-contador` (la hoja se rechaza) o `generatedAt` en `pending`: seguro, pero con pérdida. Se revisa con el próximo PDF.

### 6. Consecuencia sobre el protocolo
El protocolo aprobado (spec-revision §7, punto 4) dice que si hay que cambiar reglas después de la validación 1, esa corrida pasa a ser de desarrollo y la siguiente validación es el primer fixture, con su propia enmienda. Pedir R-15 es cambiar reglas. **Releer la respuesta guardada del Blanco con el parser nuevo es una corrida de desarrollo** y no valida nada. La enmienda D lo registra en §3, punto 5.

### 7. Enmienda E (borrador v0.2)
Admite **un** PDF del primer fixture: *1 Optimizacion Blanco Nature (echo con CutList)* (el primero de `olmo.json`; Santiago confirma que es el mismo archivo). **Páginas: 3** (confirmado). **Autorización:** aprobada por Santiago (Casa Mueble autorizó el uso de Olmo y Sabrina para pruebas e implementaciones); P-04 sigue sin archivar.
- **Criterio C (elegido por Santiago):** capa 1 de seguridad **bloqueante** (`distintos-sin-pending = 0` y toda fila `dudosa`, sobre una lectura comparable); capas de generalización y de cobertura **solo se informan, sin umbrales**. **`comparacion-desalineada` es "no concluyente": ni pasa ni falla.** A (muy débil) y B (depende del emparejamiento por posición) quedan descartadas.
- **Condición sobre la transcripción (Santiago):** tiene que ser manual; si salió de un extractor automático no sirve como verdad. **Lo que dice el repo:** `olmo.json` declara "Transcripcion manual (28/10/2026)", `readerVersion = "manual/2026-10-28"`, está commiteada desde el 28/10 (anterior al OCR y a Vision) y se revisó página por página el 3/11. **Lo que no dice:** quién la hizo ni si hubo ayuda automática. **Santiago confirma el origen** antes de aprobar; si es manual, la copia local con diff alcanza (sin tocar valores ni el `.json` versionado).
- Este PDF no tiene columnas de cantos ni "Ajustadas": **no mide cantos**.
- Detalle en `docs/spec-ocr-prueba-real-enmienda-e.md`.

## 4. Lo que no necesita aprobación
- **Anclas superpuestas de "No."** (spec-revision §2.6): en el Blanco (página 3) hay un par superpuesto del mismo patrón que el del Cedro (página 2): dos anclas válidas con letras distintas, que R-13 b no funde, y queda una fila vacía con `pending`. Es seguro y no se propone ninguna regla (O-R13-3 no se adopta).
- **P-R11** (hipótesis): que el `/` se pierda al azar, también en el título. No bloquea.
- **P-04 y P-02:** siguen como estaban.

## 5. Nota sobre `docs/spec-ocr-prueba-real.md`
`docs/spec-ocr-prueba-real.md` (SPEC-B2) tenía cambios de Santiago **sin commitear** (el registro de corridas, §12b) cuando se redactó el borrador; luego quedaron commiteados (`df8659e`, "registro de corrida"). Este trabajo **no lo tocó** y no debe pisarlo. Si el registro de la corrida del Blanco 18 no dice que ahora cuenta como **desarrollo** (ítem 6), lo ajusta Santiago allí.

## 6. Qué se pidió y qué sigue
1. Aprobados los ítems **1 a 6**, en una sola ronda con el 7.
2. Aprobada la **enmienda E** (ítem 7) con el criterio C. **Sigue en pie su condición E-4:** Santiago confirma que la transcripción de `olmo.json` es manual antes de correr la validación.
3. El orden de trabajo es: pruebas TP-134 a TP-146 primero, después el código de R-15, y recién después congelar y commitear (spec-revision §7) y correr la validación del ítem 7.
