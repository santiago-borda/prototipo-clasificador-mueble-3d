# Prototipo — vista previa: ficha de pieza + visor 3D (Escritorio Olmo)

Vista previa temprana de la pantalla que vería un operario al escanear el QR de una pieza. El escaneo se simula: se entra por URL.

Stack del prototipo (no fija el del proyecto): Next.js (App Router) + TypeScript estricto + Tailwind + React Three Fiber + drei + Zustand.

## Correrlo

Requiere Node 20.9 o superior.

```bash
npm install
npm run dev
```

Abrir <http://localhost:3000>: lista de QR del mueble. Hay tres niveles de QR y todos se abren en `/p/<qrId>`: el mueble (`/p/olmo-mueble`), cada módulo (`/p/olmo-mod-escritorio`, `/p/olmo-mod-cajones`) y cada tipo de pieza:

Cada tipo de pieza se identifica con el código del componente del .dae, p. ej. `0001-01-M01-C04` (en listas se muestra `C04`). 21 tipos, 33 instancias.

| QR | Pieza | Cant. |
|---|---|---|
| `/p/olmo-c01` | C01 Mesa/Techo escritorio | 1 |
| `/p/olmo-c02` | C02 Lateral escritorio | 1 |
| `/p/olmo-c03` | C03 Faja grande medio escritorio | 1 |
| `/p/olmo-c04` | C04 Laterales sector cajones | 2 |
| `/p/olmo-c05` | C05 Piso y techo sector cajones | 2 |
| `/p/olmo-c06` | C06 Gola Vertical | 1 |
| `/p/olmo-c07` | C07 Gola Horizontal | 2 |
| `/p/olmo-c08` | C08 Cajon 1 (400 x 100) | 2 |
| `/p/olmo-c09` | C09 Cajon 1 (342 x 100) | 2 |
| `/p/olmo-c10` | C10 Cajon 2 (400 x 200) | 2 |
| `/p/olmo-c11` | C11 Cajon 2 (342 x 200) | 2 |
| `/p/olmo-c12` | C12 Tapa cajon 1 | 1 |
| `/p/olmo-c13` | C13 Tapa cajon 2 | 1 |
| `/p/olmo-c14` | C14 Techo y piso estante abierto | 2 |
| `/p/olmo-c15` | C15 Laterales estante abierto | 2 |
| `/p/olmo-c16` | C16 Fajas verticales | 2 |
| `/p/olmo-c17` | C17 Fajas horizontales grandes | 2 |
| `/p/olmo-c18` | C18 Faja horizontal chica | 1 |
| `/p/olmo-c19` | C19 Faja donde apoya mesa | 1 |
| `/p/olmo-c20` | C20 Fondo cajones | 2 |
| `/p/olmo-c21` | C21 Fondo sector cajones | 1 |

En el visor: **Resaltar** / **Aislar** / **Atenuar**; arrastrar para rotar, pellizcar o rueda para zoom. Las piezas con ficha se tiñen de verde azulado (interruptor **Con ficha**); al pasar el cursor muestran su nombre y al tocarlas se abre su ficha. El menú de piezas (arriba a la izquierda) lista todos los QR para saltar de una ficha a otra sin volver al inicio.

## QR reales para escanear

`/qr` genera el código QR de cada mueble, módulo y pieza (para imprimir con el botón **Imprimir** o mostrar en pantalla). Al escanearlo con la cámara del celular se abre la ficha. El QR apunta a la dirección desde la que abras `/qr`, o a la que escribas en el campo "Dirección base": para que el celular pueda abrirlo, abrí `/qr` desde la IP de la PC (`http://<IP>:3000/qr` con `npm run dev:lan`) y no desde `localhost`. En producción la dirección base viene de `NEXT_PUBLIC_BASE_URL` (ver [Despliegue](#despliegue-vercel)).

## Probarlo en el celular (misma wifi)

1. PC y celular en la misma red wifi.
2. Levantar el servidor escuchando en la red:
   ```bash
   npm run dev:lan
   ```
3. Averiguar la IP de la PC (Windows: `ipconfig`, línea "Dirección IPv4", p. ej. `192.168.1.23`).
4. En el celular abrir `http://192.168.1.23:3000/p/olmo-c04`.

Si no carga: permitir Node.js en el Firewall de Windows para redes privadas. `next.config.ts` ya habilita `allowedDevOrigins` para los rangos `192.168.*.*`, `10.*.*.*` y `172.*.*.*`; si tu red usa otro, agregarlo ahí.

## Despliegue (Vercel)

Se despliega en Vercel desde GitHub (rama `main`, framework Next.js autodetectado, sin configuración extra). Cada push a `main` redespliega.

- **Variable `NEXT_PUBLIC_BASE_URL`** (ver `.env.example`): URL pública estable, p. ej. `https://<proyecto>.vercel.app`, sin `/` final. `/qr` la usa como dirección base de los QR; si no está definida, usa el origen de la página. Se incorpora en el build: se carga en Vercel (Settings → Environment Variables, entorno Production) **y hay que redesplegar**. Se conoce recién después del primer deploy. Para probar local: `.env.local` (ignorado por git).
- **No renombrar el proyecto de Vercel una vez impresos los QR**: cambia la URL y los QR impresos dejan de abrir.
- **Acceso abierto a propósito**: sin login ni contraseña. El modelo `public/models/olmo.dae` es público para cualquiera que tenga la URL. `robots.txt` (`Disallow: /`) y el header `X-Robots-Tag: noindex, nofollow` solo piden a los buscadores no indexar; no son control de acceso.

## Calidad

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```

## Datos y supuestos

Ver [CLAUDE.md](CLAUDE.md): qué es mock, qué es asumido (qué bordes llevan canto, módulos, código corto), qué simula el mapeo por código y la verificación de desarrollo del modelo (consola del navegador en `npm run dev`). Para ver el aviso de "versión más nueva", poner `newerVersionAvailable: true` en `src/data/furniture.mock.ts`.

## Fuera de alcance

Escáner QR real, autenticación, base de datos, API, motor de asociación, etiquetas, guía de armado y asociación automática de piezas (el modelo 3D que se carga es `public/models/olmo.dae`: 21 componentes, 33 instancias, sin herrajes, ~700 triángulos, y se ignoran 6 geometrías sueltas de 20 x 35 x 10 mm; el punto de reemplazo es `src/model/useFurnitureModel.ts`).
