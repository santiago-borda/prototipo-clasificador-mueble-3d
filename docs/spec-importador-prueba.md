# Especificación — Importador de prueba (.dae + CSV) con guardado en el servidor

Estado: **decisiones cerradas el 20/10; pendiente solo la implementación** (las pruebas se escriben en un chat aparte). `CLAUDE.md` ya refleja las reglas matizadas. No hay código todavía. Antecedente: `docs/spec-siguiente-paso.md` (Olmo y Sabrina como fixtures, criterios A1–A9).

## Contexto
Hoy cada mueble se carga a mano: el .dae va a `public/models/` y la tabla de piezas se transcribe a un `FurnitureDef`. Casa Mueble tiene que poder subir por sí misma un .dae y un CSV con el listado de piezas, ver el mueble en el visor 3D con su ficha, y compartir el link, **sin intervención del equipo**.

Es una **prueba**. Los formatos del CSV y del listado definitivo quedan para después (ver "Fuera de alcance"); el importador real se especifica aparte cuando los datos estén ajustados.

## Decisiones tomadas (19–20/10)
| # | Decisión | Quién |
|---|---|---|
| D1 | Los archivos se guardan en el servidor. | Usuario |
| D2 | Almacenamiento: **Vercel Blob privado**, sin base de datos SQL. | Usuario, a propuesta |
| D3 | La carga exige una **clave compartida** (`IMPORT_UPLOAD_KEY`). No hay cuentas ni middleware de auth. | Usuario |
| D4 | Las importaciones **se pueden borrar** (con la clave). | Usuario |
| D5 | Plan gratuito de Vercel. Blob: 1 GB de almacenamiento, 10 GB de transferencia al mes, 10.000 operaciones simples al mes, 2.000 avanzadas (cifras informadas por el usuario el 20/10; no verificadas en la documentación). | Usuario |
| D6 | Para la prueba el CSV usa `M01` en todos los códigos, como el .dae. Los cambios de nomenclatura los hará Casa Mueble después. | Usuario |
| D7 | La clave la guarda el usuario y no se cambia hasta que él decida. | Usuario |
| D8 | `CLAUDE.md` se matiza (hecho el 20/10): almacenamiento de archivos sí, base de datos no; escritura con clave. | Usuario |
| D9 | Las medidas generales del mueble (`Furniture.dimsMm`) no vienen en el CSV: salen de la **caja de las piezas del .dae**, calculada en el navegador al validar (mm, redondeadas) y guardadas en `mueble.json`. `buildFurnitureDef` las recibe como parámetro obligatorio, sin valor por defecto. Es el mismo criterio que Sabrina ("medidos del .dae"). El servidor no las recalcula (no valida el .dae). | A propuesta, a confirmar |
| D10 | El `Furniture.id` y el nombre del mueble importado llevan el prefijo `prueba-<importId8>` (el `mueble_id` del CSV, `olmo`, choca con el Olmo real). Dos importaciones del mismo CSV tienen que poder convivir en un registro. | A propuesta, a confirmar |

## Reglas del proyecto que cambian
`CLAUDE.md` hoy dice "Sin CI, DB, auth" y "No agregar middleware/proxy de auth". Esta especificación las matiza, y al implementar se actualiza `CLAUDE.md` (con OK del usuario):
- Hay **almacenamiento de archivos** (Blob), no base de datos.
- La **lectura** sigue abierta, por link con id no adivinable y `noindex`.
- La **escritura** (subir, listar, borrar) exige la clave compartida, comprobada **dentro de cada handler de ruta**. No se agrega middleware ni proxy de auth.
- Sin las variables de entorno, la app funciona como hoy (solo Olmo y, en local, Sabrina).

## Alcance
1. Pantalla `/importar`: elegir .dae y CSV, ingresar la clave, ver el informe de validación, subir y obtener el link.
2. Validación en el navegador **antes** de subir (CSV, armado del mueble, cruce con el .dae). Un CSV con errores bloquea la subida.
3. Revalidación del CSV en el servidor al registrar la importación.
4. Pantalla `/prueba/<id>`: mismo visor 3D y fichas que `/p/<qrId>`, con el mueble importado.
5. Lista de importaciones y borrado (con clave).

## Fuera de alcance
- Formato definitivo del CSV y listados exactos (se decide después con Casa Mueble).
- Tabla de equivalencias entre códigos de pieza distintos (`codigo_actual` / `codigo_corregido`): el CSV de prueba trae **un** código y el .dae tiene que coincidir. Si no coincide, el informe lo dice.
- Usuarios, permisos, historial de versiones, base SQL.
- Texturas y resaltado izquierda/derecha.
- QR imprimibles de muebles importados (los qrId existen, pero la hoja `/qr` no los incluye).
- Validación del .dae en el servidor (necesitaría `DOMParser` en Node): se valida solo en el navegador y el informe lo registra.

