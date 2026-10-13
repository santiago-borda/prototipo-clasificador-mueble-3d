# CLAUDE.md

@AGENTS.md

## Qué es esto
**Spike descartable.** Vista previa temprana de la pantalla que vería un operario al escanear el QR de una pieza (`/p/[qrId]`). **No fija el stack del proyecto**: Next.js, R3F, Zustand y Tailwind se eligieron solo para este prototipo. No sobreingenierizar.

## Mock vs. asumido
- **Mock** (`src/data/furniture.mock.ts`): subconjunto del Escritorio Olmo (1200 x 750 x 550 mm), 6 tipos de pieza con medidas, cantidades, materiales y canto ABS 22 x 0,45 mm (provisorio) tomados del listado provisto.
- **ASUMIDO PARA EL PROTOTIPO — a confirmar con Casa Mueble**:
  - Qué bordes concretos llevan canto (el listado solo dice cuántos largos/cortos) y los ids de borde `largo-A/B`, `corto-A/B`.
  - La agrupación en módulos (`mod-escritorio`, `mod-cajones`).
  - La orientación del esquema de canteado (largo A arriba, corto A a la izquierda; esquina de referencia arriba a la izquierda).
- **Simulado**: `src/data/mapping.ts` imita lo que producirá el futuro motor de asociación (PieceType -> instancias 3D). Está escrito a mano con ids `<componente>#<n>` del .dae.
- **Modelo 3D real**: `public/models/olmo.dae` (export de SketchUp, pulgadas, Z arriba). `src/model/` lo carga con `ColladaLoader` y lo convierte en partes: una por componente `_NN_...` (ver `colladaModel.ts`). Los herrajes del .dae NO se cargan: eran ~214.000 triángulos (99,6 % del total) dentro de los cajones y hacían tironear el visor en celulares. `namedColladaLoader.ts` recupera los nombres de componente que three pierde al importar. Las piezas del .dae sin ficha en el mock (_03, _07..._11, _13..._21) se ven en neutro y no navegan.
- **ASUMIDO PARA EL PROTOTIPO — pertenencia a módulos de los componentes sin ficha**: `moduleExtraComponents` en `mapping.ts` (cajones, tapas, estante abierto, fondo del sector cajones, herrajes -> módulo cajones; faja del medio y fajas de color -> escritorio). Se deduce de los nombres del .dae; confirmar con Casa Mueble. Cuando llegue el listado completo, las piezas pasan a `furniture.mock.ts` y esa lista se achica.
- QR en tres niveles (mueble `olmo-mueble`, módulos `olmo-mod-*`, piezas `olmo-NN`), todos en `/p/<qrId>` (`resolveQr` en `lib/lookup.ts`). `/qr` genera los códigos reales con la librería `qrcode`.
- La cámara del celular reemplaza al escáner: no hay escáner dentro de la app. También se entra por URL o desde la lista de `/`.

## Rendimiento en celular (no deshacer sin medir)
- Geometría: 33 paneles de 24 triángulos (~1.600 triángulos y ~40 llamadas de dibujo por frame; antes 430.000 y 89).
- `frameloop="demand"`: solo se dibuja cuando algo cambia. La sombra de contacto se hornea una vez (`frames={1}`).
- Hover (cursor, color, cartel) solo con mouse (`CAN_HOVER` en `PartMesh.tsx`); en táctil solo hay click.
- El visor usa `svh` (no `dvh`) para que la barra del navegador de iOS no redimensione el canvas al hacer scroll, y los controles superpuestos no usan `backdrop-blur`.
- `antialias` se desactiva con `devicePixelRatio >= 2`.

## Correr
```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # accesible desde el celular en la misma wifi
npm run typecheck && npm run lint && npm run build
```

## Notas
- Next 16: leer `node_modules/next/dist/docs/` antes de usar APIs de Next (ver AGENTS.md).
- `cacheComponents` está desactivado a propósito (simplicidad del spike).
- Para ver el aviso "Hay una versión más nueva de este diseño": `newerVersionAvailable: true` en `furniture.mock.ts`.
