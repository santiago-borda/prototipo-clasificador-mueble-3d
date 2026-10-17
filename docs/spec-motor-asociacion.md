# Especificación — Motor de asociación explicable y Eval Harness

Estado: **v3, para commit** (16/10/2026). Incorpora la re-revisión de la v2 (Opus, 16/10, §21): 3 bloqueantes (B1–B3) y 7 cambios importantes resueltos; decisiones del equipo sobre B2, B3 y el etiquetado. Sin código todavía.
Antecedentes: decisión del 13/10 (regla exacta por código primero; puntaje interpretable que verifica y respalda), `docs/spec-siguiente-paso.md` (su cambio S5 se especifica acá), criterio A4 actual (`src/data/mapping.ts`).
Anexo local (no va al repo): `Sabrina/docs/anexo-motor.md`, con los códigos, cifras y hallazgos del segundo fixture. **Este documento no cita códigos ni cifras de Sabrina.**

Convención de nombres: los refinamientos de este diseño se llaman **RF** (§14) y los supuestos **AS** (§15), para no confundirlos con los R1–R7 de Casa Mueble ni con los S1–S5 de `docs/spec-siguiente-paso.md`.

---

## 1. Objetivo

Asociar cada instancia física del modelo 3D (.dae) con un tipo de pieza del listado de Casa Mueble, **dentro de un mismo mueble**, y devolver para cada instancia:

- un **nivel** (la "certeza" de la decisión del 13/10): `segura`, `dudosa` o `sin-asociar`;
- la **evidencia** que lo justifica (qué se comparó, contra qué y con qué resultado);
- para lo que no es segura, **candidatos** ordenados (top-3) con su evidencia. La lista puede quedar vacía (§6.3).

Principios (decisión del 13/10, sin cambios):

- **La IA nunca decide sola.** Sin código válido no hay resolución automática: el motor sugiere y una persona decide.
- **Conservador:** prefiere "dudosa" a un error seguro. Toda instancia con componente que no sea segura es `dudosa`.
- **Explicable:** cada nivel se explica leyendo la lista de etapas y razones; no hay pesos ni modelos opacos.
- **No-Wrapper LLM:** no se usa un LLM para decidir ni para puntuar.
- **Clave de asociación:** (mueble, código). Un código solo se interpreta dentro de su mueble (los códigos se repiten entre muebles).

El **Eval Harness** mide al motor con casos reales y con perturbaciones sintéticas reproducibles, y tiene un gate verificable.

**Precalculado, no en vivo (decisión del equipo, 16/10, resuelve B3 de la revisión).** El motor **no** corre en el celular del operario. `AssociationRun` se genera una sola vez por versión (mismo runner que el harness, §4c) y se publica versionado por `modelId` + `listadoId` (§9.7). La app de producción solo **lee** ese archivo publicado; nunca invoca `associate.ts` en el cliente. Si el `modelId` del .dae que sirve la app no coincide con el de ningún `AssociationRun` publicado, no se vincula nada y se avisa (mismo criterio conservador que el resto del motor). Motivos: costo de `DOMParser` + three en un celular con datos móviles sin beneficio (el resultado no cambia entre escaneos); lo que pasó G1–G5 en CI es exactamente lo que ve el operario, sin un segundo entorno de ejecución sin verificar; coherente con "QR impreso versionado e inmutable" (la asociación ya se trata como dato fijo por versión); simplifica la ceguera temporal (§10.6): "primera corrida sobre un `modelId`" es un evento único y registrable, no "la primera vez que algún celular lo corrió".

## 2. Alcance, fases y plazos

### 2.1 Plazos

- Pre-entrega final: **20/11/2026**. Entrega final: **21/12/2026** (fechas definidas por el equipo el 15/10).
- Entregas semanales: se muestran avances. En la pre-entrega se debe demostrar que el MVP funciona **en un contexto real**; no hace falta que esté completo. **"Contexto real" (definición del equipo, 16/10): poder escanear un QR real de una pieza y que el flujo con el sistema funcione bien.**
- **Cronograma (confirmado por el equipo, 16/10): igual a la tabla de §2.3.** Deja de ser una propuesta a contrastar.

### 2.2 Fase 1 — núcleo (por dependencias, no estrictamente en orden)

1. **Congelar entradas.**
   - **Nombre:** Olmo está confirmado por Casa Mueble (consulta 34, cerrada el 16/10). Queda pendiente que los diseñadores renombren el .skp, el .dae y la carpeta del paquete (hoy dicen "Oslo", también en las rutas de textura del .dae) y **reexporten** el .dae (consulta 48, fecha sin acordar). No se edita el .dae a mano.
   - **Decisión del equipo (16/10): se espera la reexportación antes de etiquetar.** Cambia seguro el hash y puede cambiar el `id` de los nodos (no verificado), y las etiquetas se atan a `modelId` (§10.2).
   - Mientras tanto se trabaja con el .dae actual de Olmo como entrada **provisoria**: su `modelId` y su `eval/esperados.json` son provisorios.
   - **La reexportación es un cambio controlado:** el .dae nuevo y su `esperados.json` regenerado (revisado a mano) van en el mismo commit; si no, G2 falla por diseño. Si Casa Mueble corrige el nombre de C01 en la reexportación, la expectativa de C01 cambia (§6.1) y se actualizan `esperados.json` y `tests/olmo.test.ts` (que hoy espera 1 anomalía).
   - Agregar `.gitattributes` con `*.dae binary`, para que la conversión de fin de línea no cambie el hash. **El .dae ya está commiteado:** el alta de `.gitattributes` va acompañada de `git add --renormalize .` en el mismo commit, o el hash en Windows y en Linux queda distinto. M1 prueba ambos fines de línea.
   - Fijar `listadoId` (§5.1).
2. **Adapter** `.dae` → `Observation` (§4, §5).
3. **Motor** (§6) y **Eval Harness** (§9) con casos sintéticos y con el .dae provisorio de Olmo. **Se desarrollan en paralelo con la espera de la reexportación y del etiquetado** (decisión del 16/10).
4. **Herramienta de etiquetado** (§10.3): se construye en paralelo; **etiqueta Casa Mueble** (decisión del 16/10) cuando llegue la reexportación. **Confirmado por el equipo el 16/10: sigue en paralelo**, con el plan B de abajo si no llega a tiempo.
   - Fecha límite propuesta: **13/11**, condicionada a (a) una fecha comprometida de reexportación (consulta 48) y (b) la disponibilidad de quien etiquete (consulta 55). Si al cumplirse la fecha de corte que fije el cronograma no hay reexportación, se aplica el plan B.
   - Plan B: la concordancia humana se reporta "no ejecutado".
5. **Reporte con concordancia** (§10.5, §10.6).
6. **Publicación de `AssociationRun`** (precalculado, §1, §9.7) y lectura por el visor y la ficha (§11), que vinculan **solo seguras**. **Entra en el mínimo de la pre-entrega** (§2.3): es lo que se ve al escanear un QR.

### 2.3 Cronograma (confirmado por el equipo, 16/10)

| Semana | Entregable | Criterios |
|---|---|---|
| 19/10 | Spec v3 commiteado en `docs/`. `.gitattributes` + renormalize, `modelId`/`listadoId`, normalización del nombre | M1, M3, M4 |
| 26/10 | Adapter desde XML, .dae sintéticos mínimos, runner del eval (`npm run eval`) | M2, M20 |
| 2/11 | Motor (pasadas 1 y 2), inconsistencias de corrida, evidencia blanda | M5–M7, M15, M16 |
| 9/11 | `eval/esperados.json` de Olmo; publicación del `AssociationRun` e integración con visor y ficha (solo seguras); harness con los casos críticos (P1, P3–P8, P10–P12) | M8, M10, M13 |
| 16/11 | QR impresos, prueba en celular, ensayo de la demo | — |
| **Pre-entrega 20/11** | MVP en contexto real: se escanea un **QR real, impreso, de una pieza de Olmo** y el flujo funciona bien: escáner → ficha → visor 3D con las piezas resaltadas, vinculadas por el `AssociationRun` publicado (solo seguras). El harness corre con sintéticos y el reporte muestra niveles, evidencia e inconsistencias. Concordancia humana: la que haya llegado, o "no ejecutado" | Publicación integrada al visor y la ficha (§11); QR impresos con la ruta `/qr` del prototipo (fuera de este spec; `NEXT_PUBLIC_BASE_URL` fija y sin renombrar el proyecto de Vercel, Estado §5); reexportación (48) y etiquetado (55) solo para la concordancia |
| Después del 20/11 | Herramienta de etiquetado si no cerró antes (M11, M12); resto del catálogo de perturbaciones (M9); baseline y G5 (M18); modo sombra (M17); reportes públicos (M14, M19) | — |
| **Entrega final 21/12** | Fase 1 completa; fase 2 si da el tiempo | Cronograma |

En la demo, la instancia dudosa (hoy C01 de Olmo) se ve sin vincular: es el comportamiento esperado de §6.1 y conviene explicarlo, no esconderlo.

Si falta tiempo, el proyecto reduce primero API/OT y extracción (B). Qué se recorta de este spec lo decide el equipo con el cronograma.

### 2.4 Fase 2 — señal mínima en la ficha (B)

- Insignia "dudosa" en la ficha, con la evidencia en un panel plegable.
- El visor resalta el candidato top-1 en estilo **"sin confirmar"**: punteado o translúcido, nunca el color de una segura.
- Con empate en el top no resalta ninguno y lista los empatados. Sin candidatos no resalta nada.

