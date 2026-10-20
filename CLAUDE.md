# CLAUDE.md

@AGENTS.md

## Qué es esto
**Prototipo — vista previa.** Vista previa temprana de la pantalla que vería un operario al escanear el QR de una pieza (`/p/[qrId]`). **No fija el stack del proyecto**: Next.js, R3F, Zustand y Tailwind se eligieron solo para este prototipo. No sobreingenierizar.

## Mock vs. asumido
- **Mock** (`src/data/furniture.mock.ts`): Escritorio Olmo (1200 x 750 x 550 mm), **21 tipos de pieza / 33 instancias** con nombres, medidas, cantidades y materiales tomados del listado de Casa Mueble del 9/10. Canto ABS 22 x 0,45 mm (provisorio; la lista de compra dice 0,22). La gola horizontal (404 x 36) es provisoria.
- **ASUMIDO PARA EL PROTOTIPO — a confirmar con Casa Mueble**:
  - Qué bordes concretos llevan canto (el listado solo dice cuántos largos/cortos) y los ids de borde `largo-A/B`, `corto-A/B`.
  - La agrupación en módulos (`mod-escritorio` = C01, C02, C03, C16–C19; `mod-cajones` = C04–C15, C20, C21). El código lleva `M01` en todas las piezas, así que no sirve para agrupar.
  - Mostrar solo el último segmento del código ("C04") en listas y menús (`shortCode` en `model/ids.ts`). La ficha muestra el código completo como "N° de pieza". No se interpreta el significado de los segmentos.
  - La orientación del esquema de canteado (largo A arriba, corto A a la izquierda; esquina de referencia arriba a la izquierda).
- **Código de pieza**: es el nombre del componente del .dae sin `_` inicial ni finales: `0001-01-M01-C04` (formato `/^\d{4}-\d{2}-M\d{2}-C\d{2}$/`, ver `src/model/ids.ts`). El componente C01 viene como `_0001-01-M01-C01__` (guiones bajos de más): se normaliza y la verificación de desarrollo lo informa como anomalía. `instanceId` = `<código>#<n>`.
- **Simulado**: `src/data/mapping.ts` simula la regla exacta por código del futuro motor de asociación: un tipo de pieza se asocia a las instancias con su mismo código, **siempre dentro de un mismo mueble** (ver "Varios muebles"). No hay tabla escrita a mano. `checkAssociation` verifica que cada instancia la reclame exactamente un tipo y que cada tipo reclame `quantity` instancias (criterio A4). No hay niveles de certeza: eso queda para el motor real.
- **Modelo 3D real**: `public/models/olmo.dae` (export de SketchUp, pulgadas, Z arriba): 21 componentes `_0001-01-M01-Cxx`, 33 instancias, **sin herrajes**, ~700 triángulos (696). `src/model/` lo carga con `ColladaLoader` y lo convierte en partes: una por instancia de componente (ver `colladaModel.ts`). `namedColladaLoader.ts` recupera los nombres de componente que three pierde al importar. El archivo trae además 6 geometrías sueltas de 20 x 35 x 10 mm (material `Color_M06`, sin identificar) que no cuelgan de ningún componente con código: el prototipo las ignora.
- **Verificación de desarrollo** (`src/model/verifyModel.ts`, función pura; se llama desde `useFurnitureModel.ts` solo con `NODE_ENV !== "production"` y escribe en la consola, sin UI): por tipo, (a) cantidad de instancias == listado, (b) caja de la geometría == largo x ancho x espesor (tolerancia por mueble, `FurnitureDef.toleranceMm`: 2 mm Olmo, 0,5 mm Sabrina), (c) formato del código, (d) códigos únicos en el listado. Informa además el desvío máximo, la asociación (A4) y lo excluido del .dae (`FurnitureModel.excluded`: líneas sueltas y mallas sin código). Esperado Olmo: 21 tipos, 33 instancias, 0 advertencias, 1 anomalía (el `__` de C01), 6 mallas sin código y 0 líneas. Esperado Sabrina: 29 tipos, 105 instancias, 0 advertencias, 0 anomalías, 0 mallas sin código y 24 líneas.
- QR en tres niveles con **prefijo de mueble** (mueble `olmo-mueble`, módulos `olmo-mod-*`, piezas `olmo-cNN`, ej. `olmo-c04`; Sabrina: `sabrina-mueble`, `sabrina-mod-*`, `sabrina-cNN`), todos en `/p/<qrId>` (`resolveQr` en `lib/lookup.ts`, que busca en todos los muebles registrados). `/qr` genera los códigos reales con la librería `qrcode`, agrupados por mueble.