## Contrato de datos

### Identificadores
- `importId`: 16 caracteres hexadecimales aleatorios (no adivinable). Es el id público del link.
- qrId de lo importado: `prueba-<importId8>-mueble`, `prueba-<importId8>-mod-<n>`, `prueba-<importId8>-c<NN>` (`importId8` = los primeros 8 caracteres). El prefijo evita colisiones con Olmo y con Sabrina, y el registro lo asegura (`createRegistry`).

### Archivos por importación (Blob, acceso privado)
| Ruta | Contenido |
|---|---|
| `importaciones/<importId>/modelo.dae` | .dae tal cual lo subió el usuario |
| `importaciones/<importId>/listado.csv` | CSV tal cual |
| `importaciones/<importId>/mueble.json` | `FurnitureDef` ya armado (sin `modelUrl`) |
| `importaciones/<importId>/informe.json` | Informe de validación y metadatos (nombres de archivo, tamaños, `validadoEn: "cliente"` para el .dae) |

Nunca se sobrescribe: cada subida crea un `importId` nuevo.

### Rutas
| Ruta | Clave | Función |
|---|---|---|
| `POST /api/importaciones/token` | sí | Entrega el token de subida directa al Blob (límites de extensión y tamaño). |
| `POST /api/importaciones` | sí | Registra la importación: lee el CSV del Blob, lo revalida, arma y guarda `mueble.json` e `informe.json`. |
| `GET /api/importaciones` | sí | Lista las importaciones (id, mueble, estado, fecha). |
| `GET /api/importaciones/<id>` | no | Devuelve `mueble.json` e `informe.json`. |
| `GET /api/importaciones/<id>/modelo` | no | Sirve el .dae (transmite el Blob privado). |
| `DELETE /api/importaciones/<id>` | sí | Borra los cuatro archivos. |

La clave viaja en el encabezado `x-import-key` y se compara en tiempo constante. Nunca va en la URL.

### Parámetros (ajustables)
- .dae: máximo 10 MB, extensión `.dae`. CSV: máximo 1 MB, extensión `.csv`.
- Máximo de importaciones guardadas: 50. Con archivos de cientos de KB el 1 GB alcanza de sobra; el tope protege más las 10.000 operaciones simples al mes (cada importación gasta unas diez: subidas, registro, lecturas y listado). Al llegar, `POST` responde error claro.
- Tolerancia de medidas: 2 mm (`FurnitureDef.toleranceMm`).

## Requisitos
- **R1.** El lector de CSV acepta UTF-8 con o sin BOM, separador `,` o `;`, y decimal con punto (con coma, lo acepta y avisa). Sin dependencias nuevas.
- **R2.** Cada error de validación indica **fila y columna**. Es error: columna obligatoria faltante, número inválido, valor distinto de SI/NO en un canto, cantidad de valores en `instancias` distinta de `cantidad`, código repetido, `canto = SI` sin tipo, ancho o espesor. Es advertencia: columna desconocida, coma decimal.
- **R3.** El armado del `FurnitureDef` usa la convención ya asumida (largo 1 = `largo-A`, largo 2 = `largo-B`, corto 1 = `corto-A`, corto 2 = `corto-B`). Los módulos salen de `modulo_nro` y `modulo_nombre`.
- **R4.** El cruce con el .dae reutiliza `verifyModel` y `checkAssociation`. El resultado se muestra en pantalla y define el estado: **bloqueado** (errores del CSV), **con advertencias** (huérfanas, cantidades o medidas fuera de tolerancia) o **correcto**.
- **R5.** Un informe con advertencias se puede subir; uno bloqueado no.
- **R6.** Los módulos de validación, lectura y armado son **funciones puras, sin React ni three**, y las usan el cliente y el servidor.
- **R7.** El almacenamiento está detrás de una interfaz `ImportStore` con tres implementaciones: Vercel Blob, disco local (`.import-data/`, ignorada por git) para desarrollo, y memoria para las pruebas.
- **R8.** `/prueba/<id>` es una página de cliente: busca la importación, la registra en el navegador (fuente adicional de `lookup.ts`, vacía en el servidor) y muestra el visor y las fichas de siempre. No hay estado compartido en el servidor entre peticiones.
- **R9.** Sin `BLOB_READ_WRITE_TOKEN` o sin `IMPORT_UPLOAD_KEY`, `/importar` muestra "importación no configurada" y las rutas de escritura responden 503. Nada más cambia.

