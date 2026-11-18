# Estado del prototipo — Escritorio Olmo (ficha de pieza + visor 3D + importador de prueba + motor de asociación)

Fecha: 17/11/2026 · Rama: `main` · Último merge verificado en GitHub (16/11): PR #10 (`4dacd48`). HEAD actual: a verificar con `git log -1` antes de commitear este archivo.

## Qué es

Vista previa temprana de la pantalla que vería un operario al escanear el QR de una pieza: ficha con los datos de fabricación y visor 3D del mueble con la pieza resaltada. Incluye un importador de prueba (descartable) para que Casa Mueble suba un `.dae` y un listado CSV y los vea cargados en 3D, y el motor de asociación explicable con su Eval Harness (todavía sin integrar a la app). **No fija el stack del proyecto** (Next.js 16, TypeScript, Tailwind, React Three Fiber, drei y Zustand se eligieron solo para el prototipo).

**Decisión del 17/11:** la subida, el visor 3D y la ficha quedan como están por ahora. Impacto en T14 y en el ajuste de QR (supuesto 7): a confirmar por el equipo.

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

Fuera de `main`: el **spike de carga por CSV y SVG** (rama `proto-csv-opencutlist`, no se mergea; ver sección propia).

## Datos

- **Mock** (`src/data/furniture.mock.ts`): Escritorio Olmo 1200 × 750 × 550 mm, **21 tipos de pieza / 33 instancias**, con nombres, medidas, cantidades y materiales del listado de Casa Mueble del 9/10. Las medidas generales están a confirmar (la caja del `.dae` mide 571 mm de profundidad, y el adapter reporta 1200 × 760 × 571 mm con el orden de ejes sin verificar).
- **Modelo 3D real** (`public/models/Olmo/olmo.dae`, export de SketchUp): 21 componentes, 33 instancias, sin herrajes, ~700 triángulos (696).
- **Código de pieza**: nombre del componente sin `_` inicial/final, formato `0001-01-M01-C04`. `instanceId` = `<código>#<n>`. Los códigos se repiten entre muebles (Olmo y Sabrina comparten `0001-01`): la asociación va siempre por (mueble, código).
- **Asociación simulada** (`src/data/mapping.ts`): un tipo se asocia a las instancias con su mismo código (regla exacta por código, sin tabla a mano). Se reemplaza por el motor real cuando se integre la corrida publicada (T14, pendiente).
- **Verificación de desarrollo** (`src/model/verifyModel.ts`, solo fuera de producción, salida por consola): cantidad de instancias, caja de la geometría vs. medidas (tolerancia 2 mm) y formato del código. Esperado: 21 tipos, 33 instancias, 0 advertencias, 1 anomalía.

## Importador de prueba (5/11/2026)

- `/importar` sube a **Vercel Blob privado** cuatro archivos por importación: `importaciones/<importId>/modelo.dae`, `listado.csv`, `mueble.json` e `informe.json`. Nunca se sobrescribe; tope provisorio de 50 importaciones.
- El navegador sube directo al Blob con `@vercel/blob`, sin pasar por el servidor. Por eso `/importar` necesita el token real; `IMPORT_STORE=local` (guarda en `.import-data/`) solo vale para la API.
- El `.dae` se valida solo en el navegador. El servidor revalida el CSV con los mismos módulos puros (`listing`, `buildDef`, `dims`, `report`).
- Subir, listar y borrar exigen la clave `IMPORT_UPLOAD_KEY` en el encabezado `x-import-key`. Leer una importación es por el link `/prueba/<id>`, con un id no adivinable.
- Si faltan `BLOB_READ_WRITE_TOKEN` o `IMPORT_UPLOAD_KEY`, la app funciona solo con Olmo y `/importar` dice "importación no configurada".
- **I13 (prueba manual con archivos reales): HECHA el 5/11** con el `.dae` y el `listado.csv` del Olmo, en producción. Se ven el modelo 3D y el CSV en `/prueba/<id>` y las cuatro piezas quedaron en el Blob. No se usó el PDF: este flujo no ejercita la extracción.
- **Credenciales de Vercel (5/11):** `BLOB_READ_WRITE_TOKEN` rotado y pasado a Sensitive (Production y Preview). Redeploy de producción y prueba de importación posteriores OK. Los tokens previos quedaron revocados al instante.
- Pendiente: borrar del Blob las importaciones de prueba (`db832fcb6ed62e97` y la última; a aclarar dónde están exactamente).

## Spike de carga por CSV y SVG (16/11/2026, rama `proto-csv-opencutlist`, descartable)

