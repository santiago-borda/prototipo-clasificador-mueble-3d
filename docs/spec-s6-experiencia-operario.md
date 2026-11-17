# Especificación — S6: experiencia del operario (guía de armado, progreso y medición)

Versión: **v0.1 (17/11/2026), borrador a aprobar por el equipo.** No hay código. Es la spec con más datos del dominio sin confirmar: leer §7 antes de aprobar.
Antecedentes: `docs/modelo-de-datos.md` (entidades 7 y 12 a 16), `docs/adr/ADR-004-autenticacion.md` (operario sin usuario), `docs/diagnostico-2026-11.md` (A1, A3), `docs/consultas-casa-mueble-arquitectura.md` (CA-4, CA-9, CA-13, CA-15, CA-16), `docs/contexto-casa-mueble-pdf.md` (R4).
Condición: S2 cerrada. S4 hace falta solo para cargar los pasos desde el backoffice.

---

## 1. Objetivo y alcance

Que el operario, desde el celular y con las manos ocupadas, siga el armado de un mueble paso a paso, vea en el 3D las piezas de cada paso y marque lo que hizo. Y que el sistema registre los tiempos para medir si ayuda (objetivo del PFG).

Incluye:
1. Guía de armado: pantalla nueva `/armado/<id>` con un paso por vez.
2. Progreso: marcar un paso como hecho y deshacerlo.
3. Carga de pasos en el backoffice (a mano).
4. Eventos de uso y un informe de tiempos.
5. Modelo y casos de uso del check de cortes, **sin pantalla** (R4 sin confirmar).

**No es objetivo:** generar el orden de armado automáticamente; la pantalla del check de cortes; trabajar sin conexión; cambiar la ficha, el visor o el escáner (salvo la parada U-ficha); tiempos por persona.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| S6-D1 | Los pasos los carga una persona en el backoffice. El sistema puede **proponer** qué piezas corresponden a un paso, pero no guarda nada sin que la persona lo confirme. | CA-9 abierta. La IA propone; una persona decide. |
| S6-D2 | Un paso tiene: orden, título corto, texto opcional, imagen opcional y los tipos de pieza que usa, con cantidad. | Modelo de datos, entidad 14. |
| S6-D3 | La pantalla de un paso muestra, de arriba abajo: número de paso y total, título, el visor 3D con las piezas del paso resaltadas, la lista de piezas (código corto, nombre, cantidad) y dos botones fijos abajo: «Anterior» y «Hecho, siguiente». | Una mano, sin scroll para lo principal. |
| S6-D4 | Reglas de uso en el taller: botones de al menos 56 px de alto, texto de al menos 18 px, contraste alto, nada depende de `hover`, nada exige escribir. Un toque equivocado se corrige con «Deshacer» durante 10 segundos y con «Anterior» siempre. | Manos ocupadas, guantes, polvo. |
| S6-D5 | El visor es el mismo componente de la ficha, con otra lista de piezas resaltadas. No se duplica. Las reglas de rendimiento de `CLAUDE.md` valen igual. | Reuso; no se cambia el visor. |
| S6-D6 | La guía se abre por un enlace con el id opaco de la versión publicada (no por el QR de una pieza, que no cambia). | No tocar la ficha. Ver U-ficha. |
| S6-D7 | El progreso es por mueble, compartido entre dispositivos: si dos operarios arman el mismo mueble, ven el mismo avance. Se guarda como eventos (hecho, deshecho); el estado de un paso es el de su último evento. | CA-13 (una unidad por mueble, ASUMIDO). Regla 5 del modelo. |
| S6-D8 | Autor de un evento del operario: identificador aleatorio del dispositivo (cookie propia, un año) y nombre opcional. Nunca se presenta como identidad verificada. | ADR-004, decisión 6. |
| S6-D9 | Eventos de uso: `qr-escaneado`, `ficha-abierta`, `guia-abierta`, `paso-visto`, `paso-hecho`, `paso-deshecho`, `corte-marcado`. Catálogo cerrado. Cada uno con hora del servidor y hora del celular. | Modelo de datos §4.5. |
| S6-D10 | Registrar un evento nunca frena al operario: si falla, la pantalla sigue y el evento se pierde (se cuenta la falla). Marcar un paso sí espera la respuesta; si falla, lo dice y deja reintentar. | El progreso importa; la medición es secundaria. |
| S6-D11 | Informe de tiempos (solo backoffice): por mueble, duración entre `guia-abierta` y el último `paso-hecho`, y duración por paso (de `paso-visto` a `paso-hecho`). Se informa la mediana y la cantidad de datos, nunca por dispositivo ni por nombre. | CA-16. No es una herramienta de control de personas. |
| S6-D12 | Check de cortes: se crean las tablas `board_sheet`, `cut_check` y `physical_piece` y los casos de uso `marcarCorte` y `desmarcarCorte` con el supuesto R4 (un check por pieza física por tablero, sin orden). **No se hace pantalla** hasta las consultas 35 a 37. | R4 provisorio; el modelo es barato de ajustar, una pantalla no. |
| S6-D13 | La revisión humana de asociaciones (`association_review`) se crea acá como tabla y caso de uso (`decidirAsociacion`), con la regla: no se publica una versión con instancias dudosas o sin asociar sin revisión. La pantalla de revisión es la del spike de CSV, adaptada, y se especifica aparte. | Modelo de datos §4.4. Sin esto no hay versión publicada con guía. |