### 2.5 Diferida — pantalla de revisión (C)

- Aceptar o rechazar candidatos y producir decisiones `revision`.
- El esquema de decisiones (§10.2) ya la contempla, así que agregarla no rompe nada.
- Diferirla es un refinamiento de lo definido hasta ahora (RF9).

### 2.6 Fuera de alcance

- Resolución automática sin código (opción A, RF2: solo con datos y validación del profesor).
- Asignación global óptima (enfoque 2; §6.5, RF8).
- Texturas.
- Distinguir mesas izquierda/derecha.
- API/OT.
- Extracción (B de la tesis).
- Verificación dura de canto (el camino queda documentado en §8.3).
- Las etiquetas impresas: el motor trabaja con instancias del .dae, no con etiquetas.
- Recalcular la asociación en el cliente: el motor es precalculado (§1).

## 3. Definiciones

| Término | Definición |
|---|---|
| **Instancia** | Una aparición física de una pieza en el .dae (un componente instanciado), o una malla suelta sin componente. |
| **Tipo** | Una fila del listado (`PieceType`): código, nombre, medidas, espesor, material, cantidad, canteado. |
| **Formato de código** | `^\d{4}-\d{2}-M\d{2}-C\d{2}$` (llamado `C` en esta tabla). **ASUMIDO** (AS1). El código es **opaco**: solo se valida el formato y no se interpretan sus segmentos. |
| **Código canónico** | Nombre de componente que matchea `^_?C$`: `C` o `_C`, sin guiones bajos de más. Es código válido, sin anomalía (§6.1). |
| **Código anómalo** | Nombre de componente que matchea `^_*C_*$` (uno o más `_` de más, al inicio o al final, en cualquier combinación) y **no** es canónico. Código válido, con techo `dudosa` (§6.1). Reemplaza y unifica las dos filas separadas de la v2 (resuelve B2 de la revisión). |
| **Código normalizado** | El `C` extraído de un nombre canónico o anómalo (quitando todos los `_` de más). |
| **Reclamantes(T)** | Instancias cuyo código normalizado (canónico o anómalo) es igual al código de T, sin importar sus medidas. |
| **Cupo restante r(T)** | `quantity(T) − seguras(T)`, calculado al terminar la pasada 1 y **fijo** durante la pasada 2. |
| **Faltante** | reclamantes(T) < quantity(T). No se calcula para un T con `codigo-duplicado` (§6.2). |
| **Sin confirmar** | seguras(T) < reclamantes(T): algún reclamante bajó a dudosa. No se calcula para un T con `codigo-duplicado` (§6.2). |
| **Empate** | Las tuplas del top-1 y el top-2 de una instancia son idénticas, **tras cuantizar el elemento 7** (§6.3). |
| **Conjunto top-1** | El tipo con mejor tupla, o todos los empatados en el primer puesto. |
| **Conflicto en T** | La cantidad de dudosas cuyo conjunto top-1 incluye a T es mayor que r(T). Una dudosa con empate cuenta para **cada** tipo empatado y además se cuenta aparte como empate. |
| **Límite conocido** | Perturbación indetectable por construcción con la información disponible (§9.3). Se reporta aparte y queda fuera del gate. |
| `modelId` | `sha256` del archivo .dae (bytes). |
| `listadoId` | `sha256` de la serialización canónica del listado (§5.1). |
| `instanceKey` | Ruta de `id` de nodos del .dae desde la raíz hasta el nodo envoltorio de la instancia, por ejemplo `ID3/ID155`. En COLLADA los `id` son únicos en el documento, así que el último `id` ya identifica la instancia; la ruta es para leer. **Estable solo dentro de un `modelId`.** |
| `engineRunId` | `sha256` de (`modelId`, `listadoId`, versión del motor, versión del vocabulario, versión del marco, parámetros). |

## 4. Arquitectura

Tres capas, cada una probable por separado, más un paso de publicación.

**a) Adapter** — `src/model/observe.ts`. Es la única capa que conoce three.

- Convierte cada instancia en una `Observation` **antes** del merge de geometría. `colladaModel.ts` hoy quita los grupos de material (`clearGroups`, verificado en el repo), y eso borraría las caras `Canto_*`.
- El detector de caras de canto se mueve acá desde `tests/helpers/edgeFaces.ts`.
- **Nombres e `id` desde el XML, no desde la escena de three.** `rawName` e `instanceKey` salen del XML del .dae (con el mismo `DOMParser` que ya usa `NamedColladaLoader`). Motivos, verificados en el código del 16/10:
  1. `NamedColladaLoader` solo restaura el nombre del componente cuando cumple `PIECE_NAME`, que exige `_` inicial. Un componente con formato inválido llegaría a la escena como `instance_N`, y `formato-invalido` (§6.1) no se podría observar con datos reales.
  2. No está verificado que three exponga el `id` del nodo.
  El mecanismo que correlaciona el nodo del XML con su malla (por ejemplo, que el pre-parseo copie también el `id`) se decide en el plan.
- **Casos no cubiertos fallan fuerte:** un nodo envoltorio con más de un `instance_node`, o con `instance_node` y contenido propio a la vez, lanza una excepción tipada con el `id` del nodo; el adapter no adivina.
- **Unidades:** el modelo llega en metros (el loader escala la unidad declarada del .dae, pulgadas en los dos muebles actuales); el adapter convierte a mm. La conversión se prueba con un .dae sintético en otra unidad (M2).
- El **marco de referencia** (qué es frente, atrás, izquierda, derecha, arriba) es un parámetro **versionado** del adapter (`frameVersion`). Es **ASUMIDO** (AS2) y **hoy no hay documento** de cómo se determinó: documentarlo es parte del plan.
- El adapter y `ColladaLoader` necesitan `DOMParser`. En Node 20 puro se espera `ReferenceError: DOMParser is not defined` (verificado el 16/10 en el diseño; no re-verificado en esta revisión). El script de evaluación inyecta `DOMParser` desde `jsdom`, el **mismo paquete y la misma versión** que usa vitest (el lockfile resuelve `jsdom` 24.1.3). Sin dependencias nuevas.

**b) Motor** — `src/engine/`. Funciones puras: sin three, sin React, sin DOM.

| Archivo | Responsabilidad |
|---|---|
| `normalize.ts` | nombre → código + estado del nombre |
| `vocabulary.ts` | tabla de reglas sobre los nombres del listado, congelada y versionada |
| `evidence.ts` | verificaciones duras y evidencia blanda para un par (observación, tipo) |
| `associate.ts` | las dos pasadas, el nivel, el top-3 y las inconsistencias |
| `types.ts` | contratos |

**c) Eval Harness** — `eval/`. Script de Node (`npm run eval`), fuera del bundle de la app. Corre con `vitest run` (modo script) o `vite-node`, ya presentes en el lockfile por vitest 3: no hay que agregar un runner de TypeScript nuevo, y así se resuelve el alias `@/` del proyecto sin configuración aparte. "Sin dependencias nuevas" (§4a) se apoya en esto.

- Corre casos reales y sintéticos, calcula métricas, aplica el gate y escribe el reporte.
- Las perturbaciones actúan sobre `Observation` y sobre el listado, no sobre el .dae.
- **Publica** el `AssociationRun` de cada caso real a `eval/runs/<modelId>.json` (§9.7), que es lo que lee la app en producción (§1). No es un paso aparte: es la misma corrida que genera `esperados.json`.

**Privacidad.** Todo lo derivado de Sabrina queda en `Sabrina/` (ignorada): resultados esperados, etiquetas, baseline, reportes, publicación y anexo. En el repo solo hay datos de Olmo y del mueble sintético. **Sin Sabrina, el harness corre igual y aprueba el gate; para Sabrina se reporta "no ejecutado" (no es una falla del gate, resuelve B1 de la revisión; ver §9.6).** Los reportes versionados se generan solo para los `furnitureId` de una lista blanca versionada, `eval/publico.json` (M14).

## 5. Contratos de datos

### 5.1 Serialización canónica del listado (`listadoId`)

- Se hashea el **listado** (`PieceType[]` del `FurnitureDef`), no el Excel. Hoy el listado vive en el mock del prototipo; cuando exista el formulario o la API, el hash se calcula sobre lo cargado.
- Tipos de pieza ordenados por `code`.
- En cada tipo, claves en este orden fijo: `code, name, lengthMm, widthMm, thicknessMm, material, quantity, edgeBanding, notes`. Son las del `PieceType` actual (`src/data/types.ts`). **Quedan fuera** `qrId` y `moduleId`: los asigna el sistema o son supuestos del prototipo, no datos del listado.
- `edgeBanding` se ordena alfabéticamente; `null` se conserva.
- Números tal como están escritos en el listado, serializados con `Number.prototype.toString()` (sin notación científica en los rangos de este proyecto).
- Toda cadena en forma de normalización **NFC**, para que una misma palabra que llegue del Excel en otra forma de Unicode (por ejemplo "Cajón") no cambie el hash.
- Un campo ausente se serializa como `null`, nunca se omite: la forma de la clave no depende de qué motor de JS la serialice.
- JSON en UTF-8 sin espacios ni saltos de línea.
- `listadoId = sha256` de esa cadena.

### 5.2 `Observation` (salida del adapter, única entrada geométrica del motor)

