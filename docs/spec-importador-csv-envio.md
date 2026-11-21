# Spec — Importador del CSV del envío del ERP (v0.1, 21/11/2026)

**Estado:** Santiago aprobó el 21/11 avanzar con esta tarea antes de leer la spec («apruebo todo, avanzá con todas las tareas»). Las decisiones que tomé al escribirla son **ASUMIDO, reversibles** y quedan **a revisar** en el §8 (IC-I1 en adelante). Rama `erp-integracion-minima`, sin push.

**Antecedentes:** `docs/spec-integracion-erp-minima.md` v0.3 (IE-7, IE-10, IE-I1 a IE-I18); `docs/casa-mueble/respuestas-20-11-contrato-ucp.md` (consulta 3: `piezas.csv` es el CSV de OpenCutList tal cual); el spike `docs/spec-proto-csv-ocl.md` v0.5 de la rama `proto-csv-opencutlist` (parser probado con el fixture del gabinete, C1 a C7).

## 1. Qué cambia
Hasta la v0.3, un trabajo quedaba `success` con solo descargar, verificar y guardar el modelo y el CSV: el CSV no se leía. Ahora:
1. **El servidor lee el CSV** al recibir el envío (`POST /api/trabajos`), con el parser del spike. Un CSV que no se puede leer, o que tiene filas con problemas, deja el trabajo `failed` con la causa legible y qué hacer (422).
2. **El visor embebido arma las fichas con el listado del CSV** (nombre, medidas finales, material, cantidad y canteado), no con lo que adivinaba del .dae. El cruce del listado con el .dae (códigos, cantidades y medidas) se hace en el navegador, con las funciones que ya usa `/importar`, y se muestra en la ficha.

No cambia: `/importar` → `/prueba/<id>`, el visor 3D (componentes), `/p/<qrId>`, el contrato con el ERP (cuerpo, códigos de respuesta, estados), las tablas de la base.

## 2. Reutilizado y nuevo
- **Del spike, sin cambios de lógica:** `src/proto-csv/{parse,header,reasons}.ts` → `src/lib/csv-ocl/`. Solo cambian los comentarios de cabecera y un texto («el spike solo lee» → «el importador solo lee»). Sus pruebas C1 a C7 → `tests/csv-ocl/parse.test.ts`; el fixture del gabinete → `tests/fixtures/csv-ocl/gabinete/` (sin el PDF, que no se versiona).
- **Excepción en el importador de prueba (la misma del spike):** `src/importer/listing.ts` exporta `parseRecords`. Ningún otro cambio; sus pruebas no cambian.
- **Nuevo:** `src/lib/csv-ocl/envio.ts` (pura: bytes del CSV → listado del envío o causa del rechazo), `GET /api/erp/proyectos/{uuid}/listado`, `defDesdeListadoErp` y `cruceErp` en `src/lib/erp/defErp.ts`.
- **ERP simulado:** `CSV_SIMULADO` pasa a ser el «Listado de piezas» del Olmo con el formato de OpenCutList (columnas y celdas como el fixture del gabinete), armado desde `olmoDef`. Variante nueva del anfitrión: «CSV con problemas».

## 3. Lectura en el servidor (IC-1 a IC-5)
- **IC-1. Cuándo:** después de verificar los sha256 y el zip (IE-7) y antes de `settle`. El trabajo ya está `inProgress` por la reserva (`jobs.claim`): la lectura pasa en ese estado y termina en `success` o `failed`. Es síncrona, dentro del pedido.
- **IC-2. Texto:** los bytes se decodifican como UTF-8 estricto (`TextDecoder("utf-8", { fatal: true })`); el BOM se quita. Bytes que no son UTF-8 → `failed` («El CSV no está en UTF-8: exportá de nuevo el «Listado de piezas» desde OpenCutList»).
- **IC-3. Rechazo del archivo** (`csv-vacio`, `lista-de-instancias`, `columna-faltante`, `columna-ambigua`, `unidad-no-soportada`): `failed`, `mensaje` = «El CSV no se pudo leer: » + el mensaje del parser (ya dice qué exportar o corregir).
- **IC-4. Listado `borrador`** (algún código en `excluded` o alguna fila en `unkeyedRows`): `failed`. El `mensaje` dice cuántas filas tienen problemas y lista las tres primeras (fila, columna y mensaje del parser), más «y N más» si hay. Ninguna fila se pierde en silencio: o el listado entero se puede usar, o el trabajo falla.
- **IC-5. Listado `publicable`:** `success`, `mensaje` = «Modelo y CSV recibidos y verificados; listado de piezas leído (N tipos, M piezas).». Los avisos (`nombre-ausente`) no hacen fallar.
- Los bytes del CSV y del modelo se guardan en el almacén **solo si el trabajo queda `success`** (antes se guardaban apenas se verificaban los sha256). Un `failed` no guarda nada.
- El registro (`deps.registrar`) lleva el motivo con nombre (`csv-utf8`, `csv-<rechazo>`, `csv-borrador`), nunca el contenido del CSV.

