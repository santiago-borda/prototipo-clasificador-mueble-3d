# Prototipo — vista previa: ficha de pieza + visor 3D (Escritorio Olmo)

Vista previa temprana de la pantalla que vería un operario al escanear el QR de la etiqueta de una pieza: ficha con los datos de fabricación y visor 3D del mueble con la pieza resaltada.

## Qué hace

- **Escanear QR** (pestaña `/escanear`): abre la cámara del dispositivo, lee el QR de la etiqueta y abre la ficha de esa pieza sin salir de la app. Acepta la URL de la etiqueta o un id suelto (`olmo-c04`); si el QR no es del mueble, avisa y sigue escaneando.
- **Piezas** (pestaña `/`): lista de los QR del mueble de ejemplo (mueble, módulos y tipos de pieza). Las pestañas **Piezas** y **Escanear QR** están siempre arriba.
- **Ficha** (`/p/<qrId>`), en tres niveles:
  - *Pieza*: N° de pieza (código completo), medidas, espesor, material, cantidad de piezas equivalentes, esquema de canteado con las medidas de los lados largo y corto, y observaciones.
  - *Módulo*: sus tipos de pieza; en el 3D se resaltan todas.
  - *Mueble*: medidas generales, versión del diseño y módulos.
- **Visor 3D** del `.dae` real, que se mantiene al pasar de una ficha a otra: modos **Resaltar** / **Aislar** / **Atenuar**, marcas azules sobre los bordes con canto y un punto en la esquina de referencia, interruptor **Con ficha**, menú de piezas y navegación a la ficha tocando un panel.
- **QR para imprimir** (`/qr`): genera los códigos reales de cada mueble, módulo y pieza.
- **Aviso de versión**: si hay un diseño más nuevo, las fichas lo avisan (ver [Datos y supuestos](#datos-y-supuestos)).

Stack del prototipo (no fija el del proyecto): Next.js (App Router) + TypeScript estricto + Tailwind + React Three Fiber + drei + Zustand.

## Correrlo

Requiere Node 20.9 o superior.

```bash
npm install
npm run dev
```

Abrir <http://localhost:3000>: lista de QR del mueble. Hay tres niveles de QR y todos se abren en `/p/<qrId>`: el mueble (`/p/olmo-mueble`), cada módulo (`/p/olmo-mod-escritorio`, `/p/olmo-mod-cajones`) y cada tipo de pieza.

Cada tipo de pieza tiene su propio QR (`/p/olmo-cNN`).

En el visor: **Resaltar** / **Aislar** / **Atenuar**; arrastrar para rotar, pellizcar o rueda para zoom. Las piezas con ficha se tiñen de verde azulado (interruptor **Con ficha**); al pasar el cursor muestran su nombre y al tocarlas se abre su ficha. El menú de piezas (arriba a la izquierda) lista todos los QR para saltar de una ficha a otra sin volver al inicio.

## Escanear con la cámara

La pestaña **Escanear QR** (`/escanear`) usa la cámara trasera, lee el código con [`jsqr`](https://github.com/cozmo/jsQR) y navega a `/p/<qrId>`; las fichas se precargan, así que el salto es inmediato. Al abrir una ficha la cámara se apaga; para escanear otra pieza, volver a la pestaña.

- **La cámara exige https o `localhost`.** Funciona en un sitio con https; con `npm run dev:lan` por `http://<IP>:3000` el navegador la bloquea y la app lo avisa (usar la cámara nativa del celular o `/p/<qrId>` por URL).
- Si no hay permiso de cámara, habilitarlo en los ajustes del sitio en el navegador (en iPhone, Safari).
- También sirve la cámara nativa del celular: el QR es una URL que abre la ficha directamente.

## QR reales para imprimir

`/qr` genera el código QR de cada mueble, módulo y pieza (para imprimir con el botón **Imprimir** o mostrar en pantalla). Al escanearlo con la cámara del celular se abre la ficha. El QR apunta a la dirección desde la que abras `/qr`, o a la que escribas en el campo "Dirección base": para que el celular pueda abrirlo, abrí `/qr` desde la IP de la PC (`http://<IP>:3000/qr` con `npm run dev:lan`) y no desde `localhost`.

## Probarlo en el celular (misma wifi)

1. PC y celular en la misma red wifi.
2. Levantar el servidor escuchando en la red:
   ```bash
   npm run dev:lan
   ```
3. Averiguar la IP de la PC (Windows: `ipconfig`, línea "Dirección IPv4", p. ej. `192.168.1.23`).
4. En el celular abrir `http://192.168.1.23:3000/p/olmo-c04`.

Ojo: así se ven las fichas y el visor, pero la pestaña **Escanear QR** no puede abrir la cámara por ser `http` (ver [Escanear con la cámara](#escanear-con-la-cámara)); para probarla en el celular usar una versión publicada con https. Si no carga: permitir Node.js en el Firewall de Windows para redes privadas. `next.config.ts` ya habilita `allowedDevOrigins` para los rangos `192.168.*.*`, `10.*.*.*` y `172.*.*.*`; si tu red usa otro, agregarlo ahí.

## Calidad

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```

## Datos y supuestos

Los datos de la ficha son un mock y varios supuestos están marcados como "ASUMIDO PARA EL PROTOTIPO" en el código (`src/data/`). Para ver el aviso de "versión más nueva", poner `newerVersionAvailable: true` en `src/data/furniture.mock.ts`.

## Fuera de alcance

Autenticación, base de datos, API, motor de asociación, etiquetas, guía de armado y asociación automática de piezas.
