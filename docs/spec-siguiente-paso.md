# Especificación del siguiente paso — cierre de Sabrina como segundo fixture

Estado: **cerrado el 16/10** (S1 y S2 hechos; S3 y S4 descartados por ahora; S5 se especifica aparte). Antecedente: carga del segundo modelo (Sabrina), criterios A1–A9, implementada y probada. **Actualizado el 3/11** (pendientes 1 y 7 y sección "Siguiente paso"); el resto del documento no cambia.

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
1. ~~**Titularidad y uso del archivo de Sabrina**~~ **Resuelto el 3/11 (informado por el equipo):** Casa Mueble aprueba el uso de los archivos de Sabrina y no pone restricciones de titularidad; el repo es público por acuerdo con Casa Mueble. Falta guardar la confirmación escrita. Qué se commitea (.dae, PDF, tabla de piezas, fixture JSON) lo decide el equipo; hasta entonces `CLAUDE.md` sigue diciendo que Sabrina es local. Esto **no** cubre el envío de los PDF a APIs externas (OCR/LLM), que sigue pendiente aparte.
2. **Significado de los segmentos del código** (`0001-01-M01-Cxx`, `0001-02-M02-Cxx`): sin confirmar con Casa Mueble.
3. **qrId de mueble y de módulo, y nombres de módulo** (R6): asumidos para el prototipo.
4. **Leyenda del canteado** (inf/sup/izq/der) y orientación A/B: del equipo, sin confirmar (consulta 2).
5. **Canto ABS 22 x 0,22 mm**: confirmado por Casa Mueble el 16/10, a contrastar con factura o rollo.
6. **Profundidad de Olmo**: el mock dice 550 mm y la caja de las piezas del .dae mide 571 mm (ancho y alto coinciden). Falta decidir cuál vale y por qué.
7. **Los PDF de Sabrina** (export del 14/10) están disponibles desde el 3/11 en la carpeta del paquete, pero todavía no en `Sabrina/`. Contrastado el 3/11 contra los PDF: totales por tablero (Blanco 18 = 50, fondo 3 mm = 13, Cedro 17 + 25 = 42; 105 en total) y cantidades por código frente al .dae. **Sin contrastar:** medidas y canteado fila por fila contra los PDF.

## Siguiente paso (3/11)
Con Sabrina resuelta como fixture, el siguiente paso del repo es **implementar el esquema del PDF** de `docs/spec-esquema-pdf.md` (sujeto a su aprobación; no se programa sin spec aprobada). Orden propuesto, una sesión de Claude Code por cada uno y con commit y pruebas en verde al cerrar:
1. `src/pdf/`: tipos de `CutListPdf`, validador puro (INV-0 a INV-15, catálogo de razones) y parser puro de elementos de texto con posición (`TextoPdf`), con entradas sintéticas (`docs/test-plan-esquema-pdf.md`, más los casos de INV-15 que faltan). No necesita credenciales ni red.
2. Adaptador de OCR (`OcrLlm`, primera parte): extracción con un proveedor de OCR, respuestas guardadas como fixtures y conexión al mismo parser. Requiere credenciales del proveedor y la confirmación del envío a APIs externas.
3. LLM, reconciliación y Eval Harness del módulo B, con Sabrina como dataset principal de cantos y el Olmo como secundario.

Antes del paso 1: aprobar `spec-esquema-pdf.md` y actualizar `CLAUDE.md` (sección del PDF y Sabrina) y `ESTADO.md`.