# Marco de referencia v1 (`marco/1`)

**ASUMIDO PARA EL PROTOTIPO (AS2), consulta 53 a Casa Mueble.** Parámetro versionado del adapter (`FRAME_VERSION` en `src/engine/versions.ts`, entra al `engineRunId`). Lo usan `orientation`, `centerRel` y `crossesMidplane` de `Observation` (spec-motor §5.2), que son evidencia blanda (pasada 2). Cambiar algo de esta página exige subir la versión del marco.

## Ejes

El marco es la escena de three después de `ColladaLoader`: el loader escala la unidad declarada del .dae a metros y, con `Z_UP` (export de SketchUp), rota el modelo −90° en X para que quede **Y arriba**. El adapter (`src/model/observe.ts`) pasa todo a mm.

| Eje | Índice | Sentido (0 → 1 en `centerRel`) |
|---|---|---|
| X | 0 | izquierda → derecha, mirando el frente |
| Y | 1 | abajo → arriba |
| Z | 2 | atrás → **frente** (+Z) |

**Por qué +Z es el frente:** es el lado desde el que mira la cámara inicial del visor (`BASE_CAMERA = [1.8, 1.2, 2.15]` en `FurnitureCanvas.tsx`, con Z positivo). Equivale al frente de SketchUp (−Y en el archivo) después de la rotación del loader.

## Definiciones

- **Caja de referencia del mueble:** unión de las cajas de **todas** las observaciones del modelo sin perturbar, con y sin componente (incluye las mallas sueltas). No usa las medidas del mock. Se calcula una vez (`DaeObservation.referenceBoxMm`).
- **`orientation`:** por el eje de menor extensión de la caja de la instancia (el espesor): Y → `horizontal`, X → `vertical-lateral`, Z → `vertical-frontal`. En empate gana el primer eje (X, después Y, después Z), solo para que sea determinista.
- **`centerRel[i]`:** centro de la caja de la instancia, relativo a la caja de referencia en el eje i (0..1). Si la caja de referencia no tiene extensión en un eje, vale 0,5.
- **`crossesMidplane[i]`:** la caja de la instancia cruza el plano medio de la caja de referencia en el eje i, **de forma estricta** (margen ε = 1e-6 mm): una caja que solo toca el plano no lo cruza.
- **`axisAligned`:** todas las normales geométricas de los triángulos (calculadas de los vértices en el mundo, no las normales escritas en el .dae) tienen una componente con |n| ≥ 1 − 1e-6. Los triángulos de área nula no cuentan.
- **`mirrored`:** determinante de la transformada de mundo del nodo de la instancia < 0.

## Verificación

`tests/model/observe.test.ts`, "marco v1": en el primer fixture, las dos tapas de cajón (C12 y C13) tienen que ser `vertical-frontal` y estar en la mitad del frente (`centerRel[2] > 0,5`). Resultado del 8/11/2026 (`public/models/Olmo/olmo.dae`): las dos con `centerRel[2] = 0,984`, caja 18 × 165 × 440 y 18 × 296 × 440 mm (las medidas del listado). La caja de referencia mide 1200 × 760 × 571 mm (la profundidad de 571 es la que spec-motor §2.2 deja abierta contra los 550 del mock; los 760 de alto incluyen las mallas sueltas, que llegan 10 mm por debajo del piso de las piezas).

Si esa prueba falla con otro .dae, **no se invierte el eje en silencio**: se para, se informa y se redefine el marco con versión nueva. La pasada 1 del motor no usa el marco y puede seguir; la pasada 2 no (spec-adapter §3.4).

## Pendiente

- Consulta 53: confirmar con Casa Mueble qué lado del diseño es el frente y si es siempre el mismo en sus exportaciones.
- Un modelo exportado con otro eje vertical u otra convención de frente necesita un marco nuevo (`marco/2`), no un parámetro por modelo.