- Entrada principal **propuesta** (pendiente de prueba real con exportaciones de Olmo y Sabrina): el CSV del "Listado de piezas" y el SVG de cada placa de OpenCutList, más el `.dae` y sus texturas. El PDF leído por OCR queda como respaldo.
- Flujo: se suben los archivos, el sistema valida el CSV por reglas, lo cruza con el `.dae` y deja la carga en revisión; una persona aprueba o rechaza (con piezas dudosas solo se puede rechazar, con motivo obligatorio). La publicación es simulada: direcciones de QR como texto y etiquetas "VISTA PREVIA — NO SE IMPRIME". Sin imagen de QR escaneable hasta definir el dominio de producción.
- Spec: `docs/spec-proto-csv-ocl.md` v0.4.1 (v0.4 aprobada por el equipo el 18/11: niveles `segura` / `advertencia` / `dudosa`; las advertencias se aceptan con motivo obligatorio; v0.4.1 cierra la revisión: el servidor verifica la coherencia del cruce y el motivo tiene tope de 500 caracteres). Pruebas C1 a C17 en `tests/proto-csv/`. El 18/11 la rama tiene commits locales sin push (v0.4 y v0.4.1); el último commit pusheado y desplegado en la preview es anterior. Preview de Vercel del 16/11 (commit `fc91a27`) con la protección de despliegue activa.
- Verificación del 16/11 (worktree limpio): 741 pruebas pasan, 0 fallan, 20 salteadas (las de Sabrina) y 4 `todo`; typecheck y lint sin errores. Prueba manual M1 en la preview, hecha por Santiago: OK.
- Supuestos ASUMIDOS (reversibles) y guion de M1: ver `CLAUDE.md` y la spec.

## Motor de asociación y Eval Harness (en `main`, sin integrar a la app)

- Spec: `docs/spec-motor-asociacion.md` (v3.1; aprobada por el profesor la v3, falta informarle las enmiendas de la v3.1) y plan `docs/plan-motor-asociacion.md`.
- Mergeado a `main` el 10/11: T1 + T2 (`modelId`, `listadoId`, normalizador único), T3 + T4 (adapter `src/model/`), T5 (runner del eval), T7 mínimo (`checkDims`), T8 (pasada 1), T10 mínimo (`buildRun`) y T11 mínimo (harness, gate parcial G2, G3, G4 y publicación). PRs #3 a #8.
- Resultado sobre el Olmo (K17 y N9): 32 `segura`, 1 `dudosa` (C01, `nombre-anomalo`) y 6 `sin-asociar`. Última verificación informada: 624 pruebas pasan y 4 `todo` (TP-23, TP-55, TP-70 y M13).
- `npm run eval` sale con código 1 **por diseño** hasta T12 (falta `eval/esperados.json`). No existen `eval/esperados.json` ni `eval/runs/`.
- T12 **pausado** (decisión del 17/11): su prueba y `eval/esperados.json` quedan locales en `.diag/t12-pausado/`, sin commitear. Pendiente al retomarlo: T12 (primera corrida revisada a mano por Santiago y Lautaro, 39 observaciones) y T14 (visor y ficha con las asociaciones seguras). Recorte E6 aprobado para la pre-entrega del 20/11: pasada 1 + G2 + visor con las seguras; T6, T9, T13, T15 y el etiquetado quedan para después.

## Supuestos pendientes de confirmar con Casa Mueble