## Varios muebles (registro por mueble)
- **Colisión de códigos**: Olmo y Sabrina comparten `0001-01-M01-C01..C15` (la cómoda de Sabrina usa los mismos 15 códigos). Una búsqueda global por código ligaría piezas de Sabrina a fichas de Olmo. **Solución**: registro por mueble. Todo cuelga de un `FurnitureDef` (`data/types.ts`: mueble, módulos, tipos de pieza, `modelUrl`, `toleranceMm`); `data/registry.ts` (`createRegistry`) valida que los qrId sean únicos entre muebles y que cada pieza apunte a un módulo existente; `lib/lookup.ts` resuelve qrId -> mueble y `getPieceByInstanceId(def, instanceId)` busca solo dentro del mueble. Un código solo se interpreta dentro de su mueble. El visor carga el modelo del mueble del QR activo (`useActiveFurniture`) y reencuadra la cámara según su ancho.
- **Sabrina** (cómoda + 2 mesas de luz, clienta de Casa Mueble; 29 tipos, 105 instancias, 2953 x 1000 x 403 mm medidos del .dae): **local, no se sube a GitHub** (titularidad y uso del archivo pendientes con Casa Mueble). Vive en la carpeta ignorada `Sabrina/` (.dae, texturas y `Sabrina/data/sabrina.def.ts` con la tabla de piezas transcripta del listado, verificada contra el .dae). Se registra solo si `NEXT_PUBLIC_ENABLE_SABRINA=1` (poné la variable en `.env.local`) y la carpeta existe (`data/optionalFurniture.ts`); el .dae lo sirve `/api/private-models/sabrina` (404 sin la variable). **No mover nada de eso a `public/`, `src/` ni a un commit**; no definir la variable en Vercel. Sin la carpeta o sin la variable, todo funciona solo con Olmo (el build muestra un aviso "Module not found ../../Sabrina/data/sabrina.def": esperado).
- **Sin texturas** (opción A): el visor usa sus propios materiales; `skipTextures` ignora jpg/png. Las rutas de textura del .dae de Sabrina están rotas (apuntan a `Comoda%20y%20mesas...Collada/Cedro.jpeg`, están en `Texturas/`) y no importan mientras no se muestren.
- Códigos de Sabrina: M01 = C01–C15, M02 = C16–C29 (`0001-01-M01-Cxx`, `0001-02-M02-Cxx`). **Qué significan los segmentos sigue SIN confirmar con Casa Mueble**; no se interpretan.
- **ASUMIDO PARA EL PROTOTIPO (Sabrina)**: qrId de mueble y de módulo y nombres de módulo (R6 abierto); módulos "Cómoda" / "Mesas de luz" salen de los nombres del listado, no del código. Las dos mesas de luz no se distinguen por código (cada código aparece una vez por mesa): resaltar "izquierda/derecha" queda fuera de alcance. Canto de Sabrina ABS 22 x 0,22: **confirmado por Casa Mueble el 16/10, a contrastar con factura o rollo** (los PDF dicen "~0 x 22").
- **Canteado de Sabrina — ASUMIDO PARA EL PROTOTIPO** (leyenda del equipo, sin confirmar con Casa Mueble; consulta 2, origen del canteado): sale de la columna "Tiras de cantos" de los PDF, con la leyenda 1 = inferior, 2 = superior, 3 = izquierdo, 4 = derecho, mapeada a `EdgeId` con la convención de Olmo (esquema 2D: superior = `largo-A`, inferior = `largo-B`, izquierdo = `corto-A`, derecho = `corto-B`). 25 piezas llevan canto; los 4 fondos de 3 mm son `[]` (dato real). Está en `Sabrina/data/sabrina.def.ts` (tabla `LADOS`). "Largo" es el borde que mide `lengthMm` y "corto" el que mide `widthMm`: en las piezas con largo < ancho del listado (C04, C05, C08, C09, C21–C24) el borde "corto" es el largo físico; por eso `computeEdgeLayout` recibe las medidas del listado (sin ellas tomaba el eje más largo y marcaba el borde equivocado en esas piezas). `PieceType.edgeBanding` sigue siendo `EdgeId[] | null` (`null` = sin dato, `[]` = sin canto); la ficha muestra "Canto: pendiente" para `null`.

