# Fixture: gabinete de prueba (CSV de OpenCutList)

Modelo de prueba armado por el equipo en SketchUp para validar la exportación de OpenCutList como entrada del sistema, en lugar del PDF. **No contiene datos de clientes de Casa Mueble**: se puede commitear.

## Origen

- Herramienta: SketchUp + extensión OpenCutList 7.1.0 (interfaz en español).
- Fecha de la exportación vigente: 16/11/2026. Las exportaciones del 14/11/2026 se descartaron: eran anteriores a la asignación de canto en la base `C02` y al renombre del canto.
- Autor: equipo del PFG (Santiago Borda).
- Unidades: milímetros.

## Archivos

| Archivo | Qué es |
|---|---|
| `gabinete-prueba-canto.csv` | Exportación "Listado de piezas" con columna de cantos visible. Entrada principal del parser. |
| `gabinete-prueba-listainstancias.csv` | Exportación "Lista de instancias". Se usa para el caso de rechazo (no tiene columna Cantidad). |
| `gabinete-prueba-opencutlist.dae` | Modelo 3D exportado de SketchUp (COLLADA). El canto se llama `Canto_Blanco`, como en los modelos reales. |
| `diagrama-blanco18.svg` | Diagrama de corte del material `Blanco 18`, con los cortes visibles (grupo `OCL_CUT`). |
| `diagrama-canto.svg` | Diagrama de la tira de canto (SVG). Opcional; no aporta datos que no estén en el CSV. |
| `diagrama-corte-blanco18.pdf` | Diagrama de corte impreso con "Microsoft: Print To PDF" (sin capa de texto). Solo para comparar. |

## Opciones de exportación

- En OpenCutList, Opciones: columna de cantos visible (desmarcar "ocultar la columna de cantos").
- Exportar desde la pestaña Piezas:
  - Fuente: "Listado de piezas" (y "Lista de instancias" para el segundo CSV).
  - Formato: CSV.
  - Separador: punto y coma.
  - Codificación: UTF-8.
- Diagrama de corte: mostrar los cortes antes de exportar el SVG. Sin esa opción el SVG no trae `OCL_CUT`.

## Verdad de referencia

### Piezas

| Código | Pieza | L x A x espesor (mm, finales) | Cantidad | Material |
|---|---|---|---|---|
| `0001-01-M01-C01` | Lateral | 700 x 400 x 18 | 2 | Blanco 18 |
| `0001-01-M01-C02` | Base | 764 x 400 x 18 | 1 | Blanco 18 |
| `0001-01-M01-C03` | Tapa | 800 x 400 x 18 | 1 | Blanco 18 |
| `0001-01-M01-C04` | Fondo | 764 x 664 x 3 | 1 | Blanco 3 mm |

- El lateral es una única definición de componente con dos instancias. En el listado de piezas sale en una sola fila con Cantidad 2.
- Total: 4 tipos de pieza y 5 piezas físicas.

### Cantos

| Código | Inferior | Superior | Izquierdo | Derecho |
|---|---|---|---|---|
| `C01` (lateral) | no | sí | sí | no |
| `C02` (base) | no | sí | no | sí |
| `C03` (tapa) | sí | sí | sí | sí |
| `C04` (fondo) | no | no | no | no |

Mapeo de columnas del CSV a lados, verificado el 14/11/2026 cruzando el CSV con los íconos del PDF de la misma exportación:

| Columna del CSV | Lado |
|---|---|
| `Longitud del borde 1` | inferior |
| `Longitud del borde 2` | superior |
| `Ancho del borde 1` | izquierdo |
| `Ancho de borde 2` | derecho |

El lado inferior se dedujo por descarte: ninguna pieza de este modelo tiene solo el canto inferior. El orden de la ventana "Tiras de cantos" de OpenCutList (arriba primero, abajo después) no coincide con esta numeración: no usarlo como referencia.

### Material de canto

- Nombre: `Canto_Blanco`, siguiendo la convención `Canto_<color>` de los modelos reales (por ejemplo `Canto_Blanco` y `Canto_Cedro`).
- En el CSV se exporta como `Canto_Blanco (0,2 mm x 22,0 mm)`: espesor y ancho, en ese orden.
- **El CSV redondea el espesor a un decimal.** En OpenCutList el espesor está configurado en 0,22 mm y el CSV dice 0,2. El SVG conserva el valor real (la tapa mide 799,56 mm: 800 − 2 × 0,22). No usar el espesor del CSV como dato exacto.
- El ancho de 22 mm sale de la lista de anchos estándar del material (se quitó el de 19 mm para que se elija el de 22).
- Metros de canto de este modelo (suma de las filas de tipo Canto, sin desperdicio): 5764 mm.

### Diagrama de corte (SVG de `Blanco 18`)

- Placa de 2800 x 2070 mm, margen de 10 mm y espaciado entre piezas de 3 mm (configuración del optimizador, según el Resumen del PDF).
- Piezas: `A` = `C03`, `B` = `C02`, `C` y `C` = `C01`. La letra es la columna `No.` del CSV dentro del mismo material.
- 10 líneas de corte en el grupo `OCL_CUT`. Su suma da unos 11,32 m, igual que "Longitud de cortes" del PDF.
- Estructura por niveles:
  - Nivel 1: refilado de los bordes y corte de la franja que contiene las piezas (una vertical que cruza toda la placa).
  - Nivel 2: 4 horizontales que separan las piezas dentro de la franja.
  - Nivel 3: 3 verticales cortas que ajustan el ancho de cada pieza.
- El orden real en que se hacen los cortes en el taller no está confirmado.

## Particularidades del formato que cubre el fixture

- Valores con unidad y coma decimal (`799,6 mm`, `0,32 m²`). Vacío = `""`.
- Precisión de un decimal en el CSV. Las medidas "crudas" (finales menos el espesor del canto) son las "Ajustadas" del PDF. Usar tolerancia de al menos 0,1 mm al compararlas.
- Encabezados irregulares: `Etiquetas` aparece dos veces, y conviven `Ancho del borde 1` y `Ancho de borde 2`.
- Filas con `Tipo de material = Canto` (designación `<código> - Longitud del borde 1`, etc.): no son piezas.
- La letra de `No.` es local de cada material (hay una `A` en Blanco 18 y otra en Blanco 3 mm). La clave es el código.
- En los SVG: escala 1 unidad = 1 mm; las piezas llevan solo la letra de `No.`, no el código; los `id` se repiten; las coordenadas de las líneas de corte vienen redondeadas a 0,1 mm.
- En el .dae existen materiales internos de SketchUp, como `edge_color000255`, que no son cantos y hay que ignorar.

## Advertencias

- Los códigos `0001-01-…` coinciden con los de los fixtures de Olmo y Sabrina. Este gabinete es un modelo de prueba independiente: no mezclarlo con ellos en una misma carga.
- No incluye las anomalías de los modelos reales (`_` inicial y `__` final en el .dae, geometrías sin código, varios tableros por material).