## 4. Listado del envío (IC-6, IC-7)
- **IC-6. `GET /api/erp/proyectos/{uuid}/listado`** (cookie de sesión, como `/modelo`): el listado del **mismo trabajo** que sirve `/modelo` (el último `success` del proyecto). Se **recalcula** desde los bytes del CSV guardados: el parser es puro y determinista, así que no hace falta guardar el resultado ni migrar la base. Respuesta: `{ trabajoUuid, listadoId, piezas, metrosCanto, avisos }`; cada pieza `{ codigo, nombre, largoMm, anchoMm, espesorMm, material, cantidad, canteado, canto }` con `canteado: EdgeId[]` y `canto: { material, anchoMm, espesorTexto } | null` (el primer lado con canto). `listadoId` = `listadoId(pieces)` del motor (`src/engine/hash.ts`; solo servidor). 401 sin sesión; 404 `no-encontrado` (proyecto de otra carpintería, sin trabajo `success` o sin CSV guardado); 404 `sin-listado` si el CSV guardado no da un listado publicable (trabajos aceptados antes de esta versión, con el CSV que no se leía).
- **IC-7. Medidas:** finales del CSV (Longitud, Anchura, Grosor), sin reordenar (RP2 del spike). `metrosCanto` = `edgeTotalMm / 1000`, sin desperdicio.

## 5. Visor embebido (IC-8 a IC-10)
- **IC-8.** `ModeloErpGate` pide `/modelo` y `/listado` a la vez. Si el listado está (y es del mismo `trabajoUuid` que el modelo), el mueble se arma con `defDesdeListadoErp`: un tipo de pieza por fila del listado; `qrId` igual que hoy (`erp-<clave>-c04`); nombre = `Descripción` del CSV o, si viene vacía, «Pieza C04» (como hoy); medidas, material, cantidad y canteado del CSV; un módulo «Modelo del ERP»; `edgeBandSpec` del primer canto del listado (ancho del CSV; espesor redondeado por OpenCutList, `status: "provisorio"`). Si `/listado` da 404 `sin-listado`, se arma como hoy con `defDesdeModeloErp` (sin cambio).
- **IC-9. Cruce en el navegador:** `cruceErp(model, def)` = `verifyModel` (cantidades y medidas con 2 mm de tolerancia) + `checkAssociation` (instancias del .dae sin tipo de pieza, tipos con otra cantidad). No cambia el estado del trabajo (el servidor no lo ve).
- **IC-10. Pantalla:** la ficha del visor (`/erp/proyectos/{uuid}/visor/…`) muestra arriba una línea: «El listado del CSV coincide con el modelo 3D» o «El listado del CSV y el modelo 3D no coinciden en N puntos» con la lista desplegable de diferencias. La pantalla del proyecto dice, con el trabajo `success`, «Listado de piezas: N tipos, M piezas · X m de canto» en lugar de «El listado de piezas del CSV todavía no se procesa».

