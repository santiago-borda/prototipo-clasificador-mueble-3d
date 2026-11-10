# Especificación — T10 mínimo: `AssociationRun` de la pasada 1

Versión: **v0.2 (10/11/2026), aprobada** por el equipo (10/11: T10-E1 a T10-E6 y §3.1.4, todas sí). **Implementada** en la rama `motor-t10` (§8).
Antecedentes: `docs/plan-motor-asociacion.md` T10 (M6, M7), `docs/spec-motor-asociacion.md` v3 §3, §5.1, §5.3, §5.4 y §6.2, `docs/spec-adapter-observation-listadoid.md` v0.2.1 §2.3 (E2) y §4 (recorte del 20/11, E6), `docs/spec-t8-pasada-1.md` v0.2 (T8 hecho, rama `motor-t8`; T8-E1, T8-E2 y T8-E5).
**Es una enmienda, no un diseño nuevo:** se implementa T10 como está en el plan, salvo lo que dice §2. Si choca con el plan, manda el plan salvo en lo que esta spec enmienda explícitamente.

---

## 1. Objetivo y alcance

Armar el `AssociationRun` completo (spec-motor §5.3) encima de `associatePass1` (T8), sin cambiar su firma (T8-E1): `listadoId`, `engineRunId`, `versions` y `params`, con determinismo byte a byte (M7, G3) e invariancia ante permutaciones de instancias y de filas del listado (M6, G4).

**No es objetivo:** la pasada 2 (T9), la evidencia blanda y el vocabulario (T6), el harness, el gate, el reporte y la publicación (T11), el visor (T12, T14). Sin dependencias nuevas.

## 2. Enmiendas y precisiones al plan

| # | Qué | Por qué | Propuesta |
|---|---|---|---|
| T10-E1 | El plan pone el run en `associate.ts`, pero desde T8 `associate.ts` no importa `node:crypto` ni `./hash` (prueba M3) | `listadoId` y `engineRunId` necesitan sha256 (`hash.ts`, solo Node) | Módulo nuevo `src/engine/run.ts`, `buildRun(input): AssociationRun`, que importa `associate.ts` y `hash.ts`. `associate.ts` sigue sin crypto. `run.ts` tiene la misma regla que `hash.ts`: solo eval y servidor, nunca `"use client"` ni `src/pdf/` (se suma a la prueba H10) |
| T10-E2 | **Campo `passes` en el run** (enmienda al tipo de spec-motor §5.3; el catálogo de §5.4 no cambia) | Sin T9, `candidates: []` en una dudosa significa "no se rankeó", no "no hay tipo que cumpla medidas" (T8-E2). Quien lea el run publicado no tiene cómo distinguirlo | `AssociationRun.passes: 1 \| 2`. T10 escribe `1`; T9 lo pasa a `2` y sube `ENGINE_VERSION`. `passes` **no** entra en el `engineRunId`: ya lo determina `versions.engine` (§3.2). El reporte (T11) no calcula la métrica de dudosas sin candidatos con `passes: 1` |
| T10-E3 | **Resolver T8-E5:** `listadoId` lanza `ListadoInvalidoError(code, "codigo-repetido")` con un código repetido; spec-motor §6.2.1 espera `codigo-duplicado` | Con datos reales el choque no ocurre: `toListing` deja un `ListedPiece` por código y saca de `pieces` los códigos con filas que difieren. Solo se llega con filas armadas a mano | `buildRun` calcula `listadoId` **antes** de asociar y deja pasar el `ListadoInvalidoError`: con un código repetido no hay run (el harness lo informa como `no-ejecutado` con el motivo, T11). `codigo-duplicado` queda en `associatePass1` como defensa, probado por M15 (K12). No se cambia §5.1 ni el hash. Alternativas en §5 |
| T10-E4 | **Códigos que `toListing` dejó en `excluded`** | Hoy no llegan al motor: sus instancias salen `dudosa` con `codigo-inexistente` y la evidencia dice "no está en el listado", que es falso (el código está en el PDF, pero sus datos no se pudieron tomar sin elegir). Además el tipo no aparece en `faltante` ni en `typeSummary`, y eso es correcto | Campo opcional `excludedCodes?: readonly string[]` en `AssociateInput` (= `Listing.excluded.map((e) => e.code)`), con una razón nueva `codigo-excluido` (**enmienda al catálogo de spec-motor §5.4**): `dudosa`, fin, sin medir, sin cupo, fuera de `faltante`, `sin-confirmar` y `typeSummary`, como `codigo-duplicado`. Evidencia: `codigo`, `no-cumple`, `código <c>, excluido del listado (datos no tomables)`. Un código en `listado` y en `excludedCodes` lanza (como `CodigoExcluidoYListadoError` del cruce 2b). Un listado con `excluded` no vacío es `borrador` y no se publica (E2): el run sirve para el reporte, no para el visor. Toca `associate.ts` (T8) sin cambiar la firma: el campo es opcional. Alternativas en §5 |
| T10-E5 | `versions.vocabulary` sin vocabulario (T6 queda para después) | El tipo lo exige y entra en el `engineRunId` | `VOCABULARY_VERSION = "vocabulario/0"` en `versions.ts`: "sin reglas". T6 lo pasa a `vocabulario/1` |
| T10-E6 | Comparación binaria | spec-motor §5.3 pide "por punto de código"; T8 y `hash.ts` usan `<` (unidades UTF-16). Coinciden en ASCII | Se mantiene `<` y se suma una prueba que afirma que las claves y los códigos del primer fixture son ASCII. Si un .dae trae ids fuera de ASCII, se cambia la comparación y se sube `ENGINE_VERSION` |