1. **Qué bordes llevan canto** (el listado del Olmo solo dice cuántos largos y cuántos cortos) y los ids de borde `largo-A/B`, `corto-A/B`. Los PDF de OpenCutList con canto definido (Sabrina) traen las marcas por lado; los de Olmo no (reexportar con canto definido; pedido enviado el 16/11 junto con el CSV y el SVG, consulta 58).
2. **Agrupación en módulos** (en revisión): `mod-escritorio` = C01, C02, C03, C16–C19; `mod-cajones` = C04–C15, C20, C21. El `M01` del código es igual en todas las piezas y no sirve para agrupar. Casa Mueble dice que el Olmo es un único módulo M01 (consulta 42, 20/10), pero el prototipo lo agrupa en dos. "Sector cajones" es solo el nombre del módulo de cajones. El ERP QA de Casa Mueble tampoco tiene nivel de módulo (relevado el 16 y 17/11).
3. **Mostrar solo el último segmento del código** ("C04") en listas y menús; la ficha muestra el código completo como "N° de pieza". No se interpreta el significado de los segmentos.
4. **Orientación del esquema de canteado**: largo A arriba, corto A a la izquierda, esquina de referencia arriba a la izquierda. Casa Mueble pidió que tenga la misma forma y orientación que se ve en el mueble (R2). Leyenda de "Tiras de cantos" en el PDF: 1 = inferior, 2 = superior, 3 = izquierdo, 4 = derecho (sin confirmación escrita, consulta 56).
5. **Canto ABS 22 × 0,22 mm**: confirmado por Casa Mueble el 16/10 (contrastar con la factura o el rollo). El 0,45 venía del optimizador online anterior: no usarlo.
6. **Gola horizontal 404 × 36 mm**: confirmada por Casa Mueble el 16/10. El 404 × 50 venía del optimizador online anterior: no usarlo. Provisorios: ninguno por ahora.
7. **QR por nivel (a corregir):** el prototipo genera QR de mueble y de módulo, pero Casa Mueble respondió el 15/10 y confirmó en la consulta 44 (20/10, sin fecha) que solo las piezas tienen QR; la guía de armado del módulo o del mueble se abre desde la ficha de cualquier pieza. Pendiente: quitar los QR de mueble y módulo de `/` y `/qr` en la versión real (ver la decisión del 17/11 arriba). Falta archivar la captura del mensaje como registro.

## Anomalías conocidas del modelo

- El componente C01 viene como `_0001-01-M01-C01__` (guiones bajos de más). Se normaliza y la verificación lo informa (el motor lo deja `dudosa` por `nombre-anomalo`).
- El `.dae` trae 6 geometrías sueltas de 20 × 35 × 10 mm (material `Color_M06`) que no cuelgan de ningún componente con código; el prototipo las ignora. Sin identificar.
- Pendiente de Casa Mueble: renombrar Oslo por Olmo en el `.dae`, el `.skp` y la carpeta del paquete, y reexportar el `.dae` (consulta 48).
- En la prueba del 16 y 17/11 en el ERP QA de Casa Mueble (proyecto P-0002 con el Olmo), el ERP pierde 9 códigos dentro de grupos y su nombre sugerido corta el número de corte.

## Rendimiento en celular (no deshacer sin medir)

- Solo 33 paneles (~700 triángulos). Antes, con herrajes, eran ~214.000: no volver a cargar geometría de detalle sin medir.
- `frameloop="demand"` y sombra de contacto horneada una vez.
- Hover solo con mouse; en táctil solo click.
- Visor con `svh`, sin `backdrop-blur` en controles superpuestos.
- `antialias` desactivado con `devicePixelRatio >= 2`.

## Despliegue

- Vercel desde GitHub (`main`). **Sin pipeline de CI**: `main` no tiene `.github/workflows` (verificado el 16/11); pruebas, typecheck y lint corren en local. Sin login; el dominio propio sigue sin definir. Base de datos: no; el importador de prueba usa Vercel Blob privado.
- `NEXT_PUBLIC_BASE_URL` define la URL base de los QR (se inlinea en build; cambiarla exige redesplegar).
- **No renombrar el proyecto de Vercel una vez impresos los QR**: cambia la URL y rompe los impresos. Los QR impresos deben apuntar al dominio de producción de Casa Mueble: no imprimir hasta definirlo (consulta 59). Entornos previstos: el equipo monta testing en `taller-test.casamueble.com.ar`; Casa Mueble provee preproducción y producción (faltan las credenciales de Augusto para publicar el sitio y la API).
- Acceso a la app y a las fichas: abierto a propósito. `robots.ts` y `X-Robots-Tag` evitan la indexación pero no dan control de acceso; el `.dae` del Olmo es público para quien tenga la URL. El importador (subir, listar, borrar) exige `IMPORT_UPLOAD_KEY`.
- Variables de entorno en Vercel: `BLOB_READ_WRITE_TOKEN` (Sensitive), `IMPORT_UPLOAD_KEY` (Secret), `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY` y `NEXT_PUBLIC_BASE_URL` (Config).
- La clave de la cuenta de servicio de Google no está en Vercel. Cuando llegue (P-15): variable Sensitive, solo de servidor, sin prefijo `NEXT_PUBLIC_`.
- PR #12 (`deps-next-16.4.6`, Next 16.4.3 → 16.4.6 por el aviso GHSA-mfr8-8qww-v76h): mergeado a `main` el 18/11 (`c820fd4`) y traído a la rama del spike con un merge (`dba9227`). `npm audit` marca otras alertas cuya corrección exige cambios de versión mayor; se evalúan después de la entrega.

## Limitaciones