## 6. Pruebas (vitest, sin red)
| # | Caso | Esperado |
|---|---|---|
| TIC-1 | C1 a C7 del spike, portadas | iguales que en el spike |
| TIC-2 | `leerCsvDelEnvio` con el CSV del gabinete y con el del ERP simulado | listado publicable; 4 tipos y 5 piezas (gabinete); 21 tipos y 33 piezas, `listadoId` estable (Olmo simulado) |
| TIC-3 | Bytes que no son UTF-8; lista de instancias; borrador con 5 filas con problemas | rechazo `csv-utf8`; rechazo con el mensaje del parser; `borrador` con 3 filas en el mensaje y «y 2 más» |
| TIC-4 | `POST /api/trabajos` con el CSV del Olmo simulado | 201 `success`, mensaje con «21 tipos, 33 piezas» |
| TIC-5 | `POST /api/trabajos` con la variante «CSV con problemas» | 422 `failed` con la causa; el almacén no guarda nada |
| TIC-6 | Reintento: CSV con problemas y después el bueno, mismo `envioUuid` | 200, mismo `trabajoUuid`, `success` |
| TIC-7 | `GET …/listado` | 401 sin sesión; 404 de otra carpintería; 200 con 21 piezas, `listadoId` = el del CSV; 404 `sin-listado` con un trabajo `success` cuyo CSV no es de OpenCutList |
| TIC-8 | `defDesdeListadoErp` + `cruceErp` con el modelo del Olmo y el listado simulado | 21 tipos, mismos `qrId` que `defDesdeModeloErp`, canteado del CSV, cruce sin diferencias; con una cantidad cambiada, una diferencia |
| TIC-9 | `cruceErp` con el gabinete (.dae + CSV) | sin diferencias |

## 7. Fuera de alcance
El cruce en el servidor (necesita leer el .dae sin `DOMParser`, o `jsdom` como dependencia de la app: decisión del equipo, IC-I4); el motor de asociación (`associatePass1`, niveles `segura`/`advertencia`/`dudosa`) y la revisión humana del spike; el SVG de las placas; los QR imprimibles (consulta 59); guardar el listado en tablas.

## 8. Precisiones (a revisar)
- **IC-I1.** Un listado `borrador` hace fallar el trabajo entero (IC-4), igual que en el spike no se puede aprobar. Consecuencia conocida: el componente C01 del Olmo real se llama `_0001-01-M01-C01__`; si OpenCutList lo exporta así, el envío falla con «tiene guiones bajos de más» y hay que renombrar el componente en SketchUp. El CSV del ERP simulado trae el código ya normalizado (ASUMIDO: no sabemos qué escribe OpenCutList para ese componente).
- **IC-I2.** `success` pasa a significar «archivos verificados y listado del CSV leído sin problemas» (enmienda el ASUMIDO de las respuestas del 20/11, que lo dejaba para cuando existiera el importador). El cruce con el .dae no entra en el estado (IC-I4).
- **IC-I3.** Los archivos se guardan solo con `success` (§3). Los `failed` de la v0.3 (sha256, zip, descarga) ya no guardaban nada; el cambio solo afecta a los `failed` nuevos por el CSV, que tampoco guardan.
- **IC-I4.** El cruce se hace en el navegador porque `observeDae` e `indexDae` necesitan `DOMParser` y en el servidor solo existe con `jsdom`, que hoy es dependencia de desarrollo. Pasarlo al servidor es una decisión del equipo (dependencia).
- **IC-I5.** El listado se recalcula en cada `GET …/listado` (IC-6). Si el parser cambia, un trabajo viejo puede dar otro listado o `sin-listado`: el `listadoId` lo deja a la vista. Guardarlo pediría una migración.
- **IC-I6.** El texto de las razones y los mensajes son los del spike (en español, accionables).

### Revisión adversarial del 21/11 (corregido en la misma rama)
- **IC-I7. Topes de largo del mensaje.** Los mensajes del parser copian la celda del CSV y `job.message` es varchar(2000): una celda larguísima hacía fallar el `settle` en PostgreSQL (500 en vez del 422). Ahora cada problema se corta en 200 caracteres, el mensaje en 1500 (`acotar`, con «…») y `postTrabajo` corta en 1900 antes del `settle`.
- **IC-4 enmendado.** El mensaje agrupa por **fila**: «tiene N filas con problemas: fila 3, «Longitud»: …; «Cantidad»: … · fila 5, … · y M filas más.» (antes contaba problemas y repetía la fila).
- **IC-8 enmendado.** El visor y la pantalla del proyecto arman desde el .dae **solo** con 404 `sin-listado` del mismo trabajo. Cualquier otra falla de `/listado` (red, 401, 500, listado de otro trabajo) muestra «No se pudo leer el listado de piezas» y no registra nada, así el próximo montaje lo vuelve a intentar (`src/components/erp/pedirListado.ts`). Antes, un 500 pasajero dejaba en silencio fichas adivinadas del .dae por el resto de la sesión.