## 3. Contrato (casos de uso, TypeScript puro en `src/assembly/`)

```ts
export function guardarPasos(deps, session: Session, designVersionId: string, pasos: readonly NuevoPaso[]): Promise<void>;
export function leerGuia(deps, guideId: string): Promise<Guia | null>;                 // lectura abierta por id opaco
export function marcarPaso(deps, guideId: string, stepId: string, autor: AutorOperario, kind: "hecho" | "deshecho"): Promise<EstadoGuia>;
export function registrarEvento(deps, evento: NuevoEvento): Promise<void>;
export function informeDeTiempos(deps, session: Session, furnitureId: string): Promise<InformeTiempos>;
export function decidirAsociacion(deps, session: Session, input: NuevaRevision): Promise<void>;
export function marcarCorte(deps, guideId: string, boardSheetId: string, physicalPieceId: string, autor: AutorOperario): Promise<void>;
```

Excepciones con nombre: `GuiaNoPublicadaError`, `PasoInexistenteError`, `PiezaFueraDeLaVersionError(code)`, `CantidadExcedidaError(code, pedida, disponible)`, `EventoDesconocidoError(type)`, `VersionConDudosasError(pendientes)`, `PiezaFisicaInexistenteError`.

## 4. Requisitos

- **O1.** Una guía solo se lee si su versión está publicada.
- **O2.** Un paso solo usa tipos de pieza de su versión, y la suma de cantidades de un tipo entre todos los pasos no supera su cantidad.
- **O3.** El estado de un paso es el de su último evento. Marcar dos veces «hecho» no duplica el estado.
- **O4.** El avance es el mismo desde cualquier dispositivo.
- **O5.** Al recargar la página, la guía abre en el primer paso sin hacer.
- **O6.** La pantalla de un paso cumple S6-D3 y S6-D4 a 360 px de ancho, sin scroll horizontal.
- **O7.** El visor resalta exactamente las instancias de los tipos de pieza del paso.
- **O8.** Un evento con un tipo fuera del catálogo se rechaza. Un evento nunca guarda más datos del autor que el identificador del dispositivo y el nombre opcional.
- **O9.** La falla al registrar un evento no interrumpe la pantalla.
- **O10.** El informe de tiempos no devuelve identificadores de dispositivo ni nombres.
- **O11.** Guardar pasos exige sesión con permiso de escritura (S4) y una versión que no esté publicada, o crea una versión nueva.
- **O12.** No se publica una versión con instancias dudosas o sin asociar sin revisión.
- **O13.** La ficha (`/p/<qrId>`), el visor dentro de la ficha, el escáner y el importador no cambian.

## 5. Criterios de aceptación y pruebas

Automáticas (`tests/assembly/`): casos de uso con repositorios en memoria y reloj inyectado; pantallas con jsdom, como las pruebas actuales del spike de CSV.

