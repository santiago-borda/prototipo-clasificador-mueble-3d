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
- **Simulado**: `src/data/mapping.ts` simula la regla exacta por código del futuro motor de asociación: un tipo de pieza se asocia a las instancias con su mismo código. No hay tabla escrita a mano.
- **Modelo 3D real**: `public/models/olmo.dae` (export de SketchUp, pulgadas, Z arriba): 21 componentes `_0001-01-M01-Cxx`, 33 instancias, **sin herrajes**, ~700 triángulos (696). `src/model/` lo carga con `ColladaLoader` y lo convierte en partes: una por instancia de componente (ver `colladaModel.ts`). `namedColladaLoader.ts` recupera los nombres de componente que three pierde al importar. El archivo trae además 6 geometrías sueltas de 20 x 35 x 10 mm (material `Color_M06`, sin identificar) que no cuelgan de ningún componente con código: el prototipo las ignora.
- **Verificación de desarrollo** (`src/model/verifyModel.ts`, función pura; se llama desde `useFurnitureModel.ts` solo con `NODE_ENV !== "production"` y escribe en la consola, sin UI): por tipo, (a) cantidad de instancias == listado, (b) caja de la geometría == largo x ancho x espesor (tolerancia 2 mm), (c) formato del código. Esperado: 21 tipos, 33 instancias, 0 advertencias y 1 anomalía (el `__` de C01).
- QR en tres niveles (mueble `olmo-mueble`, módulos `olmo-mod-*`, piezas `olmo-cNN`, ej. `olmo-c04`), todos en `/p/<qrId>` (`resolveQr` en `lib/lookup.ts`). `/qr` genera los códigos reales con la librería `qrcode`.
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
npm run typecheck && npm run lint && npm run build
```

## Despliegue (Vercel)
- Vercel desde GitHub (`main`, Next.js autodetectado). Sin CI, DB, auth ni dominio propio.
- `NEXT_PUBLIC_BASE_URL` (ver `.env.example`): URL estable de producción, sin `/` final. `QrSheet.tsx` la usa como base de los QR y cae a `window.location.origin` si falta. Se inlinea en build: cambiarla exige redesplegar. `.env*` está en `.gitignore` salvo `.env.example`.
- **No renombrar el proyecto de Vercel una vez impresos los QR** (cambia la URL y rompe los impresos).
- Acceso abierto a propósito (sin login). `public/models/olmo.dae` es público para quien tenga la URL. `src/app/robots.ts` (`Disallow: /`) y `X-Robots-Tag: noindex, nofollow` (`next.config.ts`) evitan la indexación, no dan control de acceso. No agregar middleware/proxy de auth.

## Notas
- Next 16: leer `node_modules/next/dist/docs/` antes de usar APIs de Next (ver AGENTS.md).
- `cacheComponents` está desactivado a propósito (simplicidad del prototipo).
- Para ver el aviso "Hay una versión más nueva de este diseño": `newerVersionAvailable: true` en `furniture.mock.ts`.