- La cámara del escáner exige **https o localhost**. Con `npm run dev:lan` por `http://<IP>:3000` el navegador la bloquea (usar la cámara nativa del celular o la URL `/p/<qrId>`).
- Las fichas de la app base salen del mock del Olmo; solo las importaciones de `/importar` persisten (en Blob). No hay API de negocio ni asociación real integrada a la ficha.

## Extracción del PDF y OCR (módulo B; vía de respaldo desde el 16/11)

- Rol: respaldo de la entrada por CSV y SVG. Cuánto se sigue invirtiendo se decide con el cronograma, después de la prueba real del CSV.
- Specs: `docs/spec-extraccion-pdf.md` v0.3.3 (aprobada), `docs/spec-esquema-pdf.md` (aprobada el 3/11), `docs/spec-fixture-sintetico.md` v0.2, `docs/spec-sesion-2b-listado-cruce.md` v0.4 (implementada e integrada), `docs/spec-revision-ocr-real.md` v0.9 (rama `ocr-revision-real`, PR #11 sin mergear) y `docs/spec-ocr-prueba-real.md` v0.6.
- Cloud Vision: prueba de humo OK el 5/11 (valida credenciales y conectividad, no la calidad del OCR). La prueba en vivo con el fixture sintético (TS-13) se corrió el 10/11. `@google-cloud/vision` aprobada por el equipo el 10/11; `src/` no la importa, solo los scripts manuales (`npm run ocr:sintetico`, `npm run ocr:real -- <pdf> --paginas <n>`).
- Clave: cuenta de servicio rotada el 5/11, **fuera del repo** en `$HOME\.secrets\gcp` y leída solo por `GOOGLE_APPLICATION_CREDENTIALS`. Ya no se usa `credentials/`. Rol de Storage retirado y presupuesto con alertas creado (solo avisa, no corta el gasto). Salidas en `.ocr-data/` y `Sabrina/ocr-real/`, ignoradas por git.
- Compuerta de privacidad: bandera `PROCESAMIENTO_EXTERNO=permitir` y lista blanca por sha256 (un hash por corrida, archivo fuera del repo). Solo se envían los PDF que el equipo decide. `git ls-files "*.pdf"` da vacío y no hay `BEGIN PRIVATE KEY` en el historial (verificado el 5/11 y el 7/11).
- Corridas reales (todas de Santiago): Cedro 18 mm leído (24 filas, una espuria); Blanco 18 mm rechazado (derivó en R-15); Olmo "1 Optimizacion Blanco Nature" no concluyente (12 de 13 filas). Todo dato leído por OCR sale `dudosa` (`origen-ocr`); criterio bloqueante: errores seguros = 0. Plan B: productor `transcripcion-manual`.
- Abiertas: P-04 (confirmación escrita de Casa Mueble, ya no bloquea desde el 14/11), P-12 (rasterizado), P-15 (clave en entornos sin archivo local), P-16 (si Vision usa el contenido enviado); P-02 parcial.

## Fuera de alcance (de este prototipo)

Autenticación de usuarios, base de datos y API de negocio, etiquetas, guía de armado, sección de cortes (R4) y la integración del motor a la ficha (T14). El importador de prueba y el spike CSV/SVG son descartables.

## Cómo correrlo

```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # desde el celular en la misma wifi
npm run typecheck && npm run lint && npm run build
npm run eval       # Eval Harness local (sale con código 1 hasta T12, por diseño)
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
- Vision / OCR (5/11): `18daa6a` agregar `@google-cloud/vision`, `5c9ff54` registro de la prueba de humo, `afb6233` sección Extracción OCR en CLAUDE.md
- (7/11) `pdf-fixture-sintetico` a `main` (HEAD `7e09232`); (8/11) sesión 2b y T1 + T2 por PR
- (10/11) PR #3 `566e13d` (T3 + T4), PR #4 `223ae0e` (T5), PR #5 `283c4c1` (T7), PR #6 `5f9eb3e` (T8), PR #7 `daf5746` (T10), PR #8 `b5789cb` (T11)
- PR #10 `4dacd48` (compuerta y script de OCR real); PR #11 (`ocr-revision-real`) abierto al 16/11; PR #12 (`deps-next-16.4.6`) mergeado el 18/11 (`c820fd4`)
- (16/11) rama `proto-csv-opencutlist` (spike CSV/SVG), HEAD `bc2d192`; (18/11) v0.4 y v0.4.1 del spike en commits locales, sin push
- `scripts/vision-smoke.mjs` no está en el historial a propósito: es local y descartable (excluido en `.git/info/exclude`).