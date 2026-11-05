# Estado del prototipo — Escritorio Olmo (ficha de pieza + visor 3D + importador de prueba)

Fecha: 5/11/2026 · Rama: `pdf-esquema-sesion-1` · Último commit (HEAD al 5/11, 14:52): `afb6233`

## Qué es

Vista previa temprana de la pantalla que vería un operario al escanear el QR de una pieza: ficha con los datos de fabricación y visor 3D del mueble con la pieza resaltada. Incluye un importador de prueba (descartable) para que Casa Mueble suba un `.dae` y un listado CSV y los vea cargados en 3D. **No fija el stack del proyecto** (Next.js 16, TypeScript, Tailwind, React Three Fiber, drei y Zustand se eligieron solo para el prototipo).

## Qué funciona hoy

| Función | Ruta | Detalle |
|---|---|---|
| Escanear QR | `/escanear` | Cámara trasera + `jsqr`. Acepta la URL de la etiqueta o un id suelto (`olmo-c04`). Si el QR no es del mueble, avisa y sigue escaneando. |
| Lista de piezas | `/` | Todos los QR del mueble: mueble, módulos y tipos de pieza. (Ver supuesto 7: Casa Mueble confirmó que solo las piezas tienen QR.) |
| Ficha | `/p/<qrId>` | Tres niveles: **pieza** (código, medidas, espesor, material, cantidad, esquema de canteado, observaciones), **módulo** (sus tipos de pieza, todas resaltadas en 3D) y **mueble** (medidas generales, versión, módulos). |
| Visor 3D | dentro de la ficha | `.dae` real. Modos Resaltar / Aislar / Atenuar, marcas de canto, punto de esquina de referencia, interruptor "Con ficha", menú de piezas, click en un panel abre su ficha. Se mantiene al cambiar de ficha. |
| QR para imprimir | `/qr` | Genera los QR reales (librería `qrcode`) de mueble, módulos y piezas. (Ver supuesto 7.) |
| Importador de prueba | `/importar` | Sube un `.dae` y un `listado.csv` a Vercel Blob privado y genera un informe. Se lee por `/prueba/<id>`. Ver sección "Importador de prueba". |
| Aviso de versión | fichas | "Hay una versión más nueva de este diseño" (se activa con `newerVersionAvailable: true` en el mock). |

QR del prototipo en tres niveles: `olmo-mueble`, `olmo-mod-escritorio` / `olmo-mod-cajones`, `olmo-c01` … `olmo-c21`.

## Datos

- **Mock** (`src/data/furniture.mock.ts`): Escritorio Olmo 1200 × 750 × 550 mm, **21 tipos de pieza / 33 instancias**, con nombres, medidas, cantidades y materiales del listado de Casa Mueble del 9/10.
- **Modelo 3D real** (`public/models/Olmo/olmo.dae`, export de SketchUp): 21 componentes, 33 instancias, sin herrajes, ~700 triángulos (696).
- **Código de pieza**: nombre del componente sin `_` inicial/final, formato `0001-01-M01-C04`. `instanceId` = `<código>#<n>`.
- **Asociación simulada** (`src/data/mapping.ts`): un tipo se asocia a las instancias con su mismo código (regla exacta por código, sin tabla a mano).
- **Verificación de desarrollo** (`src/model/verifyModel.ts`, solo fuera de producción, salida por consola): cantidad de instancias, caja de la geometría vs. medidas (tolerancia 2 mm) y formato del código. Esperado: 21 tipos, 33 instancias, 0 advertencias, 1 anomalía.

## Importador de prueba (5/11/2026)

- `/importar` sube a **Vercel Blob privado** cuatro archivos por importación: `importaciones/<importId>/modelo.dae`, `listado.csv`, `mueble.json` e `informe.json`. Nunca se sobrescribe; tope provisorio de 50 importaciones.
- El navegador sube directo al Blob con `@vercel/blob`, sin pasar por el servidor. Por eso `/importar` necesita el token real; `IMPORT_STORE=local` (guarda en `.import-data/`) solo vale para la API.
- El `.dae` se valida solo en el navegador. El servidor revalida el CSV con los mismos módulos puros (`listing`, `buildDef`, `dims`, `report`).
- Subir, listar y borrar exigen la clave `IMPORT_UPLOAD_KEY` en el encabezado `x-import-key`. Leer una importación es por el link `/prueba/<id>`, con un id no adivinable.
- Si faltan `BLOB_READ_WRITE_TOKEN` o `IMPORT_UPLOAD_KEY`, la app funciona solo con Olmo y `/importar` dice "importación no configurada".
- **I13 (prueba manual con archivos reales): HECHA el 5/11** con el `.dae` y el `listado.csv` del Olmo, en producción. Se ven el modelo 3D y el CSV en `/prueba/<id>` y las cuatro piezas quedaron en el Blob. No se usó el PDF: este flujo no ejercita la extracción (B).
- **Credenciales de Vercel (5/11):** `BLOB_READ_WRITE_TOKEN` rotado y pasado a Sensitive (Production y Preview). Redeploy de producción y prueba de importación posteriores OK. La segunda rotación fue sin demora y anterior al redeploy: los tokens previos (incluido el que tenía vencimiento diferido a las 23 hs) quedaron revocados al instante y la prueba de importación posterior funcionó con el token nuevo.
- Pendiente: borrar del Blob las importaciones de prueba (`db832fcb6ed62e97` y la última).

