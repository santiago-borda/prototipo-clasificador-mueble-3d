# Contexto de Casa Mueble para la spec del PDF

Fuente: reunión del 20/10 con Casa Mueble (notas de Gemini y anotaciones del
equipo) y análisis de un PDF de ejemplo (23/10). Las notas son transcripciones
del equipo, no el texto original. Todo lo "verbal" está pendiente de
confirmación escrita.

## Decisiones de la reunión del 20/10
- Entrada: PDF del complemento OpenCutList de SketchUp, no Excel (Gabriel: el
  Excel "no es funcional"). El PDF "sale siempre igual". El sistema lo
  interpreta y lo convierte a un formato estructurado. A Casa Mueble le
  preocupan los errores de interpretación: el sistema compara con el .dae y
  avisa discrepancias.
- Documentos que Casa Mueble pasaría: PDF, plano, imágenes faltantes y COLLADA.
- Versión de prueba (pedido de Casa Mueble): sección de cortes (R4), modelado
  con QR, tablas de etiquetas e interpretación del canteado. Sin fecha
  (consulta 60).
- Entornos: testing en taller-test.casamueble.com.ar (lo monta el equipo);
  preproducción y producción las provee Casa Mueble. Dominio de los QR
  impresos sin definir (consulta 59): no imprimir.

## Reglas del PDF (Gabriel y Juan, 20/10)
1. Se usa la columna "Finales". "Ajustadas" descuenta 1 mm del canto.
   No está dicho si "Finales" incluye el canto (consulta 51).
2. Cada medida tiene L y A. "Tiras de cantos" tiene 4 subcolumnas con íconos
   (rectángulo con un lado resaltado): 1 = inferior, 2 = superior,
   3 = izquierdo, 4 = derecho. Las dos primeras son lados L; las dos últimas,
   lados A. Falta confirmación escrita (consulta 56).
3. L y A no son "largo" y "corto": se comparan L con A; la veta puede dejar L
   más corto que A.
4. El dibujito del PDF está mal y se ignora. El sistema arma el esquema:
   rectángulo proporcional a las medidas, con pintados los lados con canto.
5. Todos los datos salen del modelo 3D; según Gabriel no debería haber
   discrepancias salvo error de interpretación.
6. Designación proyecto-mueble-módulo-corte. El número de corte es continuo
   en el proyecto.

## Análisis del PDF de ejemplo (23/10, otro cliente, Cedro 18 mm)
- No tiene texto seleccionable: generado con "Microsoft: Print To PDF", solo
  trazados. Hay que leerlo como imagen. Un OCR de prueba (Tesseract) confundió
  códigos y medidas: no alcanza como única vía (consulta 58: pedir PDF con
  texto o CSV del complemento).
- Estructura: página 1 con resumen (tablero, cantidad, partes). Por tablero:
  diagrama de corte con letras (A, B, C...) y debajo el listado con No.,
  Designación, Cantidad, medidas Ajustadas y Finales (L y A) y las 4
  subcolumnas de cantos. Pie con "La fibra sigue la longitud", cantidad de
  piezas, longitud de cortes y eficiencia.
- Un mismo código aparece en más de un tablero. La cantidad es por tablero:
  hay que sumar entre tableros para comparar con el modelo.
- El canto se marca con puntos rojos en la subcolumna correspondiente, con
  texto tipo "Canto <material> ~0 mm × 22 mm". Se lee por posición.
- Las "Ajustadas" van en rojo con "~" y difieren de las "Finales" en 1 mm en
  algunas piezas.
- Íconos junto al código y junto a L o A en "Ajustadas": significado NO
  explicado ni confirmado (el segundo parecería indicar la dimensión que sigue
  la fibra). No usarlos.
- Existe un documento genérico Funcionamiento_OpenCutList.md sobre el PDF y
  el CSV, no verificado contra un archivo real.

## Sección de cortes (R4)
Requisito de la versión de prueba. Representar la tabla y el listado de cortes
del PDF: la placa y cómo se corta, con el listado. Se hacen primero los cortes
verticales que cruzan toda la placa. El operario que corta marca un check por
corte realizado. El check puede hacerse desde la optimización o desde el
listado (notas del 15/10).
Pendientes: formato exacto que quiere Gabriel, sin captura (consulta 35);
planilla por placa o por material (consulta 36); dispositivo, registro de
quién y cuándo, y uso simultáneo (consulta 37); si el "listado de cortes" es
la lista de piezas por tablero o una secuencia de cortes (no confirmado).