```ts
interface Observation {
  modelId: string;
  instanceKey: string;
  frameVersion: string;
  rawName: string | null;            // nombre del componente (del XML); null = malla sin componente
  sizeMm: [number, number, number];  // caja ordenada ascendente (espesor, medio, mayor), en mm
  axisAligned: boolean;              // false si hay normales fuera de los ejes
  orientation: "horizontal" | "vertical-lateral" | "vertical-frontal"; // por el eje del espesor, en el marco
  centerRel: [number, number, number]; // centro relativo a la caja de referencia del mueble, 0..1 por eje
  crossesMidplane: [boolean, boolean, boolean]; // la caja de la instancia cruza el plano medio del mueble en ese eje
  edgeRunsMm: number[] | "no-disponible"; // largo de cada cara de canto; sin caras Canto_* -> "no-disponible"
  mirrored: boolean;                 // transformada con determinante < 0
}
```

- **Caja de referencia del mueble.** Se calcula una vez sobre la **geometría** del modelo **sin perturbar** y queda fija: no se recalcula después de perturbar y **no usa las medidas generales del mock** (la profundidad de Olmo sigue sin aclararse: 571 mm de caja contra 550 mm del mock, Estado §2).
- **Canto.** Los bordes **no** se clasifican en largo y corto en la observación: lo hace `evidence.ts` para cada candidato, con su `lengthMm` y su `widthMm`. Así se evita el error de las piezas con largo menor que ancho.
- Una cantidad impar de triángulos de canto en una instancia lanza una excepción tipada del adapter con su `instanceKey` (como hoy `edgeFaces.ts`). El harness la informa como **entrada inválida** y el caso no pasa el gate.

### 5.3 Resultados

```ts
type Level = "segura" | "dudosa" | "sin-asociar";

interface Evidence {
  kind: "codigo" | "medidas" | "espesor" | "cantidad" | "orientacion" | "posicion" | "canto" | "espejo";
  result: "cumple" | "no-cumple" | "neutral" | "no-disponible";
  detail: string;     // texto legible: qué se comparó y con qué valores
  rule?: string;      // id de la regla de vocabulario, si aplica
}

interface Candidate {
  pieceCode: string;
  tuple: ScoreTuple;  // §6.3
  cupoCompleto: boolean;
  notes: string[];    // p. ej. "tipo del código; medidas no coinciden"
  evidence: Evidence[];
}

interface InstanceResult {
  instanceKey: string;
  level: Level;
  pieceCode: string | null;  // solo si es segura
  reasons: Reason[];         // catálogo cerrado (§5.4); puede llevar más de una (§6.1)
  warnings: Warning[];       // evidencia blanda que no coincide
  candidates: Candidate[];   // top-3, ordenado por tupla y luego por código; [] para segura, sin-componente y dudosas sin tipo que cumpla medidas (§6.3)
  evidence: Evidence[];
}

interface AssociationRun {
  furnitureId: string;
  modelId: string;
  listadoId: string;
  engineRunId: string;
  versions: { engine: string; vocabulary: string; frame: string };
  params: { toleranceMm: number; epsilonMm: number; tupleRoundingMm: number /* y todo otro parámetro, §6.3 */ };
  results: InstanceResult[];  // ordenados por instanceKey, comparación binaria (por punto de código), no por locale
  typeSummary: { pieceCode: string; quantity: number; claimants: number; seguras: number }[];
  inconsistencies: Inconsistency[];
}
```

**Determinismo.** `AssociationRun` no lleva fechas ni tiempos. La misma entrada produce la misma salida, byte a byte. El tiempo lo mide el harness por fuera.

### 5.4 Catálogos cerrados

**Razones de nivel (`Reason`)**

| Razón | Significado |
|---|---|
| `codigo-exacto` | código canónico y existente, sin anomalías |
| `nombre-anomalo` | código anómalo (§3): `_` de más al inicio y/o al final del código canónico |
| `formato-invalido` | el nombre no matchea ni canónico ni anómalo (§3) |
| `codigo-inexistente` | código canónico o anómalo que no está en el listado |
| `codigo-duplicado` | el código aparece en dos filas del listado |
| `medida-fuera-de-tolerancia` | medidas o espesor fuera de la tolerancia del tipo del código |
| `cupo-excedido` | más reclamantes que `quantity` |
| `geometria-no-alineada` | normales fuera de los ejes; no se mide |
| `sin-componente` | malla sin componente |
| `empate` | top-1 y top-2 con tuplas idénticas (tras cuantizar, §6.3) |

Una instancia puede llevar más de una razón (por ejemplo, `nombre-anomalo` y después `codigo-inexistente` si el código normalizado tampoco está en el listado): se registran todas, en el orden en que se evalúan (§6.1, §6.2).

Se eliminó `sin-candidato` (decisión del 16/10): una dudosa sin tipo que cumpla medidas se reconoce por `candidates: []` y se cuenta en las métricas (§9.5).

**Advertencias (`Warning`):** `orientacion-no-coincide`, `posicion-no-coincide`, `canto-no-coincide`.

**Inconsistencias de corrida (`Inconsistency`):** `faltante`, `sin-confirmar`, `cupo-excedido`, `cupo-completo-sugerido`, `conflicto`, `sin-componente`.

## 6. Reglas del motor

### 6.1 Normalización del nombre (determinista)

Sea `C` el formato de código (§3): `^\d{4}-\d{2}-M\d{2}-C\d{2}$`.

| Nombre del componente | Estado | Efecto |
|---|---|---|
| `null` (malla sin componente) | `sin-componente` | `sin-asociar`; se reporta como inconsistencia, sin afirmar qué es |
| Matchea `^_?C$` (código canónico: `C` o `_C`, sin guiones bajos de más) | código válido, sin anomalía | sigue a la pasada 1 |
| Matchea `^_*C_*$`, con uno o más `_` de más (al inicio, al final, o ambos) y **no** es canónico | `nombre-anomalo` | techo: `dudosa` |
| Cualquier otro (no matchea `^_*C_*$`) | `formato-invalido` | se trata como sin código |
| Canónico o anómalo, pero el código normalizado no está en el listado | `codigo-inexistente` | se trata como sin código |

**Esta tabla resuelve B2 de la revisión:** unifica en una sola regla (`^_*C_*$`, no canónico) los tres casos que la v2 trataba por separado (`_` finales, `__` inicial, y la fila nueva "más de un `_` inicial"). El componente `_0001-01-M01-C01__` de Olmo cae en esta regla general (dos `_` finales de más): sigue siendo `nombre-anomalo`, sin cambiar el resultado esperado.

"Se trata como sin código" significa: `dudosa`, con candidatos por ranking (§6.3), que pueden ser ninguno.

Consecuencia esperada en el .dae **provisorio** de Olmo: el componente `_0001-01-M01-C01__` (1 instancia) queda `dudosa` por `nombre-anomalo` hasta que Casa Mueble confirme (consulta 49). En la fase 1 **queda sin vincular** en el visor y en la ficha. Es un efecto esperado, no una regresión. Si la reexportación corrige el nombre, C01 pasa a `segura` (si cumple medidas) y las expectativas se actualizan (§2.2).

### 6.2 Pasada 1 — códigos y verificación dura

Cada instancia se evalúa solo contra el tipo de su código.

1. **Listado.** Si un código aparece en dos filas, todas sus instancias quedan `dudosa` con `codigo-duplicado`. Ese código **no** participa en el cálculo de `faltante` ni `sin-confirmar` (§3): `quantity` y `claimants` no son confiables mientras el listado tenga la fila duplicada.
2. **Medidas y espesor.**
   - Se compara la caja ordenada contra el espesor, el ancho y el largo del tipo, también ordenados.
   - Cumple si `|Δ| ≤ tol + ε` en los tres ejes. El borde es **inclusivo**, `tol` es el parámetro del mueble (AS8) y `ε = 1e-6 mm`.
   - Si no cumple: `dudosa` con `medida-fuera-de-tolerancia`.
   - Con `axisAligned = false` no se mide: `dudosa` con `geometria-no-alineada`.
   - Se asume que el listado trae la medida final del panel, sin el canto sumado (AS9).
3. **Cantidad.**
   - Si reclamantes(T) > quantity(T), **todos** los reclamantes quedan `dudosa` con `cupo-excedido`.
   - Si reclamantes(T) < quantity(T), se registra la inconsistencia `faltante`.
4. **Segura** = código canónico (sin anomalías) + medidas y espesor que cumplen + cupo no excedido. A una segura se le calcula la evidencia blanda (orientación, posición, canto, espejo), que **solo agrega advertencias y nunca la baja de nivel**. Una segura tiene `candidates: []`.
5. Si seguras(T) < reclamantes(T), se registra la inconsistencia `sin-confirmar`.

**Piso.** Una instancia con código canónico o anómalo y existente nunca queda por debajo de `dudosa`.

### 6.3 Pasada 2 — ranking

Aplica a toda instancia no segura que tenga componente.

- r(T) es fijo y **no se consume** durante la pasada. Por eso el resultado no depende del orden de las instancias ni de las filas del listado.
- **Quién entra al ranking:** los tipos que cumplen el elemento 1 (medidas y espesor dentro de tolerancia), más el tipo del código si la instancia tiene un código válido (canónico o anómalo) y existente (aunque no cumpla medidas).
- Para cada tipo T se arma una **tupla ordenada**. Se compara lexicográficamente, sin pesos: decide el primer elemento distinto, y ese elemento es la explicación.