## Criterios de aceptación y pruebas
Una prueba por criterio, en `tests/importador*.test.ts`, con el `ImportStore` en memoria (sin red).

| # | Criterio | Prueba |
|---|---|---|
| I1 | El CSV de ejemplo v2 se lee: 21 filas, 33 instancias. BOM, `;` y coma decimal funcionan. | automática |
| I2 | Cada error de R2 se informa con fila y columna; una advertencia no bloquea. | automática |
| I3 | El `FurnitureDef` armado tiene los módulos y los cantos esperados, qrId con prefijo `prueba-`, y pasa `createRegistry` junto a Olmo. | automática |
| I4 | Con el CSV de prueba con todos los códigos en `M01` (D6) y el `olmo.dae` actual, el informe queda **correcto**. Con el CSV v2 original (`M02`/`M03` en 14 piezas), el informe señala 14 tipos sin instancias y 24 instancias huérfanas (el .dae tiene 33 y solo 9 pertenecen a los 7 tipos que siguen en `M01`: C01–C03 y C16–C19): es el fixture del caso de desajuste. | automática, dos fixtures |
| I5 | Olmo sin regresiones: pasan A1–A9, `olmo.test.ts` y `registry.test.ts`. | existentes |
| I6 | Sin clave, o con clave incorrecta, las rutas con clave devuelven 401. Con clave, la importación se guarda y se lee por id. | automática |
| I7 | Un id inexistente devuelve 404 en lectura y en modelo. | automática |
| I8 | El servidor rechaza un CSV inválido aunque el cliente lo haya aceptado. | automática |
| I9 | Se rechazan extensiones y tamaños fuera de los límites, y la importación número 51. | automática |
| I10 | Sin las variables de entorno la app funciona como hoy, y las rutas de escritura responden 503. | automática |
| I11 | Borrar elimina los cuatro archivos y la importación desaparece de la lista. | automática |
| I12 | Ningún archivo importado ni dato de Sabrina entra al repo, a `public/` ni al build. Las pruebas usan solo fixtures de Olmo. | revisión de `git status` y del build |
| I13 | Con los archivos reales: subir en `/importar`, abrir el link en otro navegador, ver el 3D, resaltar una pieza y abrir su ficha. | manual |

Verificación final: `npm run typecheck && npm run lint && npm test && npm run build`. El aviso "Module not found ../../Sabrina/data/sabrina.def" sigue siendo esperado sin la carpeta.

## Pendientes que bloquean (no suponer)
1. **Cuota del plan gratuito de Vercel Blob.** Las cifras de D5 las informó el usuario y no las pude comprobar en la documentación; se contrastan con el panel de Vercel antes de crear el store.
2. **Crear el store de Blob y definir `BLOB_READ_WRITE_TOKEN` e `IMPORT_UPLOAD_KEY` en Vercel** son acciones hacia afuera: las hace el usuario o se piden explícitamente.
3. **API de `@vercel/blob`.** Los nombres usados aquí (`put`/`get` con `access: "private"`, subida directa con `upload` y `handleUpload`) salen de la documentación de Vercel consultada el 20/10. Se vuelven a leer en el momento de implementar. Dependencia nueva: `@vercel/blob`.
4. **Next 16.** Antes de escribir los handlers de ruta se lee `node_modules/next/dist/docs/` (AGENTS.md).
5. **Titularidad de archivos de otros clientes.** Casa Mueble puede subir archivos de clientes (como el de Sabrina). Quién puede subir qué y por cuánto tiempo no está definido. Mientras tanto: acceso privado, borrado disponible y `noindex`.
6. ~~Quién guarda la clave y cada cuánto se cambia.~~ Resuelto (D7): la guarda el usuario y no se cambia hasta que él decida. Falta solo definir cómo se la entrega a Casa Mueble.
7. ~~Conflicto de códigos `M02`/`M03`.~~ Resuelto para la prueba (D6): `M01` en todo. La nomenclatura definitiva queda para el importador real.

## Orden de trabajo
1. Revisión de esta especificación (este documento).
2. ~~Actualizar `CLAUDE.md` con las reglas matizadas.~~ Hecho el 20/10 (sección "Importador de prueba" y "Despliegue").
3. Pruebas que fallan (I1–I4, I6–I11), fixtures y módulos puros.
4. `ImportStore` (memoria, disco local, Blob) y handlers de ruta.
5. `lookup.ts` con la fuente adicional, y las páginas `/importar` y `/prueba/<id>`.
6. Verificación final y prueba manual (I13).
7. Crear el store y desplegar: a pedido del usuario.