## 3. Contrato

```ts
// src/engine/run.ts (solo eval y servidor: importa hash.ts)
import type { AssociateInput } from "./associate";
import type { AssociationRun } from "./types";

export function buildRun(input: AssociateInput): AssociationRun;
```

```ts
// src/engine/hash.ts (plan T10)
export function engineRunId(x: { modelId: string; listadoId: string; versions: AssociationRun["versions"]; params: EngineParams }): Sha256Id;
```

### 3.1 `buildRun`

1. `listadoId(input.listado)`; si lanza, `buildRun` lanza el mismo error (T10-E3).
2. `associatePass1(input)` (lanza `ModeloDistintoError` como en T8).
3. `versions = { engine: ENGINE_VERSION, vocabulary: VOCABULARY_VERSION, frame: FRAME_VERSION }`.
4. Un `frameVersion` de una observación distinto de `FRAME_VERSION` lanza `MarcoDistintoError` (no se mezclan marcos; aprobado el 10/11, prueba N11).
5. `engineRunId(...)` y el run, con las claves en este orden: `furnitureId`, `modelId`, `listadoId`, `engineRunId`, `versions`, `params`, `passes`, `results`, `typeSummary`, `inconsistencies`.

### 3.2 `engineRunId`

`sha256` de `JSON.stringify` de `{ modelId, listadoId, versions: { engine, vocabulary, frame }, params: { toleranceMm, epsilonMm, tupleRoundingMm } }`, armado a mano con las claves en ese orden (no se confía en el orden del objeto de entrada). Prefijo `sha256:` como `modelId` y `listadoId`. `furnitureId` y `passes` no entran.

## 4. Pruebas (`tests/engine/run.test.ts`, primero)

| Id | Qué | Esperado |
|---|---|---|
| N1 (M7, G3) | misma entrada dos veces | `JSON.stringify` idéntico; sin fechas (`/\d{4}-\d{2}-\d{2}T/`) |
| N2 (M6, G4) | 20 permutaciones de observaciones y de filas, semilla fija (LCG local de 5 líneas en el helper) | mismo JSON que sin permutar |
| N3 | `engineRunId` | cambia si cambia un parámetro, una versión, el `modelId` o el `listadoId`; no cambia con `furnitureId` |
| N4 | `listadoId` del run | igual a `listadoId(input.listado)` (en el primer fixture, el de TP-61) |
| N5 | orden binario | `results` con `ID10` antes que `ID9`; claves y códigos del primer fixture en ASCII (T10-E6) |
| N6 (T10-E3) | código repetido en el listado | `buildRun` lanza `ListadoInvalidoError` con motivo `codigo-repetido`; `associatePass1` con el mismo listado da `codigo-duplicado` (K12) |
| N7 (T10-E4) | código en `excludedCodes` | `dudosa` `["codigo-excluido"]`, evidencia de §2; sin `faltante`, `sin-confirmar` ni `typeSummary`; código en las dos listas lanza |
| N8 | `passes` | `1` |
| N9 | primer fixture | el run tiene las cifras de K17 y es igual en dos corridas |
| N10 | pureza | `associate.ts` sigue sin `node:crypto` ni `./hash` (M3); `run.ts` no lo importa ningún `"use client"` ni `src/pdf/` (H10) |
| N11 (§3.1.4) | una observación con `frameVersion` distinto de `FRAME_VERSION` | `buildRun` lanza `MarcoDistintoError` |