| # | Elemento | Orden (mejor → peor) |
|---|---|---|
| 1 | medidas + espesor dentro de tolerancia | cumple → no cumple |
| 2 | el código normalizado de la instancia es el de T (binario; sin similitud parcial) | sí → no |
| 3 | cupo | r(T) > 0 → cupo completo |
| 4 | orientación (vocabulario) | cumple → neutral / no disponible → no cumple |
| 5 | posición (vocabulario) | cumple → neutral / no disponible → no cumple |
| 6 | canto (conteos) | cumple → neutral / no disponible → no cumple |
| 7 | desviación dimensional total, **cuantizada** a `tupleRoundingMm` (parámetro del mueble, §5.3; valor por defecto 0,01 mm) antes de comparar | menor → mayor |

**Por qué se cuantiza el elemento 7.** Sin redondeo, la conversión de pulgadas a mm y el punto flotante casi nunca producen el mismo valor exacto en dos tipos, aunque sean dimensionalmente iguales. Eso impediría que se detecten `empate`s genuinos (por ejemplo, entre piezas equivalentes), que es justamente el caso que el elemento 7 y la razón `empate` existen para capturar. `tupleRoundingMm` se declara en `params` y entra en `engineRunId`.

**Reglas del top-3**

- **Tipo del código.** Si la instancia tiene un código válido (canónico o anómalo) y existente, ese tipo **siempre** aparece en el top-3. Si sus medidas no coinciden, lleva la nota "tipo del código; medidas no coinciden".
- **Cupo completo.** Un tipo con cupo completo baja en el orden pero **sigue** en el top-3 si le corresponde. Lleva `cupoCompleto: true` y se registra `cupo-completo-sugerido`.
- **Empate.** Si las tuplas del top-1 y del top-2 son idénticas (tras cuantizar el elemento 7), la instancia lleva la razón `empate` y los empatados se listan por código. El empate nunca se rompe en silencio.
- **Top-3 vacío.** Si no hay código existente y ningún tipo cumple el elemento 1, `candidates` queda vacío. La instancia sigue siendo `dudosa`.
- **Orden dentro del top-3.** Primero por tupla; a igualdad de tupla, por código (misma comparación binaria que en `results`, §5.3).

**Nivel**

- `sin-asociar` **solo** para `sin-componente`.
- Todo lo demás que no es segura queda `dudosa`: código ausente, de formato inválido, inexistente, duplicado, con medidas fuera de tolerancia, o sin candidatos.

### 6.4 Evidencia blanda

- **Orientación.** Se compara la `orientation` observada con la esperada según el vocabulario (§7). Si ninguna regla aplica, es neutral.
- **Posición.**
  - El vocabulario dice qué mitad del mueble se espera en un eje (adelante/atrás, arriba/abajo, izquierda/derecha). Cumple si `centerRel` está en esa mitad.
  - Si la caja de la instancia cruza el plano medio en ese eje, es neutral.
  - La convención de frente, atrás, izquierda y derecha es **ASUMIDA** (AS2).
- **Canto.** §8.
- **Espejo.** `mirrored` es descriptivo: `kind: "espejo"`, siempre neutral, sin lugar en la tupla. Qué significa el ícono de espejo sigue pendiente (consulta 54).

### 6.5 Mejora posible: asignación global (enfoque 2)

- **No se implementa.** Se evalúa con el reporte de conflictos (§9.5) y con el profesor (RF8).
- No se fija ningún umbral antes del baseline.

## 7. Vocabulario

- **Construcción.**
  - La tabla se arma **desde los nombres de los listados disponibles** (piso, techo, estante, lateral, división, frente, zócalo, faja, adelante, atrás, arriba, abajo, etc.). Cuáles listados se usaron se registra al congelar `vocabularyVersion`.
  - Cada regla tiene un id, las palabras que la disparan y lo que espera (orientación y/o mitad en un eje).
  - Es **ASUMIDA** (AS3).
- **Congelado.** La tabla se versiona (`vocabularyVersion`) y se congela **antes de generar las perturbaciones**. Si cambia, cambia la versión y hay que regenerar el baseline (§9.6).
- **Cobertura.** El reporte da, por regla, cuántos tipos dispara (n/N) y cuántos tipos no dispara ninguna regla.
- **Riesgo de sobreajuste.** La tabla sale de los mismos nombres que se usan para evaluar; su desempeño en muebles nuevos es desconocido. La perturbación P13 (degradar el nombre del listado) mide cuánto depende el motor del vocabulario.

## 8. Canteado

### 8.1 Evidencia blanda, solo conteos

- Para un candidato T, cada cara de canto se clasifica por su largo:
  - `largo` si mide el `lengthMm` de T (dentro de tolerancia);
  - `corto` si mide el `widthMm` de T.
- Esos conteos se comparan con la cantidad de bordes `largo-*` y `corto-*` del canteado de T.
- **Qué lados** llevan canto (A/B) es ASUMIDO (AS5) y **no se usa**.
- Si `|lengthMm − widthMm| ≤ tol`, la clasificación es **neutral**.
- Con `edgeBanding: null` es neutral.
- Si el .dae no trae caras `Canto_*`, es `no-disponible`. Es el caso de Olmo según el diseño del 16/10: sus materiales son `Blanco_nature`, `GAUDI` y `Color_M06`.
- Con código válido, una diferencia solo produce la advertencia `canto-no-coincide`. Sin código válido, ordena candidatos (elemento 6).
- La convención `Canto_*` (cara de canto = material cuyo nombre empieza con `Canto_`) es **ASUMIDA** (AS4).

### 8.2 Límite conocido

Sin caras de canto, el motor no separa tipos que difieren solo en el canteado. Se reporta como límite conocido, fuera del gate. Las perturbaciones que agregan caras de canto a Olmo se rotulan **sintéticas**.

### 8.3 Camino a verificación dura (si Casa Mueble confirma)

Si Casa Mueble confirma que `Canto_*` es la fuente del canteado (consulta 52) y la leyenda (consulta 2):

1. el canto pasa de evidencia blanda a verificación dura en la pasada 1: con código válido y un conteo distinto, la instancia queda `dudosa` con una razón nueva, `canto-fuera-de-listado`;
2. se agrega esa razón al catálogo;
3. se sube la versión del motor;
4. se regenera el baseline, con justificación en el commit.

### 8.4 Medidas y espesor del canto (verificado el 16/10 en el diseño)

- En el segundo fixture, la caja de cada instancia coincide con la medida "final" del listado, tenga o no bordes con canto en ese eje (cifras en el anexo local). Las caras `Canto_*` son las caras del borde del panel y no agregan espesor.
- La tolerancia por modelo **no** tiene que absorber canto.
- **Riesgo.** Si un modelo futuro modela el espesor del canto, cada canto suma su espesor por borde en ese eje: el canto de 0,22 mm es dato confirmado por Casa Mueble el 16/10, a contrastar con la factura o el rollo. Con una tolerancia por modelo chica, dos cantos pueden dejar la comparación al límite (cálculo para el segundo fixture en el anexo local).
- Si la medida final incluye o no el canto va a la consulta 51.

## 9. Eval Harness

### 9.1 Casos

- **Reales.**
  - Olmo, en el repo.
  - Sabrina, local. **Si falta, se reporta "no ejecutado" para ese caso; esto no hace fallar el gate** (resuelve B1 de la revisión: §9.1, §9.6 y M13 quedan consistentes entre sí).
  - En los casos reales la verdad sale del **código**. Por eso la precisión real contra el código es **tautológica** y se rotula así. El control independiente es el etiquetado humano ciego (§10).
- **Sintéticos.**
  - Se generan desde las observaciones de Olmo y desde un mueble sintético con datos inventados (pares equivalentes y caras de canto).
  - El mueble sintético **no** se deriva de observaciones de Sabrina: `tests/helpers/syntheticDef.ts` solo importa tipos. Ojo: ese archivo hoy declara un canto de 0,45 mm; es dato inventado, pero 0,45 es el valor que Casa Mueble descartó el 16/10: si se reutiliza, cambiarlo a 0,22.
  - Se suman **.dae sintéticos mínimos escritos a mano** (unos pocos paneles) para probar el adapter: líneas sueltas, nombres de formato inválido, otra unidad, caras de canto.
  - Sabrina se perturba solo en local, con resultados en `Sabrina/`.
- **Reporte separado.** Real y sintético nunca se mezclan en una cifra. La precisión sintética **no** es la precisión del taller.

### 9.2 Generación

- **Variantes individuales.** Exhaustivas: cada operador sobre cada instancia o tipo aplicable. No usan semilla.
- **Combinaciones.** De 2 a 3 operadores, sorteadas con una **semilla fija**. Se usa un PRNG propio, no `Math.random`.
- **Registro de cada variante:** operador, parámetros, verdad por construcción y detectabilidad.
- El catálogo de operadores se versiona (`catalogVersion`).

### 9.3 Detectabilidad

- Se calcula **desde el listado, no desde el motor**.
- Firma dura de un tipo: medidas, espesor y cantidad.
- Firma blanda de un tipo: orientación y posición esperadas por el vocabulario, y conteos de canto.
- Una perturbación es indetectable por construcción si la entrada perturbada es indistinguible de una válida con esas firmas. Por ejemplo, un intercambio entre tipos con la misma firma dura conserva los conteos.
- En las combinaciones la detectabilidad **se recalcula**.

### 9.4 Catálogo de perturbaciones