## Supuestos pendientes de confirmar con Casa Mueble

1. **Qué bordes llevan canto** (el listado del Olmo solo dice cuántos largos y cuántos cortos) y los ids de borde `largo-A/B`, `corto-A/B`. Los PDF de OpenCutList con canto definido (Sabrina) traen las marcas por lado; los de Olmo no (reexportar con canto definido, pendiente).
2. **Agrupación en módulos** (en revisión): `mod-escritorio` = C01, C02, C03, C16–C19; `mod-cajones` = C04–C15, C20, C21. El `M01` del código es igual en todas las piezas y no sirve para agrupar. Casa Mueble dice que el Olmo es un único módulo M01 (consulta 42), pero el prototipo lo agrupa en dos. "Sector cajones" es solo el nombre del módulo de cajones.
3. **Mostrar solo el último segmento del código** ("C04") en listas y menús; la ficha muestra el código completo como "N° de pieza". No se interpreta el significado de los segmentos.
4. **Orientación del esquema de canteado**: largo A arriba, corto A a la izquierda, esquina de referencia arriba a la izquierda.
5. **Canto ABS 22 × 0,22 mm**: confirmado por Casa Mueble el 16/10 (contrastar con la factura o el rollo). El 0,45 venía del optimizador online anterior: no usarlo. *(Antes figuraba como provisorio 22 × 0,45.)*
6. **Gola horizontal 404 × 36 mm**: confirmada por Casa Mueble el 16/10. El 404 × 50 venía del optimizador online anterior: no usarlo. Provisorios: ninguno por ahora. *(Antes figuraba como provisoria.)*
7. **QR por nivel (a corregir):** el prototipo genera QR de mueble y de módulo, pero Casa Mueble confirmó el 16/10 (consulta 44) que solo las piezas tienen QR; la guía de armado del módulo o del mueble se abre desde la ficha de cualquier pieza. Pendiente: quitar los QR de mueble y módulo de `/` y `/qr` en la versión real. Falta además la captura del mensaje del 16/10 como confirmación escrita.

## Anomalías conocidas del modelo

- El componente C01 viene como `_0001-01-M01-C01__` (guiones bajos de más). Se normaliza y la verificación lo informa.
- El `.dae` trae 6 geometrías sueltas de 20 × 35 × 10 mm (material `Color_M06`) que no cuelgan de ningún componente con código; el prototipo las ignora. Sin identificar.
- Pendiente de Casa Mueble: renombrar Oslo por Olmo en el `.dae`, el `.skp` y la carpeta del paquete.

## Rendimiento en celular (no deshacer sin medir)

- Solo 33 paneles (~700 triángulos). Antes, con herrajes, eran ~214.000: no volver a cargar geometría de detalle sin medir.
- `frameloop="demand"` y sombra de contacto horneada una vez.
- Hover solo con mouse; en táctil solo click.
- Visor con `svh`, sin `backdrop-blur` en controles superpuestos.
- `antialias` desactivado con `devicePixelRatio >= 2`.

## Despliegue

- Vercel desde GitHub (`main`). Sin CI ni login; el dominio propio sigue sin definir. Base de datos: no; el importador de prueba usa Vercel Blob privado.
- `NEXT_PUBLIC_BASE_URL` define la URL base de los QR (se inlinea en build; cambiarla exige redesplegar).
- **No renombrar el proyecto de Vercel una vez impresos los QR**: cambia la URL y rompe los impresos. Los QR impresos deben apuntar al dominio de producción de Casa Mueble: no imprimir hasta definirlo (consulta 59).
- Acceso a la app y a las fichas: abierto a propósito. `robots.ts` y `X-Robots-Tag` evitan la indexación pero no dan control de acceso; el `.dae` del Olmo es público para quien tenga la URL. El importador (subir, listar, borrar) exige `IMPORT_UPLOAD_KEY`.
- Variables de entorno en Vercel: `BLOB_READ_WRITE_TOKEN` (Sensitive), `IMPORT_UPLOAD_KEY` (Secret), `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY` y `NEXT_PUBLIC_BASE_URL` (Config).
- La clave de la cuenta de servicio de Google no está en Vercel. Cuando llegue (P-15): variable Sensitive, solo de servidor, sin prefijo `NEXT_PUBLIC_`.