`fixture` de N1 y N2: segura, anómala, inexistente, cupo excedido, faltante y malla suelta (de `tests/helpers/engineFixtures.ts`). El empate del plan queda para T9.

## 5. Alternativas descartadas

**T10-E3 (código repetido):**
- Calcular `listadoId` sobre una serialización que admita repetidos: cambia §5.1, el hash ya probado (H1 a H10, TP-61) y no resuelve nada con datos reales.
- Asociar primero y dejar `listadoId: null`: obliga a cambiar el tipo del run y a que todo lector maneje un run sin id; un run así tampoco se podría publicar.

**T10-E4 (códigos excluidos):**
- No hacer nada: el reporte mostraría `codigo-inexistente` para códigos que sí están en el PDF. Engañoso para la revisión.
- Reutilizar `codigo-inexistente` con otro `detail`: la razón seguiría siendo falsa y las métricas por razón (§9.5) la contarían mal.
- Reutilizar `codigo-duplicado`: es otra causa. Un código excluido puede tener una sola fila, con el total o las medidas ilegibles; solo algunos (filas que difieren, INV-10/INV-11) tienen más de una.
- Rechazar el run con un listado `borrador`: E2 ya impide publicarlo; rechazarlo además deja al reporte sin datos de las demás piezas.

## 6. Después de T10

T11 mínimo (casos reales, G2, `--publicar`, `passes` en el reporte) → T12 → T14 (spec-adapter §4).

## 7. Decisiones (aprobadas por el equipo el 10/11: todas sí)

| Id | Pregunta | Decisión |
|---|---|---|
| T10-E1 | ¿El run se arma en `src/engine/run.ts` y `associate.ts` sigue sin crypto? | **Sí** |
| T10-E2 | ¿Se agrega `passes: 1 \| 2` al `AssociationRun` (enmienda a spec-motor §5.3), fuera del `engineRunId`? | **Sí** |
| T10-E3 | ¿`buildRun` calcula `listadoId` antes y deja pasar `ListadoInvalidoError` con un código repetido? | **Sí** |
| T10-E4 | ¿`excludedCodes` opcional en `AssociateInput` con la razón nueva `codigo-excluido` (enmienda a spec-motor §5.4)? | **Sí** |
| T10-E5 | ¿`VOCABULARY_VERSION = "vocabulario/0"` mientras no haya vocabulario? | **Sí** |
| T10-E6 | ¿Se mantiene la comparación con `<` y se prueba que las claves son ASCII? | **Sí** |
| §3.1.4 | ¿Un `frameVersion` distinto de `FRAME_VERSION` lanza? | **Sí** |

## 8. Historial

- **v0.1 (10/11/2026):** borrador, escrito al cerrar T8. Sin implementar.
- **v0.2 (10/11/2026):** aprobada por el equipo (T10-E1 a T10-E6 y §3.1.4, todas sí) e implementada en `motor-t10`: `src/engine/run.ts` (`buildRun`, `MarcoDistintoError`), `engineRunId` en `hash.ts`, `passes` y `codigo-excluido` en `types.ts` (spec-motor v3.1), `excludedCodes` en `associate.ts` (`CodigoExcluidoYListadoError`), `VOCABULARY_VERSION` en `versions.ts` (con la regla de `passes` para T9). Prueba nueva N11 para §3.1.4. Precisiones de la implementación:
  - El error de T10-E4 se llama `CodigoExcluidoYListadoError` en `src/engine/associate.ts`, igual que el de `src/pdf/crossCheck.ts` (son dos clases distintas: el motor no importa `src/pdf/`). Quien importe las dos tiene que renombrar una.
  - `excludedCodes` no entra en el `engineRunId` (§3.2 no lo nombra): dos runs con el mismo listado y distintos excluidos tendrían el mismo id. Hoy no se da (el listado y los excluidos salen del mismo PDF, y un listado con excluidos es `borrador` y no se publica), pero queda **a revisar** en T11.
  - Orden de los pasos como en §3.1: con un listado que repite un código y una observación de otro marco, gana `ListadoInvalidoError`; con otro modelo y otro marco, gana `ModeloDistintoError`.
  - `buildRun` copia `params` con las tres claves en orden fijo: un campo de más en el objeto de entrada no llega al run.