| Op | Qué hace | Esperado | Caso crítico |
|---|---|---|---|
| P1 | quita el código del nombre | dudosa; verdad en el top-k (o top-3 vacío si ningún tipo cumple medidas) | — |
| P2 | intercambia códigos entre tipos con firma dura distinta | dudosa (`medida-fuera-de-tolerancia`) | — |
| P2b | intercambia entre tipos que difieren solo en firma blanda | **límite conocido**: "seguras incorrectas en límite conocido: N", y si saltó la advertencia (n/N) | piezas equivalentes |
| P2e | intercambia entre tipos con firmas dura y blanda idénticas | **límite conocido** | piezas equivalentes |
| P3 | agrega `_` de más (inicial y/o final) al nombre canónico | dudosa (`nombre-anomalo`); verdad en el top-1 | nombre anómalo |
| P4 | rompe el formato del código (deja de matchear `^_*C_*$`) | tratado como sin código (dudosa, `formato-invalido`) | códigos anómalos |
| P5 | código canónico o anómalo que no está en el listado | tratado como sin código (dudosa) | códigos anómalos |
| P6 | agrega una instancia extra con código | las N+1 dudosas (`cupo-excedido`) | — |
| P7 | quita una instancia | `faltante` | — |
| P8 | una medida en `listado ± k·tol` para k = 0,95 / 1,00 / 1,05 | segura / segura / dudosa (borde inclusivo en k=1,00, ε declarado) | — |
| P9 | quita o agrega caras de canto (en Olmo: sintético) | con código: segura + advertencia; sin código: cambia el ranking | canteado parcial |
| P10 | duplica una fila del listado | `codigo-duplicado` | códigos anómalos |
| P11 | quita el código a todas las instancias de un par equivalente | empates o desempate por cupo | piezas equivalentes |
| P12 | agrega una malla suelta | sin-asociar (`sin-componente`) | — |
| P13 | degrada el nombre del listado (sin palabras del vocabulario) | seguras sin cambio; mide la dependencia del vocabulario en el ranking | — |
| P14 | cambia la orientación o la posición de una instancia con código válido | segura + advertencia | — |

**P8 corregido respecto de la v2:** la perturbación fija la medida en `listado ± k·tol` (relativa al valor del listado), no suma `k·tol` al valor ya observado del .dae. Sumar sobre lo observado arrastraría el desvío propio del modelo y podría empujar el caso de borde fuera de lo esperado.

Casos críticos con cobertura obligatoria: **piezas equivalentes, canteado parcial, códigos anómalos, nombre anómalo.**

### 9.5 Métricas

Se reportan por caso (real o sintético), por mueble, por operador y por caso crítico. Todo como **n/N**, sin cifra global agregada.

| Métrica | Definición |
|---|---|
| % resuelto automáticamente | seguras / instancias con componente (`sin-componente` fuera del denominador) |
| Precisión de seguras (contra la verdad) | seguras correctas / seguras. Real: tautológica. Sintético: por construcción |
| Precisión de seguras contra etiqueta humana | seguras con etiqueta ciega igual / seguras con etiqueta ciega. Rotulada **independiente** |
| % dudosas | dudosas / instancias con componente |
| Dudosas sin candidatos | dudosas con `candidates: []` / dudosas |
| Sin componente | conteo aparte (`sin-asociar` solo se da por `sin-componente`) |
| Top-1 / top-3 | la verdad está en el top-1 / top-3 de las dudosas con candidatos; los empates se cuentan aparte |
| Empates, conflictos, `cupo-completo-sugerido`, `faltante`, `sin-confirmar` | conteos |
| Límites conocidos | conteo por operador; en P2b, seguras incorrectas y advertencias saltadas |
| Cobertura de casos críticos | variantes ejecutadas y resultados por caso crítico |
| Cobertura del vocabulario | por regla (§7) |
| Tiempo | mediana de M repeticiones; se anotan la máquina y la versión de Node; sin gate |
| Concordancia humana | §10.5 |

**Modo sombra (opción A sin aplicarla)**

- Para cada dudosa con candidatos se registra en qué elemento k de la tupla (1 a 7) el top-1 le gana al top-2, y si el top-1 era correcto.
- Con eso se arma la curva "si se resolvieran las dudosas decididas en el elemento ≤ k, cuántas acertaría y cuántas erraría".
- Usa **semillas de selección y de validación separadas**: con la de selección se elegiría k; con la de validación se mide.
- **No se fija k antes del baseline.** Proponerlo requiere datos y validación del profesor (RF2, §17).

### 9.6 Gate

Si falla, el script sale con código distinto de 0.

| Id | Condición |
|---|---|
| G1 | 0 seguras incorrectas en todos los casos detectables, reales y sintéticos |
| G2 | Los casos reales **presentes** son iguales al archivo de resultados esperados, indexado por `modelId`. En un modelo del repo, un hash distinto **falla**. La ausencia de Sabrina no falla G2: para ese caso se reporta "no ejecutado" (§9.1). Cambiar el .dae exige regenerar y revisar `esperados.json` en el mismo commit (§2.2) |
| G3 | Misma semilla → JSON idéntico, sin contar el tiempo. Se registra la versión de Node |
| G4 | Invariancia ante permutaciones del orden de las instancias **y de las filas del listado** |
| G5 | Con baseline, ninguna métrica empeora, comparando **por operador** (definición abajo). El baseline se ata a `catalogVersion` y `vocabularyVersion` y solo se actualiza con un commit que lo justifique |

**"Empeora" en G5 (confirmado por el equipo el 16/10):**

- métricas de error (seguras incorrectas, seguras incorrectas en límite conocido): empeora si **sube**;
- precisión de seguras: empeora si **baja**;
- métricas de cobertura (% resuelto automáticamente, top-1, top-3, variantes ejecutadas por caso crítico): empeora si **baja**;
- conteos informativos (empates, conflictos, `cupo-completo-sugerido`, dudosas sin candidatos): no gatean; el reporte muestra el cambio.

Fuera del gate:
- los límites conocidos;
- el tiempo;
- Sabrina ausente (no es una falla, §9.1);
- las metas numéricas, que se fijan después del baseline y con validación del profesor.

### 9.7 Archivos

| Archivo | Versionado | Contenido |
|---|---|---|
| `eval/esperados.json` | sí | resultados esperados de Olmo, por `modelId`. Sale de una corrida real y se revisa a mano. Provisorio hasta la reexportación (§2.2) |
| `eval/runs/<modelId>.json` | sí | **`AssociationRun` publicado** para un `furnitureId` de la lista blanca (§4c, §9.7 abajo). Es lo que lee la app en producción (§1); no se recalcula en el cliente |
| `eval/baseline.json` | sí | métricas por operador, atadas a versiones |
| `eval/primera-corrida.json` | sí | fecha de la primera corrida del motor por `modelId`. Se escribe una sola vez |
| `eval/publico.json` | sí | lista blanca de `furnitureId` que pueden aparecer en reportes versionados y en `eval/runs/` (Olmo y el mueble sintético) |
| `eval/etiquetas/<hash>.json` | sí | etiquetas de Olmo (§10); `<hash>` es el `modelId` sin el prefijo `sha256:` (los dos puntos rompen nombres de archivo en Windows) |
| `eval/out/reporte.json`, `reporte.md` | no (ignorado) | salida de cada corrida |
| `eval/reportes/<AAAA-MM-DD>.md` | sí | un reporte por entrega, **sin Sabrina** |
| `Sabrina/eval/…` | no (carpeta ignorada) | esperados, baseline, etiquetas, publicación y reportes de Sabrina |

> **Estimado, no es criterio.** Con los datos del 16/10 se estima, para Olmo, 32 seguras + 1 dudosa (C01) + 6 sin asociar. **Lo fija la primera corrida**, revisada a mano, y recién entonces entra a `eval/esperados.json`. No figura en ningún criterio M. Con una reexportación que corrija el nombre de C01, la estimación cambia.

## 10. Revisión humana

### 10.1 Dos modos, nunca mezclados

- **`ciego`.** La persona decide a qué tipo del listado corresponde una instancia **sin ver la salida del motor ni el nombre del componente**. Es la fuente de la concordancia humana.
  - La ceguera es **parcial**, y se declara así: la persona ve la geometría y el listado, que es lo mismo que usa el motor.
  - Es independiente del código, no de la geometría.
  - **Quién etiqueta (decisión del 16/10): personal de Casa Mueble.** El equipo no etiqueta el conjunto de referencia: conoce el mapeo código → pieza del prototipo (fichas y resaltado por código), así que no es ciego. Si alguien del equipo etiqueta igual, queda registrado con su exposición y se reporta aparte.
  - Quien diseñó el modelo puede reconocer las piezas por memoria de su propio diseño. Es lo más cercano a una verdad independiente del código, pero **se declara la exposición de cada etiquetador** (campo `labelers`, §10.2).
- **`revision`.** La persona acepta o rechaza candidatos viendo la evidencia. No existe en la fase 1; llega con la pantalla de revisión (C). Se reporta aparte y nunca cuenta como concordancia.

Decisiones humanas y automáticas se reportan siempre por separado.

### 10.2 Esquema `revision-asociacion/1`

Un archivo por (`modelId`, `listadoId`).

```json
{
  "schema": "revision-asociacion/1",
  "furnitureId": "olmo",
  "modelId": "sha256:…",
  "listadoId": "sha256:…",
  "labelers": {
    "cm1": { "origen": "casa-mueble", "exposicion": ["autor-del-modelo"] }
  },
  "decisions": [
    {
      "instanceKey": "ID3/ID155",
      "mode": "ciego",
      "decision": "tipo",
      "pieceCode": "0001-01-M01-C04",
      "labeler": "cm1",
      "engineRunId": null,
      "decidedAt": "2026-11-10",
      "note": null
    }
  ]
}
```

