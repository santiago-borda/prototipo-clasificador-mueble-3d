# Especificación del siguiente paso — cierre de Sabrina como segundo fixture

Estado: **cerrado el 16/10** (S1 y S2 hechos; S3 y S4 descartados por ahora; S5 se especifica aparte). Antecedente: carga del segundo modelo (Sabrina), criterios A1–A9, implementada y probada.

## Contexto
Sabrina carga y pasa A1–A9 en local (A6 es Olmo, A7 es el registro sin Sabrina). Este paso cerró lo que se podía cerrar sin respuestas de Casa Mueble y deja explícito lo que no.

## Cambios

| # | Cambio | Estado |
|---|---|---|
| S1 | Bordes con canto de Sabrina: tabla de los PDF con la leyenda del equipo (1 inf, 2 sup, 3 izq, 4 der), contrastada con el .dae (A8/A9). **Sigue ASUMIDO**: falta que Casa Mueble confirme la leyenda y el origen del canteado (consulta 2). | Hecho |
| S2 | Chequeo de totales por material (50 + 42 + 13 = 105) contra constantes documentadas en `tests/sabrina.test.ts`, más un cruce con el .dae (13 instancias de 3 mm y 92 de 18 mm). No se leen los PDF: la transcripción salió de ellos y se cruzó con el .dae. | Hecho |
| S3 | Texturas (opción B). | Descartado por ahora |
| S4 | Mesa izquierda/derecha. | Descartado por ahora |
| S5 | Motor de asociación con certeza y Eval Harness. | Se especifica aparte (chat de diseño del motor) |

## Criterios de aceptación y pruebas
- **S1:** A8 (canteado completo; tantos lados largos y cortos como caras de canto en el .dae, instancia por instancia) y A9 (bordes marcados en el 3D miden `lengthMm` / `widthMm`).
- **S2:** las dos pruebas "S2" de `tests/sabrina.test.ts`. Si cambia el listado, se actualizan las constantes a mano.
- Las pruebas de Sabrina se saltean si falta `Sabrina/`; Olmo y Sabrina son los dos fixtures.

## Pendientes que bloquean (no suponer)
1. **Titularidad y uso del archivo de Sabrina** (es de otra clienta): hasta resolverlo, ni el .dae, ni los PDF, ni la tabla de piezas van al repo.
2. **Significado de los segmentos del código** (`0001-01-M01-Cxx`, `0001-02-M02-Cxx`): sin confirmar con Casa Mueble.
3. **qrId de mueble y de módulo, y nombres de módulo** (R6): asumidos para el prototipo.
4. **Leyenda del canteado** (inf/sup/izq/der) y orientación A/B: del equipo, sin confirmar (consulta 2).
5. **Canto ABS 22 x 0,22 mm**: confirmado por Casa Mueble el 16/10, a contrastar con factura o rollo.
6. **Profundidad de Olmo**: el mock dice 550 mm y la caja de las piezas del .dae mide 571 mm (ancho y alto coinciden). Falta decidir cuál vale y por qué.
7. **Los PDF no están en `Sabrina/`**: la transcripción no se contrastó contra ellos en el repo.
