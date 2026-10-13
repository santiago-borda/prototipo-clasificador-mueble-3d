# Spike: ficha de pieza + visor 3D (Escritorio Olmo)

Prototipo **descartable** de la pantalla que vería un operario al escanear el QR de una pieza. El escaneo se simula: se entra por URL.

Stack del spike: Next.js (App Router) + TypeScript estricto + Tailwind + React Three Fiber + drei + Zustand.

## Correrlo

Requiere Node 20.9 o superior.

```bash
npm install
npm run dev
```

Abrir <http://localhost:3000>: lista de QR del mueble. Hay tres niveles de QR y todos se abren en `/p/<qrId>`: el mueble (`/p/olmo-mueble`), cada módulo (`/p/olmo-mod-escritorio`, `/p/olmo-mod-cajones`) y cada tipo de pieza:

| QR | Pieza |
|---|---|
| `/p/olmo-01` | _01 Mesa / techo escritorio |
| `/p/olmo-02` | _02 Lateral escritorio |
| `/p/olmo-04` | _04 Lateral módulo cajones (x2) |
| `/p/olmo-05` | _05 Piso y techo módulo cajones (x2) |
| `/p/olmo-06` | _06 Gola vertical |
| `/p/olmo-12` | _12 Fondo cajones (x2) |

En el visor: **Resaltar** / **Aislar** / **Atenuar**; arrastrar para rotar, pellizcar o rueda para zoom. Las piezas con ficha se tiñen de verde azulado (interruptor **Con ficha**); al pasar el cursor muestran su nombre y al tocarlas se abre su ficha. El menú **Piezas** (arriba a la izquierda) lista todos los QR para saltar de una ficha a otra sin volver al inicio.

## QR reales para escanear

`/qr` genera el código QR de cada mueble, módulo y pieza (para imprimir con el botón **Imprimir** o mostrar en pantalla). Al escanearlo con la cámara del celular se abre la ficha. El QR apunta a la dirección desde la que abras `/qr`, o a la que escribas en el campo "Dirección base": para que el celular pueda abrirlo, abrí `/qr` desde la IP de la PC (`http://<IP>:3000/qr` con `npm run dev:lan`) y no desde `localhost`.

## Probarlo en el celular (misma wifi)

1. PC y celular en la misma red wifi.
2. Levantar el servidor escuchando en la red:
   ```bash
   npm run dev:lan
   ```
3. Averiguar la IP de la PC (Windows: `ipconfig`, línea "Dirección IPv4", p. ej. `192.168.1.23`).
4. En el celular abrir `http://192.168.1.23:3000/p/olmo-04`.

Si no carga: permitir Node.js en el Firewall de Windows para redes privadas. `next.config.ts` ya habilita `allowedDevOrigins` para los rangos `192.168.*.*`, `10.*.*.*` y `172.*.*.*`; si tu red usa otro, agregarlo ahí.

## Calidad

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```

## Datos y supuestos

Ver [CLAUDE.md](CLAUDE.md): qué es mock, qué es asumido (qué bordes llevan canto, módulos) y qué simula el mapeo a 3D. Para ver el aviso de "versión más nueva", poner `newerVersionAvailable: true` en `src/data/furniture.mock.ts`.

## Fuera de alcance

Escáner QR real, autenticación, base de datos, API, motor de asociación, etiquetas, guía de armado y asociación automática de piezas (el modelo 3D que se carga es `public/models/olmo.dae`; el punto de reemplazo es `src/model/useFurnitureModel.ts`).