**Validaciones (el validador rechaza el archivo si alguna falla)**

- `decision` ∈ {`tipo`, `ninguno`, `no-se`}.
- `pieceCode` solo con `tipo`, y tiene que existir en el listado.
- `engineRunId`:
  - **obligatorio** en `revision`;
  - **prohibido** en `ciego`.
- Unicidad por (`instanceKey`, `labeler`, `mode`).
- El `instanceKey` tiene que existir en el modelo de ese `modelId`.
- Las etiquetas se atan a `modelId` + `listadoId`: si alguno cambia, no aplican.
- `labeler` es un seudónimo, sin nombres, y tiene que figurar en `labelers`.
- `labelers[x].exposicion` es un **arreglo no vacío** con valores de {`autor-del-modelo`, `conoce-el-prototipo`, `ninguna`} (una persona puede ser autora del modelo y además conocer el prototipo); `origen` ∈ {`casa-mueble`, `equipo`, `otro`}. **Cambia respecto de la v2** (era un valor único): el caso combinado existe y la v2 no lo podía representar.

### 10.3 Herramienta de etiquetado (fase 1, excepción al "sin UI")

- **Quién la usa:** personal de Casa Mueble, desde PC o celular, sin instalar nada. **Cambia respecto del borrador anterior** ("solo de desarrollo"): ahora tiene que poder usarla alguien de afuera. Sigue **fuera del bundle de producción de la app**.
- **Entrada.** Separada de la app de producción. **Decisión del 16/10: despliegue aparte, no indexado.** El detalle (proyecto de Vercel propio, ruta, cómo se arma el build sin la app) **se decide en el plan**, después de leer la documentación de Next 16 (AGENTS.md). Requisitos: no exponer nada de Sabrina y no depender del proyecto de Vercel de los QR impresos (no renombrarlo ni tocarlo). Como en el prototipo, no indexado no es control de acceso: por eso solo sirve datos de Olmo y el modelo saneado.
- **Modelo saneado.** La herramienta sirve una **copia del .dae con los nombres de componente reemplazados por un token opaco** (no el `instanceKey`), generada por un script (el `modelId` del original queda registrado en el archivo de etiquetas). **Cambia respecto de la v2:** el `instanceKey` sigue el orden de recorrido del .dae, que puede coincidir con el orden de los códigos C01…C21 y filtrar la correlación; el token opaco rompe esa correlación y la tabla token ↔ `instanceKey` queda local a la herramienta, fuera del modelo servido. Así el nombre, y cualquier pista de orden, no están tampoco en la respuesta de red, no solo en el DOM.
- **Orden.** Las instancias se presentan en **orden aleatorio por semilla**.
- **Qué muestra.** La pieza resaltada y el listado (nombre, medidas, espesor, material, cantidad, canteado).
- **Qué oculta.** El nombre del componente, la ficha, el menú de piezas, los vínculos y toda salida del motor.
- **Respuestas.** La persona elige un tipo, `ninguno` o `no-se`. Un botón exporta el JSON.
- **Alcance.** Se etiqueta **todo** Olmo: las instancias con componente (33 en el .dae provisorio) + las mallas sueltas (6 en el provisorio), a recontar sobre el .dae reexportado. Cuánto tarda quien etiqueta: a relevar. Sabrina, si es mucho, con una muestra sorteada por semilla, reportada como n/N, **solo en local** mientras la titularidad no se resuelva.
- **Pruebas automáticas.** Ningún nombre de componente del .dae aparece en el DOM ni en los archivos que sirve la herramienta.
- **Fecha límite.** 13/11, condicionada como en §2.2. Plan B: la concordancia se reporta "no ejecutado".

### 10.4 Discrepancias

- Las diferencias entre el código y la etiqueta ciega van a una **lista de discrepancias** en el reporte. **Nunca se corrigen en silencio**: ni el listado, ni los esperados, ni las etiquetas.
- Las discrepancias en pares equivalentes se reportan aparte.
- `no-se` se muestra **siempre**, con su conteo.

### 10.5 Concordancia

Se reporta como n/N, por mueble. La definición cambia respecto de la Tabla 30 del documento v2 (RF10).

1. **Acuerdo bruto primero:**
   - seguras cuya etiqueta ciega coincide;
   - dudosas con la etiqueta en el top-1 y en el top-3;
   - `ninguno` contra `sin-asociar`.

   `no-se` queda fuera de los denominadores y se cuenta aparte.
2. **Entre etiquetadores**, si hay dos o más: % de acuerdo y, como complemento, kappa de Cohen, con su n.

### 10.6 Ceguera temporal

El reporte compara el `decidedAt` de cada etiqueta con `eval/primera-corrida.json`. Las etiquetas posteriores a la primera corrida sobre ese `modelId` se marcan "posteriores a la primera corrida" y se reportan aparte.

- Las corridas sobre el .dae **provisorio** no cuentan: tiene otro `modelId`.
- Sobre el .dae **reexportado**, lo ideal es no correr el motor hasta recibir las etiquetas. Si para la pre-entrega hace falta correrlo antes, se acepta y las etiquetas posteriores se reportan aparte. Quien etiqueta no ve nunca la salida del motor (§10.1).
- Como el motor es precalculado (§1), "correr el motor" significa específicamente generar y publicar un `AssociationRun` nuevo para ese `modelId`, no cada vez que un operario escanea un QR.

## 11. Cambios en el código existente

| Lugar | Cambio |
|---|---|
| `src/data/mapping.ts` | `checkAssociation` y `pieceMatchesInstance` se reemplazan por el motor |
| `src/model/ids.ts` | `PIECE_NAME` exige `_` inicial y no coincide con §3: la normalización pasa a `normalize.ts`, con las dos regexes de §6.1 (`^_?C$` canónico, `^_*C_*$` anómalo); lo que quede de `ids.ts` se alinea |
| `src/model/namedColladaLoader.ts` | restaura nombres solo si cumplen `PIECE_NAME`; el adapter lee del XML (§4a). Si el plan elige correlacionar por `id`, el pre-parseo copia también el `id` |
| `FurniturePart` (`src/model/types.ts`) | suma `instanceKey`. El visor mapea `instanceKey` → mesh; `<código>#n` queda como etiqueta de pantalla |
| Visor y ficha | leen `eval/runs/<modelId>.json` (publicado, §9.7) y vinculan **solo seguras**; no invocan `associate.ts`. Si el `modelId` servido no tiene `AssociationRun` publicado, no vinculan nada y avisan (§1). En el .dae provisorio de Olmo, la C01 queda sin vincular en la fase 1 (efecto esperado, §6.1) |
| `src/model/verifyModel.ts` | sigue como verificación de desarrollo; las comprobaciones (b) y (c) reusan `evidence.ts` |
| `tests/helpers/edgeFaces.ts` | el detector pasa al adapter; el test usa el código del adapter |
| `tests/olmo.test.ts` | hoy espera 21 tipos, 33 instancias, 6 mallas sin código y 1 anomalía: se revisa con la reexportación (§2.2) |
| Criterio **A4** | se reescribe: "cada instancia recibe exactamente un nivel, y el resultado es igual al de `eval/esperados.json`" (el mismo archivo que G2). La parte de Sabrina se saltea sin Sabrina |
| `.gitattributes` | nuevo: `*.dae binary`, con `git add --renormalize .` en el mismo commit |
| `package.json` | `npm run eval` (corre con `vitest run` / `vite-node`, §4c) |

## 12. Criterios de aceptación de la fase 1

