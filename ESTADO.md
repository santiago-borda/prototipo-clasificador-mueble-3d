# Estado del prototipo — Escritorio Olmo (ficha de pieza + visor 3D)

Fecha: 15/10/2026 · Rama `main` · Último commit: `feb2bdd` (actualización de README)

## Qué es

Vista previa temprana de la pantalla que vería un operario al escanear el QR de una pieza: ficha con los datos de fabricación y visor 3D del mueble con la pieza resaltada. **No fija el stack del proyecto** (Next.js 16, TypeScript, Tailwind, React Three Fiber, drei y Zustand se eligieron solo para el prototipo).

## Qué funciona hoy

| Función | Ruta | Detalle |
|---|---|---|
| Escanear QR | `/escanear` | Cámara trasera + `jsqr`. Acepta la URL de la etiqueta o un id suelto (`olmo-c04`). Si el QR no es del mueble, avisa y sigue escaneando. |
| Lista de piezas | `/` | Todos los QR del mueble: mueble, módulos y tipos de pieza. |
| Ficha | `/p/<qrId>` | Tres niveles: **pieza** (código, medidas, espesor, material, cantidad, esquema de canteado, observaciones), **módulo** (sus tipos de pieza, todas resaltadas en 3D) y **mueble** (medidas generales, versión, módulos). |
| Visor 3D | dentro de la ficha | `.dae` real. Modos Resaltar / Aislar / Atenuar, marcas de canto, punto de esquina de referencia, interruptor "Con ficha", menú de piezas, click en un panel abre su ficha. Se mantiene al cambiar de ficha. |
| QR para imprimir | `/qr` | Genera los QR reales (librería `qrcode`) de mueble, módulos y piezas. |
| Aviso de versión | fichas | "Hay una versión más nueva de este diseño" (se activa con `newerVersionAvailable: true` en el mock). |

QR en tres niveles: `olmo-mueble`, `olmo-mod-escritorio` / `olmo-mod-cajones`, `olmo-c01` … `olmo-c21`.

## Datos

- **Mock** (`src/data/furniture.mock.ts`): Escritorio Olmo 1200 × 750 × 550 mm, **21 tipos de pieza / 33 instancias**, con nombres, medidas, cantidades y materiales del listado de Casa Mueble del 9/10.
- **Modelo 3D real** (`public/models/olmo.dae`, export de SketchUp): 21 componentes, 33 instancias, sin herrajes, ~700 triángulos (696).
- **Código de pieza**: nombre del componente sin `_` inicial/final, formato `0001-01-M01-C04`. `instanceId` = `<código>#<n>`.
- **Asociación simulada** (`src/data/mapping.ts`): un tipo se asocia a las instancias con su mismo código (regla exacta por código, sin tabla a mano).
- **Verificación de desarrollo** (`src/model/verifyModel.ts`, solo fuera de producción, salida por consola): cantidad de instancias, caja de la geometría vs. medidas (tolerancia 2 mm) y formato del código. Esperado: 21 tipos, 33 instancias, 0 advertencias, 1 anomalía.

## Supuestos pendientes de confirmar con Casa Mueble

1. **Qué bordes llevan canto** (el listado solo dice cuántos largos y cuántos cortos) y los ids de borde `largo-A/B`, `corto-A/B`.
2. **Agrupación en módulos**: `mod-escritorio` = C01, C02, C03, C16–C19; `mod-cajones` = C04–C15, C20, C21. El `M01` del código es igual en todas las piezas y no sirve para agrupar.
3. **Mostrar solo el último segmento del código** ("C04") en listas y menús; la ficha muestra el código completo como "N° de pieza". No se interpreta el significado de los segmentos.
4. **Orientación del esquema de canteado**: largo A arriba, corto A a la izquierda, esquina de referencia arriba a la izquierda.
5. **Canto ABS 22 × 0,45 mm** (provisorio; la lista de compra dice 0,22).
6. **Gola horizontal 404 × 36 mm**: provisoria.

## Anomalías conocidas del modelo

- El componente C01 viene como `_0001-01-M01-C01__` (guiones bajos de más). Se normaliza y la verificación lo informa.
- El `.dae` trae 6 geometrías sueltas de 20 × 35 × 10 mm (material `Color_M06`) que no cuelgan de ningún componente con código; el prototipo las ignora. Sin identificar.

## Rendimiento en celular (no deshacer sin medir)

- Solo 33 paneles (~700 triángulos). Antes, con herrajes, eran ~214.000: no volver a cargar geometría de detalle sin medir.
- `frameloop="demand"` y sombra de contacto horneada una vez.
- Hover solo con mouse; en táctil solo click.
- Visor con `svh`, sin `backdrop-blur` en controles superpuestos.
- `antialias` desactivado con `devicePixelRatio >= 2`.

## Despliegue

- Vercel desde GitHub (`main`). Sin CI, base de datos, login ni dominio propio.
- `NEXT_PUBLIC_BASE_URL` define la URL base de los QR (se inlinea en build; cambiarla exige redesplegar).
- **No renombrar el proyecto de Vercel una vez impresos los QR**: cambia la URL y rompe los impresos.
- Acceso abierto a propósito. `robots.ts` y `X-Robots-Tag` evitan la indexación pero no dan control de acceso; el `.dae` es público para quien tenga la URL.

## Limitaciones

- La cámara del escáner exige **https o localhost**. Con `npm run dev:lan` por `http://<IP>:3000` el navegador la bloquea (usar la cámara nativa del celular o la URL `/p/<qrId>`).
- Datos de ficha en mock; no hay API ni persistencia.

## Fuera de alcance

Autenticación, base de datos, API, motor de asociación real, etiquetas, guía de armado y asociación automática de piezas.

## Cómo correrlo

```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # desde el celular en la misma wifi
npm run typecheck && npm run lint && npm run build
```

## Historial reciente

- `7f6e61a` Spike: ficha de pieza con visor 3D del Escritorio Olmo
- `911dca3` Modelo .dae real, verificación de desarrollo y preparación para Vercel
- `b35ba91` Pestaña Escanear QR: lee la etiqueta con la cámara y abre la ficha
- `feb2bdd` Actualización de README con cambios