| Id | Requisito | Qué | Esperado |
|---|---|---|---|
| PO-1 | O1 | `leerGuia` de una versión en borrador y de una publicada | `GuiaNoPublicadaError`; la guía |
| PO-2 | O2 | paso con un código de otra versión; pasos que suman 3 de un tipo con cantidad 2 | `PiezaFueraDeLaVersionError`; `CantidadExcedidaError` |
| PO-3 | O3 | hecho, hecho, deshecho, hecho sobre el mismo paso | estados: hecho, hecho, pendiente, hecho; cuatro eventos guardados |
| PO-4 | O4 | dos dispositivos marcan pasos distintos | los dos leen el mismo `EstadoGuia` |
| PO-5 | O5 | guía de 5 pasos con 1, 2 y 4 hechos | abre en el 3 |
| PO-6 | O6 | pantalla de un paso a 360 px | están el número de paso, el título, el visor, la lista y los dos botones; los botones tienen la clase de alto mínimo; ningún texto de acción depende de `hover` |
| PO-7 | O7 | paso con dos tipos del primer fixture | las instancias resaltadas son las de esos dos códigos y ninguna otra (misma función que usa la ficha) |
| PO-8 | O8 | evento con `type: "otro"`; evento con campos extra en el autor | `EventoDesconocidoError`; los campos extra no se guardan |
| PO-9 | O9 | el registro de eventos falla | la pantalla sigue; `marcarPaso` no se ve afectado |
| PO-10 | S6-D10 | `marcarPaso` falla | la pantalla muestra el error y un botón para reintentar; el paso no figura como hecho |
| PO-11 | O10, S6-D11 | informe con eventos de tres dispositivos y reloj fijo | medianas calculadas a mano; ningún identificador de dispositivo ni nombre en la salida |
| PO-12 | O11 | `guardarPasos` sin sesión; con permiso de lectura; sobre una versión publicada | `SesionRequeridaError`; `PermisoDenegadoError`; `VersionInmutableError` |
| PO-13 | O12 | publicar con una instancia dudosa sin revisión; después de `decidirAsociacion` | `VersionConDudosasError(1)`; se publica |
| PO-14 | S6-D12 | `marcarCorte` dos veces la misma pieza física en el mismo tablero; pieza de otro mueble | un solo check vigente; `PiezaFisicaInexistenteError` |
| PO-15 | S6-D4 | toque en «Hecho, siguiente» y «Deshacer» dentro de los 10 s (reloj falso); después de los 10 s | vuelve al paso y queda pendiente; el botón ya no está |
| **PO-16** | O13 | pruebas existentes de la ficha, el visor, el escáner y el importador, sin modificar | pasan |
| PO-17 | — | `src/assembly/` (casos de uso) | no importa `next/*`, React ni three (prueba estática) |

**Prueba manual M-S6 (con el equipo; con Casa Mueble si es posible):** armar el primer fixture siguiendo la guía en un celular, en el taller o en condiciones parecidas. Se anota: toques equivocados, textos que no se leen, pasos donde hubo que soltar la pieza para usar el celular. Es validación de uso, no una métrica.

Al cerrar: `typecheck`, `lint`, `npm test` y `build` en verde.

## 6. Paradas obligatorias

| Parada | Antes de | Qué aprueba el equipo |
|---|---|---|
| U-pasos | cargar pasos del primer fixture | el contenido: de dónde sale el orden de armado del primer fixture (respuesta a CA-9 o un orden escrito por el equipo y marcado ASUMIDO) |
| U-pantalla | escribir la pantalla | un boceto de la pantalla del paso (S6-D3), revisado en un celular |
| U-ficha | tocar la ficha | **levantar o no el congelamiento de la ficha** para agregar el enlace «Armar este mueble». Casa Mueble pidió que la guía se abra desde la ficha de cualquier pieza (consulta 44). Sin este enlace, la guía solo se abre por URL. Es un cambio visible: lo decide el equipo. |

Sin dependencias nuevas.

## 7. Supuestos (ASUMIDO) — todos reversibles

| Supuesto | Consulta | Si cambia |
|---|---|---|
| Los pasos se cargan a mano | CA-9 | Se suma un importador de pasos; el modelo no cambia |
| Un mueble se fabrica una vez | CA-13 | Se agrega la entidad «unidad» y el progreso pasa a ser por unidad |
| El operario no inicia sesión | CA-4 | Un ajuste por carpintería exige sesión para escribir progreso |
| Check de cortes: un check por pieza física por tablero, sin orden | CA-15 (consultas 35 a 37) | Cambian `board_sheet` y `cut_check`; no hay pantalla que rehacer |
| Se miden tiempos por dispositivo, sin datos personales, y no se muestran por persona | CA-16 | Se ajusta el catálogo de eventos o el informe |
| 10 segundos para deshacer; 56 px; 18 px | M-S6 | Son constantes |

## 8. Orden de trabajo

1. Migraciones de las tablas de S6 y repositorios (batería de contrato de S2).
2. Casos de uso de pasos y progreso (PO-1 a PO-5, PO-12).
3. Revisión humana y regla de publicación (PO-13).
4. Eventos e informe (PO-8, PO-9, PO-11).
5. Check de cortes, sin pantalla (PO-14).
6. Paradas U-pasos y U-pantalla; pantalla de la guía (PO-6, PO-7, PO-10, PO-15).
7. Carga de pasos en el backoffice.
8. Parada U-ficha.
9. PO-16, PO-17 y M-S6. Actualizar `CLAUDE.md`.