| Id | Sección | Criterio | Prueba concreta |
|---|---|---|---|
| M1 | §2.2, §5.1 | `.gitattributes` presente, `git add --renormalize` aplicado (mismo `modelId` con fin de línea LF y CRLF) y `listadoId` calculado según §5.1 | test del contenido de `.gitattributes`; test de `listadoId` con un listado mínimo escrito a mano y el hash esperado calculado aparte; test de `modelId` con el mismo .dae en los dos fines de línea; G2 |
| M2 | §4a, §5.2 | El adapter produce una `Observation` por instancia con componente y por malla suelta; las líneas se excluyen y se cuentan; `instanceKey` es único; la unidad se convierte a mm; el nombre de formato inválido llega como `rawName` | test con el .dae provisorio de Olmo (33 + 6 + 0 líneas) y con .dae sintéticos mínimos (líneas, formato inválido, otra unidad, nodo con dos `instance_node` → excepción) |
| M3 | §4b | `src/engine/` no importa three ni usa el DOM | test estático de imports |
| M4 | §6.1 | Cada regla de normalización tiene un caso, incluidos los subcasos de anómalo (inicial, final, ambos) | tabla de casos, una fila por fila de §6.1 más los subcasos de anómalo |
| M5 | §6.2–6.3 | Pasadas 1 y 2: piso, tipo del código en el top-3, cupo completo, empates (con cuantización del elemento 7), top-3 vacío, `sin-asociar` solo por `sin-componente` | tabla de casos de `associate.ts`, con un caso de empate que sin cuantizar no empataría |
| M6 | §9.6 | Resultado invariante ante permutaciones de instancias y de filas del listado | G4 |
| M7 | §5.3, §9.6 | Salida determinista | G3 |
| M8 | §9.7, §11 | Olmo real igual a `eval/esperados.json`, cada instancia con exactamente un nivel, y `eval/runs/<modelId>.json` publicado coincide con `esperados.json`. Mientras el .dae conserve el nombre anómalo de C01, esa instancia es `dudosa` y queda sin vincular | G2, A4 |
| M9 | §9.2–9.4 | Catálogo P1–P14 implementado, con detectabilidad calculada desde el listado | reporte por operador + tabla de detectabilidad contada a mano (§13) |
| M10 | §9.6 | 0 seguras incorrectas en casos detectables | G1 |
| M11 | §10.3 | La herramienta de etiquetado está fuera del bundle de producción y no muestra ni sirve nombres de componente ni `instanceKey` (solo el token opaco) | verificación del build (método fijado en el plan); test del DOM y de los archivos servidos |
| M12 | §10.2, §10.4–10.6 | Etiquetas validadas contra el esquema (incluido `exposicion` como arreglo); concordancia, discrepancias y ceguera temporal en el reporte | validador con un caso válido y uno inválido por regla + reporte con etiquetas de prueba |
| M13 | §4 (privacidad), §9.1, §9.6 | Sin Sabrina: todo corre, el gate aprueba, y el reporte dice "no ejecutado" para Sabrina | test automático que corre el harness apuntando a un directorio `Sabrina/` inexistente y verifica código de salida 0 |
| M14 | §9.7 | Reporte de entrega versionado, sin Sabrina | test del generador de `eval/reportes/`: rechaza un `furnitureId` fuera de `eval/publico.json` y acepta los de la lista |
| M15 | §5.4, §6.2–6.3 | Inconsistencias de corrida: `faltante`, `sin-confirmar`, `cupo-excedido`, `cupo-completo-sugerido`, `conflicto`, `sin-componente`, y que un código duplicado no calcula `faltante`/`sin-confirmar` | tabla de casos, un caso por inconsistencia + caso de código duplicado |
| M16 | §6.4, §8 | Evidencia blanda y canto: orientación, posición, canto (cumple, no cumple, neutral, no disponible) y espejo neutral | tablas de §13 |
| M17 | §9.5 | Modo sombra: registra k y la curva, con semillas de selección y validación separadas, sin fijar umbral | fixture sintético con k calculado a mano |
| M18 | §9.6 | G5 compara por operador y falla si una métrica empeora según su definición | test con un baseline armado a propósito peor: el script sale distinto de 0 |
| M19 | §7, §9.5 | Cobertura del vocabulario por regla y tipos sin regla | tabla de vocabulario escrita a mano con resultado conocido |
| M20 | §4a, §4c, §13 | El eval y vitest resuelven la misma versión de `jsdom`; `npm run eval` corre con `vitest run` o `vite-node` sin dependencias nuevas | test que compara las versiones resueltas; test de que `npm run eval` resuelve el alias `@/` |

## 13. Pruebas independientes

Casos contados a mano; no comparten código con el motor más allá de la función probada.

- **Detector de canto.** Paneles chicos escritos a mano con caras conocidas, incluidos uno con largo < ancho y uno con largo ≈ ancho.
- **`evidence.ts`.** Una tabla de casos por verificación:
  - medidas en `listado ± k·tol` para k = 0,95 / 1,00 / 1,05;
  - espesor;
  - orientación;
  - posición, incluido el caso que cruza el plano medio;
  - canto: cumple, no cumple, neutral y no disponible.
- **Normalización.** Un caso por fila de §6.1, incluidos los subcasos de `nombre-anomalo` (solo inicial, solo final, ambos).
- **Detectabilidad.** Una tabla de operadores con su detectabilidad calculada a mano: misma firma dura, firma blanda distinta, firmas idénticas, y una combinación recalculada.
- **Permutaciones.** De instancias y de filas del listado.
- **Pureza del motor.** Sin three ni DOM en `src/engine/`.
- **jsdom.** El eval y vitest resuelven la misma versión.
- **Adapter.** .dae sintéticos mínimos: líneas excluidas, formato inválido como `rawName`, otra unidad, nodo con dos `instance_node` (excepción), cantidad impar de triángulos de canto (excepción), `instanceKey` único.
- **Herramienta de etiquetado.** Ningún nombre de componente ni `instanceKey` en el DOM ni en los archivos que sirve; solo el token opaco.
- **Esquema de decisiones.** Un caso válido y uno inválido por regla de §10.2.
- **Cuantización de la tupla.** Dos tipos con medidas que difieren solo por ruido de conversión de unidades, verificando que empatan con `tupleRoundingMm` por defecto.

## 14. Refinamientos de la decisión del 13/10 (a validar con el profesor)

Los llamamos **RF** para no confundirlos con los R1–R7 de Casa Mueble (`Consultas y respuestas…`, sección 4).

| # | Refinamiento | Por qué |
|---|---|---|
| RF1 | Tres niveles (`segura`, `dudosa`, `sin-asociar`), sin "probable" automático. Sin código válido, siempre dudosa. `sin-asociar` solo para una malla sin componente. Una dudosa puede no tener candidatos. Difiere de la Tabla 42 del documento v2, donde "Sin asociar" es "no hay candidatos" | Conservador: la IA nunca decide sola |
| RF2 | Opción A (resolver sin código con umbral y margen) **contradice** la decisión del 13/10. Solo puede proponerse con datos del modo sombra y con validación del profesor | Hoy solo se mide en sombra |
| RF3 | Dimensiones, espesor y cantidad son verificación dura. Orientación, posición y canto son evidencia blanda: con código válido solo advierten y no bajan una segura; sin código, ordenan | Separar lo medido de lo inferido |
| RF4 | Puntaje como tupla lexicográfica, sin pesos; orden de los elementos 4–6 propuesto (orientación > posición > canto); elemento 7 cuantizado (§6.3). El documento v2 habla de "puntaje de certeza" | Sin pesos inventados; explicable por el primer elemento distinto |
| RF5 | Elemento "código" binario, sin similitud parcial | Evitar reglas inventadas |
| RF6 | El cupo restante baja al candidato pero no lo excluye | No esconder candidatos |
| RF7 | El nombre anómalo pone techo de dudosa (C01 de Olmo) | Conservador hasta confirmar |
| RF8 | Asignación global (enfoque 2) solo si el reporte de conflictos lo justifica | Explicabilidad |
| RF9 | La revisión humana (aceptar o rechazar candidatos) se difiere a la pantalla C. En la fase 1 las dudosas quedan sin vincular. Hoy el documento v2 dice que una dudosa pasa a revisión humana antes de imprimir y que las correcciones alimentan la evaluación | Acotar la fase 1; el esquema ya la contempla |
| RF10 | La concordancia humana se mide contra etiquetado **ciego** hecho por personal de Casa Mueble, y las decisiones de `revision` no cuentan. La Tabla 30 del documento v2 la define como coincidencia entre la propuesta del motor y la decisión final de la persona | Evitar medir acuerdo contra quien ya vio la propuesta |
| RF11 | La asociación se precalcula (`AssociationRun` publicado por `modelId`); la app de producción no corre el motor en el cliente | Costo en celular; determinismo entre lo evaluado y lo servido; coherente con QR versionado e inmutable |

## 15. Supuestos (ASUMIDO PARA EL PROTOTIPO)

| # | Supuesto | Origen | Se confirma con |
|---|---|---|---|
| AS1 | Formato del código `^\d{4}-\d{2}-M\d{2}-C\d{2}$`; código canónico `^_?C$`; código anómalo `^_*C_*$` no canónico (§3, §6.1); código opaco | Lo observado en los nombres de los dos .dae; no viene de documentación de Casa Mueble | Casa Mueble (segmentos: consulta 42, con 25 y 26) |
| AS2 | Marco frente/atrás/izquierda/derecha del adapter (`frameVersion`) | Convención del equipo; todavía sin documentar cómo se determinó | Casa Mueble (consulta 53) |
| AS3 | Tabla de vocabulario (§7) | Nombres de los listados disponibles | Casa Mueble (nombres) |
| AS4 | `Canto_*` como convención de caras de canto | Materiales del segundo fixture (`Canto_Blanco`, `Canto_Cedro`) y `tests/helpers/edgeFaces.ts` | Casa Mueble (consulta 52) |
| AS5 | Leyenda de canteado y orientación A/B (no se usan en el motor) | Lectura del equipo de los PDF de corte (Estado §1) | Casa Mueble (consultas 2 y 47) |
| AS6 | Pares de tipos equivalentes en medida, material y canto con código distinto, tratados como tipos distintos (detalle en el anexo local) | Análisis del segundo fixture | Casa Mueble (pendiente ya abierto en Estado) |
| AS7 | Las mallas sueltas sin código de Olmo no son piezas del listado (entran como `sin-asociar`, sin afirmar qué son) | Verificación de desarrollo del prototipo | Casa Mueble (consulta 33) |
| AS8 | Tolerancia por modelo (`FurnitureDef.toleranceMm`): Olmo 2 mm, valor por defecto de la verificación de desarrollo del prototipo; el segundo fixture, 0,5 mm, derivada de la diferencia entre listado "final" y "ajustado" (detalle en el anexo local). **No viene de Casa Mueble** | Prototipo | Casa Mueble (consulta 50) |
| AS9 | La medida del listado es la medida final del panel, sin el canto sumado | Comparación contra el segundo fixture (§8.4) | Casa Mueble (consulta 51) |
| AS10 | Resolución de cuantización de la tupla (`tupleRoundingMm`, por defecto 0,01 mm, §6.3) | Elección del equipo para que el elemento 7 detecte empates genuinos sin ruido de conversión de unidades | No depende de Casa Mueble; se ajusta si el baseline lo pide |