## Limitaciones

- La cámara del escáner exige **https o localhost**. Con `npm run dev:lan` por `http://<IP>:3000` el navegador la bloquea (usar la cámara nativa del celular o la URL `/p/<qrId>`).
- Las fichas de la app base salen del mock del Olmo; solo las importaciones de `/importar` persisten (en Blob). No hay API de negocio ni asociación real.

## Extracción OCR (Cloud Vision, 5/11)

- Prueba de humo OK (246 caracteres, 33 palabras, imagen sin datos de clientes). Valida credenciales y conectividad; **no** valida la calidad del OCR.
- Clave: cuenta de servicio con clave JSON, solo en `credentials/` y por variable de entorno. Salidas solo en `.ocr-data/`. Ambas ignoradas por git.
- Verificado el 5/11: ningún commit de las ramas locales contiene `BEGIN PRIVATE KEY` ni archivos con nombre de credencial. Falta `git fetch --all` con la misma búsqueda y buscar esa marca en GitHub web.
- **[Pendiente]** Revisar los roles de la cuenta de servicio (solo lo necesario para Vision), alerta de presupuesto y confirmar si Cloud Vision usa el contenido enviado.
- P-02: **parcial**. Credenciales y conectividad OK en local (5/11); no se probó API key; falta la prueba con una página de Sabrina (depende de P-04).
- `@google-cloud/vision`: aprobada por el equipo (commit `18daa6a`). P-12 (rasterizado) sigue abierta.
- Spec de extracción: **v0.3 aprobada por el equipo y el profesor** (`docs/spec-extraccion-pdf.md`). El spike `scripts/vision-smoke.mjs` no se commitea en `pdf-esquema-sesion-1`; la versión real irá en una rama de extracción (B).
- Abiertas: P-04 (confirmación escrita de Casa Mueble), P-12, P-15; P-02 parcial.
- Siguiente (solo anotado): fixture sintético que imite una página de OpenCutList (datos falsos) con aserciones sobre tokens conocidos; verificar en la documentación de Vision si procesa PDF directo (impacta P-12). Mientras no haya confirmación escrita de Casa Mueble para enviar PDF a APIs externas, usar solo datos sintéticos.

## Fuera de alcance (de este prototipo)

Autenticación de usuarios, base de datos y API de negocio, motor de asociación real, etiquetas, guía de armado y asociación automática de piezas. El importador de prueba es descartable.

## Cómo correrlo

```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # desde el celular en la misma wifi
npm run typecheck && npm run lint && npm run build
```

Para probar la API del importador en local sin Blob: `IMPORT_STORE=local` (guarda en `.import-data/`, ignorada por git). `/importar` en local necesita un token propio de Blob.

## Historial reciente

- `7f6e61a` Spike: ficha de pieza con visor 3D del Escritorio Olmo
- `911dca3` Modelo .dae real, verificación de desarrollo y preparación para Vercel
- `b35ba91` Pestaña Escanear QR: lee la etiqueta con la cámara y abre la ficha
- `feb2bdd` Actualización de README con cambios
- Importador de prueba (20/10): `2309c52` spec del importador, `98b4f20` cambios en la spec y tests, `71e0582` fixtures CSV de Olmo, `f10a16e` implementación
- `c48d4d8` Mover el modelo del Olmo a `public/models/Olmo/`
- `6ddcc8e` (28/10) Spec del esquema del PDF y fixture del Olmo
- `be1e9bf` (3/11) Esquema del PDF de OpenCutList: validador y parser de texto (sesión 1 de 3)
- Vision / OCR (5/11): `18daa6a` agregar `@google-cloud/vision`, `5c9ff54` registro de la prueba de humo en la spec (P-02 parcial), `afb6233` sección Extracción OCR en CLAUDE.md y estado de P-02/P-04/P-12/P-15
- `scripts/vision-smoke.mjs` no está en el historial a propósito: es local y descartable (excluido en `.git/info/exclude`).