## Pruebas (`npm test`, vitest + jsdom)
Una prueba por criterio de aceptación de la especificación de Sabrina, en `tests/`: A1 carga y conteos (29 códigos, 105 instancias), A2 medidas contra listado (0,5 mm; distingue "final" de "ajustado"), A3 exclusiones (24 líneas, 0 mallas sin código), A4 asociación exacta, A5 colisión Olmo/Sabrina, A6 Olmo sin regresiones (`olmo.test.ts`), A7 sin Sabrina presente (`registry.test.ts`; `sabrina.test.ts` se saltea si falta `Sabrina/`), A8 canteado completo y con tantos lados largos/cortos como caras de canto (`Canto_*`) hay en el .dae, instancia por instancia (`tests/helpers/edgeFaces.ts`), A9 los bordes marcados en el 3D miden `lengthMm` (largos) y `widthMm` (cortos). S2 totales por material (50 + 42 + 13 = 105) contra constantes documentadas en `sabrina.test.ts` (sin leer los PDF: la transcripción salió de ellos y se cruzó con el .dae), más un cruce con el .dae por espesor (13 de 3 mm, 92 de 18 mm). Estado: S1 y S2 hechos; texturas y mesa izquierda/derecha descartadas por ahora; el motor de asociación con certeza y el Eval Harness se especifican aparte. Siguiente paso y pendientes: `docs/spec-siguiente-paso.md`. `registry.test.ts` incluye A5 con un mueble sintético (corre siempre). Sabrina y Olmo son los dos fixtures: caso limpio y caso con anomalías.
- Escáner dentro de la app: pestaña "Escanear QR" (`/escanear`, `QrScanner.tsx`, lib `jsqr`). Lee la cámara, acepta la URL de la etiqueta o un qrId suelto (`lib/qrScan.ts`) y navega a `/p/<qrId>` con `router.push` (las fichas se precargan). La cámara exige https o localhost. También se entra por la cámara nativa del celular, por URL o desde la lista de `/`.

## Rendimiento en celular (no deshacer sin medir)
- Geometría: 33 paneles (~700 triángulos). El .dae ya no trae herrajes (antes ~214.000 triángulos): no volver a cargar geometría de detalle sin medir.
- `frameloop="demand"`: solo se dibuja cuando algo cambia. La sombra de contacto se hornea una vez (`frames={1}`).
- Hover (cursor, color, cartel) solo con mouse (`CAN_HOVER` en `PartMesh.tsx`); en táctil solo hay click.
- El visor usa `svh` (no `dvh`) para que la barra del navegador de iOS no redimensione el canvas al hacer scroll, y los controles superpuestos no usan `backdrop-blur`.
- `antialias` se desactiva con `devicePixelRatio >= 2`.

## Correr
```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # accesible desde el celular en la misma wifi
npm run typecheck && npm run lint && npm test && npm run build
```

## Despliegue (Vercel)
- Vercel desde GitHub (`main`, Next.js autodetectado). Sin CI, base de datos, cuentas de usuario ni dominio propio. Desde el importador de prueba hay **almacenamiento de archivos** (Vercel Blob privado), no base de datos (ver "Importador de prueba").
- `NEXT_PUBLIC_BASE_URL` (ver `.env.example`): URL estable de producción, sin `/` final. `QrSheet.tsx` la usa como base de los QR y cae a `window.location.origin` si falta. Se inlinea en build: cambiarla exige redesplegar. `.env*` está en `.gitignore` salvo `.env.example`.
- Sabrina no se despliega (ver "Varios muebles"): en Vercel la variable `NEXT_PUBLIC_ENABLE_SABRINA` queda sin definir y la carpeta `Sabrina/` no existe (está en `.gitignore`).
- **No renombrar el proyecto de Vercel una vez impresos los QR** (cambia la URL y rompe los impresos).
- Lectura abierta a propósito (sin login). `public/models/olmo.dae` es público para quien tenga la URL. `src/app/robots.ts` (`Disallow: /`) y `X-Robots-Tag: noindex, nofollow` (`next.config.ts`) evitan la indexación, no dan control de acceso. No agregar middleware/proxy de auth ni cuentas de usuario.
- **Excepción acotada: escritura del importador.** Subir, listar y borrar importaciones exige la clave compartida `IMPORT_UPLOAD_KEY`, comprobada **dentro de cada handler de ruta** (encabezado `x-import-key`, comparación en tiempo constante, nunca en la URL). No es un sistema de usuarios ni un middleware; leer una importación sigue siendo por link con id no adivinable. La clave la guarda y la cambia solo el responsable del proyecto.