El nombre del mueble (Olmo) **ya no es un supuesto**: lo confirmó Casa Mueble el 16/10.

## 16. Consultas pendientes con Casa Mueble

Numeración continua con `Consultas y respuestas Casa Mueble y cátedra.md` (la última es la 47).

**Nuevas**

| N.º | Consulta |
|---|---|
| 48 | ¿Cuándo pueden renombrar Oslo por Olmo en el .skp, el .dae y la carpeta del paquete, y reexportar el .dae? |
| 49 | El `__` final del componente C01 de Olmo: ¿error de nombre o significa algo? |
| 50 | ¿Qué tolerancia de medida usa el taller? (para Olmo y para el segundo fixture) |
| 51 | ¿La medida "final" del listado incluye el canto? |
| 52 | ¿Las caras con material `Canto_*` son la fuente del canteado? (distinta de la 2 y la 47, que preguntan de qué documento sale el dato) |
| 53 | Convención de frente, atrás, izquierda y derecha del mueble |
| 54 | Significado del ícono de espejo. Una transformada espejada en el .dae coincide con el ícono (detalle en el anexo local) |
| 55 | ¿Quién de Casa Mueble puede etiquetar Olmo (cada instancia, con una herramienta simple), cuándo y desde qué dispositivo? |

**Ya abiertas, que este spec también necesita**

- 33: las geometrías sueltas sin código de Olmo (20 × 35 × 10 mm, material `Color_M06`) y los herrajes.
- 42: significado de los segmentos del código (`0001`, `01`, `M01`, `Cxx`) y por qué todos llevan `M01` en Olmo. La 25 y la 26 están "respondidas (a confirmar)".
- 2 y 47: origen del canteado y leyenda de las columnas de canteado.
- Pares de tipos con medida, material y canto idénticos y código distinto: ya figura en los pendientes con Casa Mueble de `Estado-del-proyecto.md`. Este spec no suma una consulta nueva.

**Cerrada:** 34 (Olmo, 16/10).

## 17. Para el profesor

- Tabla de refinamientos (§14, RF1–RF11).
- Umbral de la opción A, solo después del baseline y con los datos del modo sombra.
- Enfoque 2 (asignación global), con el reporte de conflictos.
- Metas numéricas, después del baseline.
- **El núcleo es un motor de reglas explicable.** Si cumple como "IA obligatoria" lo define la cátedra. Conviene preguntarlo antes de invertir semanas en el harness.

## 18. Riesgos

| Riesgo | Mitigación |
|---|---|
| El núcleo es un motor de reglas; la cátedra podría no aceptarlo como IA obligatoria | Llevarlo al profesor temprano (§17) |
| Sobreajuste del vocabulario a los nombres conocidos | Congelado antes de perturbar; P13; cobertura por regla |
| La precisión sintética no es la del taller | Reporte separado; rótulos explícitos |
| Muestra real chica (dos muebles) | n/N en todo; sumar cada modelo real nuevo como caso |
| Ceguera parcial del etiquetado; quien etiqueta diseñó el modelo | Declarada; exposición por etiquetador (§10.2); control temporal (§10.6) |
| Tolerancia en el límite si un modelo modela el espesor del canto | §8.4; consulta 51 |
| La reexportación de Olmo cambia `modelId` (y puede cambiar los `id` de nodo) e invalida etiquetas hechas antes | Se etiqueta después de reexportar (decisión del 16/10); cambio controlado del .dae y de `esperados.json` (§2.2) |
| El etiquetado depende de Casa Mueble: reexportación y disponibilidad sin fecha | Desarrollo en paralelo con sintéticos (confirmado por el equipo, 16/10); consultas 48 y 55; plan B "no ejecutado" |
| La herramienta de etiquetado, desplegada aparte y no indexada, queda accesible a quien tenga la URL | Solo datos de Olmo y modelo saneado con token opaco; sin Sabrina (§10.3) |
| Herramienta de etiquetado fuera de plazo | Plan B: "no ejecutado" |
| Nombres con formato inválido invisibles por cómo restaura nombres el loader | El adapter lee del XML (§4a); prueba con .dae sintético |
| Si el .dae servido y el `AssociationRun` publicado quedan desincronizados (§1) | No se vincula nada y se avisa; `modelId` es la clave de verificación |

## 19. Verificaciones

**Verificadas en la revisión del 16/10 contra el repo sincronizado:**

- `tests/olmo.test.ts` espera 21 tipos, 33 instancias, 0 advertencias, 1 anomalía (`_0001-01-M01-C01__`) y 6 mallas sin código con 0 líneas.
- `src/model/ids.ts`: `PIECE_NAME` exige `_` inicial y admite `_` finales; `canonicalCode` quita todos los `_` iniciales y finales.
- `NamedColladaLoader` restaura el nombre del componente solo si cumple `PIECE_NAME` y solo en nodos con un único `instance_node` y sin contenido propio.
- `colladaModel.ts` hace `clearGroups` y centra la geometría.
- `tests/helpers/edgeFaces.ts` usa `/^Canto_/` y lanza una excepción con cantidad impar de triángulos de canto.
- En el .dae de Olmo, cada instancia tiene su propio nodo envoltorio con `id` propio, incluso cuando comparten componente.
- El lockfile resuelve `jsdom` 24.1.3 y `vitest` 3.2.7. `vitest.config.ts` usa entorno `jsdom`.
- `PieceType` tiene los campos de §5.1, más `qrId` y `moduleId`.
- `tests/helpers/syntheticDef.ts` declara un canto de 0,45 mm.

**Del diseño del 16/10, no re-verificadas en esta revisión:**

- El componente `_0001-01-M01-C01__` se instancia una sola vez (nodo `ID156`, listado con cantidad 1). Los `id` pueden cambiar con la reexportación.
- Olmo no trae caras `Canto_*`; sus materiales son `Blanco_nature`, `GAUDI` y `Color_M06`.
- En ninguno de los dos modelos hay normales fuera de los ejes: solo giros de 90°.
- Olmo no tiene transformadas espejadas.
- En Olmo no hay tipos con |largo − ancho| ≤ 2·tol + 5 mm.
- `ColladaLoader` falla en Node 20 puro sin `DOMParser`.
- Todo lo del segundo fixture (§8.4 y anexo local).

**Sin verificar y abierto:**

- Si three expone el `id` del nodo en la escena.
- Si la reexportación conserva los `id` de nodo.
- La profundidad de Olmo (571 mm de caja contra 550 mm del mock).

## 20. Cambios a replicar en otros documentos

- `Estado-del-proyecto.md`: RF1–RF11 como **propuestos**; decisiones del 16/10 (etiqueta Casa Mueble, esperar la reexportación, desarrollo en paralelo, `sin-candidato` eliminado, motor precalculado); consulta 34 cerrada; cronograma de §2.3 como el vigente.
- `Consultas y respuestas Casa Mueble y cátedra.md`: sumar las consultas 48–55 a la sección 6 y a la tabla "Resumen de estado" (sección 1), y mover la 34 de "Cerradas" si no figura ya.
- `ESTADO.md` del repo y el dashboard: la consulta 34 figura sin respuesta en el diseño; está cerrada.
- Documento PFG-Muebles-3D, capítulo de IA, cuando se apruebe: Tabla 42 (nombres "Resuelta" frente a `segura`, y el significado de "Sin asociar"), "puntaje de certeza" frente a tupla, Tabla 30 (concordancia), la revisión humana diferida y que la asociación es precalculada (no en vivo).
- `CLAUDE.md` del repo: decisiones, convenciones y estado, antes de abrir la sesión de Claude Code.

## 21. Historial

- **Borrador del 16/10:** diseño inicial en el chat de diseño.
- **v2 (16/10, revisión final):** decisiones del equipo (`sin-candidato` eliminado; etiqueta Casa Mueble; se espera la reexportación; motor en paralelo; pre-entrega con MVP en contexto real); consulta 34 como cerrada; RF/AS en lugar de R/S; RF9 y RF10; adapter lee del XML; criterios M15–M20 y pruebas concretas; consultas renumeradas desde la 48; `listadoId` sin `qrId` ni `moduleId`; criterios de G5; lista blanca de reportes públicos; modelo saneado para etiquetar.
- **v3 (16/10, re-revisión con Opus, chat nuevo):** resueltos los 3 bloqueantes de la revisión — B1 "no ejecutado" ya no hace fallar el gate (§9.1, §9.6, M13); B2 unifica `nombre-anomalo` en una sola regla `^_*C_*$` no canónica (§3, §6.1); B3 la asociación se precalcula y se publica por `modelId`, la app no corre el motor en el cliente (§1, §4c, §9.7, §11, RF11). Siete cambios importantes: cuantización del elemento 7 de la tupla para que detecte empates genuinos (§6.3, AS10); P8 corregido a `listado ± k·tol` (§9.4); reglas de serialización de `listadoId` (NFC, números, campos ausentes, §5.1); `.gitattributes` con `git add --renormalize` en el mismo commit (§2.2, M1); runner del eval aclarado (`vitest run` / `vite-node`, §4c, M20); `labelers[x].exposicion` pasa a arreglo (§10.2); modelo saneado con token opaco en vez de `instanceKey` (§10.3). Más correcciones menores: candidatos vacíos en seguras, orden del top-3 por código, código duplicado fuera de `faltante`/`sin-confirmar`, y réplica a `Consultas y respuestas…` (§20). Cronograma de §2.3 confirmado como el vigente (decisión del equipo, 16/10); etiquetado confirmado en paralelo (decisión del equipo, 16/10).