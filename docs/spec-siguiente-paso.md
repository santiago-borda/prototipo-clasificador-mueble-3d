# Especificación del siguiente paso — cierre de Sabrina como segundo fixture

Estado: **borrador, a aprobar antes de escribir código** (SDD). Antecedente: carga del segundo modelo (Sabrina), criterios A1–A7, implementada y probada.

## Contexto
Sabrina carga y pasa A1–A7 en local. Quedan datos que el modelo no puede inventar y decisiones que dependen de Casa Mueble. Este paso cierra lo que sí se puede cerrar sin esas respuestas y deja explícito lo que no.

## Qué cambia

| # | Cambio | Depende de |
|---|---|---|
| S1 | ~~Bordes con canto de Sabrina~~ **Hecho el 16/10**: tabla de los PDF cargada con la leyenda del equipo (1 inf, 2 sup, 3 izq, 4 der) y contrastada con el .dae (A8/A9). **Sigue ASUMIDO**: falta que Casa Mueble confirme la leyenda y el origen del canteado (consulta 2); hasta entonces el esquema de la ficha (A/B, esquina de referencia) es del prototipo. | Respuesta a la consulta 2 |
| S2 | **Contrastar la transcripción contra los PDF** (hoy solo se verificó contra el .dae: cantidades 29/29, medidas ≤ 0,05 mm). Se agrega un chequeo de totales por material (50 + 42 + 13) contra el pie de cada PDF. | Los 3 PDF en `Sabrina/` (no estaban en la carpeta) |
| S3 | **Texturas (opción B)**, solo si se decide mostrarlas: resolver las rutas rotas del .dae en el cargador (URL modifier `*/<archivo>` -> `Texturas/<archivo>`, sin tocar el original), conservar UV y material por grupo, y definir cómo se ve el resaltado sobre textura. Cuesta rendimiento en celular: medir antes. | Decisión del usuario |
| S4 | **Mesa izquierda/derecha**: distinguir las dos instancias de cada código de la mesa de luz por posición, para resaltar una sola. Hoy fuera de alcance. | Decisión del usuario |
| S5 | **Motor de asociación con certeza** (alta/dudosa). Hoy la asociación es exacta por código (A4). Los niveles de certeza son del motor real, no del prototipo. | Diseño del motor (tesis) |

## Criterios de aceptación (por cambio)
- **S1.** Cumplido por A8 y A9 (ver `tests/sabrina.test.ts`). Al llegar la respuesta de Casa Mueble: si la leyenda cambia, se ajusta solo `LADO_A_BORDE` / `LADOS` en `Sabrina/data/sabrina.def.ts` y A8 vuelve a verificar los conteos contra el .dae.
- **S2.** Las 29 cantidades y medidas de la tabla coinciden con los PDF; los totales por material coinciden con el pie de cada PDF. Si un PDF no se pudo leer, se marca "no verificado", no se supone.
- **S3.** (Solo si se aprueba) Las texturas se ven en local sin 404; Olmo sigue sin texturas; el tamaño de transferencia y los fps en celular no empeoran más de lo que se acuerde.
- **S4.** (Solo si se aprueba) Resaltar la mesa izquierda no resalta la derecha; con la regla por código, las dos siguen asociadas al mismo tipo.
- **S5.** Fuera de este paso; se especifica junto con el motor real.

## Pruebas
Una por criterio, en `tests/` (vitest), con el mismo esquema que A1–A7: Olmo y Sabrina como fixtures, y las pruebas de Sabrina se saltean si falta `Sabrina/`.

## Pendientes que bloquean (no suponer)
1. **Titularidad y uso del archivo de Sabrina** (es de otra clienta): hasta resolverlo, ni el .dae, ni los PDF, ni la tabla de piezas van al repo.
2. **Significado de los segmentos del código** (`0001-01-M01-Cxx`, `0001-02-M02-Cxx`): sin confirmar con Casa Mueble.
3. **qrId de mueble y de módulo, y nombres de módulo** (R6): asumidos para el prototipo.
4. **Canto ABS 22 x 0,22 mm**: contrastar con la factura o el rollo (los PDF dicen "~0 x 22").
5. **Profundidad de Olmo**: el mock dice 550 mm y la caja de las piezas del .dae mide 571 mm (ancho y alto coinciden). Falta decidir cuál vale y por qué.

## Archivos que tocaría
`Sabrina/data/sabrina.def.ts` (local, ignorado), `tests/` (S2–S4), `src/model/colladaModel.ts` y `src/model/namedColladaLoader.ts` (solo S3/S4).