## Importador de prueba (.dae + CSV, guardado en el servidor)
**Estado: especificado, sin implementar.** Especificación y criterios I1–I13 en `docs/spec-importador-prueba.md`; las pruebas se escriben en un chat aparte. Lo que dice el código hoy no incluye todavía nada de esto.
- Qué es: Casa Mueble sube un .dae y un CSV con el listado de piezas (`/importar`), ve el informe de validación y obtiene un link (`/prueba/<id>`) con el mismo visor 3D y fichas. **Es una prueba**: el formato definitivo del CSV y del listado se decide después con Casa Mueble, y el importador real se especifica aparte.
- Almacenamiento: **Vercel Blob privado**, sin base SQL. Cuatro archivos por importación (`importaciones/<importId>/modelo.dae`, `listado.csv`, `mueble.json`, `informe.json`); nunca se sobrescribe. La subida va directo del navegador al Blob (`@vercel/blob`, dependencia nueva). Plan gratuito: 1 GB de almacenamiento, 10 GB de transferencia al mes, 10.000 operaciones simples al mes (cifras informadas por el usuario el 20/10, no verificadas en la documentación); tope provisorio de 50 importaciones.
- Variables de entorno (solo en Vercel y en `.env.local`, nunca en el repo): `BLOB_READ_WRITE_TOKEN` (la crea Vercel al conectar el store) e `IMPORT_UPLOAD_KEY`. Sin ellas la app funciona como siempre (solo Olmo) y `/importar` dice "importación no configurada".
- Los qrId importados llevan prefijo `prueba-<importId8>-` y no pueden chocar con Olmo ni Sabrina (`createRegistry`). El mueble importado se registra solo en el navegador (`lookup.ts` tendrá una fuente adicional vacía en el servidor): la generación estática de `/p/<qrId>` no cambia.
- El .dae se valida solo en el navegador; el servidor revalida el CSV con los mismos módulos puros. Las pruebas usan un almacenamiento en memoria (sin red) y solo fixtures de Olmo: **ningún archivo importado ni dato de Sabrina entra al repo**.
- Códigos: el CSV de prueba trae un solo `codigo` por pieza y tiene que coincidir con el del .dae. Mientras tanto se usa `M01` en todas las piezas; los cambios de nomenclatura los hará Casa Mueble después. Si no coinciden, el informe lo dice (no hay tabla de equivalencias).
- Importaciones de otros clientes: la titularidad de esos archivos sigue pendiente. Acceso privado, borrado disponible y `noindex`.

## Notas
- Next 16: leer `node_modules/next/dist/docs/` antes de usar APIs de Next (ver AGENTS.md).
- `cacheComponents` está desactivado a propósito (simplicidad del prototipo).
- Para ver el aviso "Hay una versión más nueva de este diseño": `newerVersionAvailable: true` en `furniture.mock.ts`.

## Dashboard de la tesis
Seguimiento visual en `dashboard.html` (autónomo, un solo archivo; se abre con doble clic). **No editar `dashboard.html` a mano**: se genera. **Es local: `dashboard.html` y `dashboard/` están en `.gitignore` y no se suben a GitHub.** No los agregues a un commit (ni con `git add -f`).
- `dashboard/datos.json`: contenido curado (áreas, consultas 1–44, bloqueos, pasos, hitos). Es lo único que cambia al actualizar.
- `dashboard/plantilla.html`: diseño (HTML + CSS + JS). Cambiarlo solo si se pide un cambio de diseño.
- `dashboard/generar.mjs`: une plantilla + datos, guarda el hash de las fuentes. `npm run dashboard` genera, `npm run dashboard:check` dice si los .md cambiaron, `npm run dashboard:ver` sirve en `http://localhost:4173` y el dashboard avisa solo cuando cambian los .md o el HTML.

**Cuando el usuario diga «actualiza el dashboard de la tesis»:**
1. Leer `ESTADO.md`, `docs/Consultas y respuestas Casa Mueble y cátedra.md` y el PDF de la tesis `docs/PFG-Muebles3D-v2.pdf` (o la versión más nueva; ajustar `fuentes` en `datos.json`). Si falta alguno, pedir la ruta; no inventar.
2. Actualizar `dashboard/datos.json` con lo que dicen las fuentes (capítulos: `documento.capitulos[].secciones[].s` = hecho si está redactada sin pendientes marcados, parcial si tiene pendientes o datos por confirmar, pendiente si solo describe el método; `correcciones` = diferencias entre el PDF y ESTADO.md o las consultas): estado de cada consulta (`e`: cerrada, reunion, salvedad, parcial, sin, nueva), ítems de cada área (`s`: hecho, parcial, pendiente), bloqueos, pasos, hitos (con commits de `git log`) y cifras de `prototipo`. Los porcentajes no se escriben: se calculan (hecho = 1, parcial = 0,5; consultas = cerradas / total; global = promedio de las áreas).
3. Ejecutar `npm run dashboard` y resumir al usuario qué cambió (consultas que cambiaron de estado, bloqueos nuevos o resueltos, variación del global).
4. Si algo del .md contradice a `datos.json` o es ambiguo, decirlo; no resolverlo en silencio.
