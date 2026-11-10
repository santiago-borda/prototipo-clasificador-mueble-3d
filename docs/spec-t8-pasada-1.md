# Especificación — T8: pasada 1 del motor (código, medidas, cupo)

Versión: **v0.2 (10/11/2026), aprobada** por el equipo (10/11): T8-E1 a T8-E8, todas sí. Implementada en la rama `motor-t8`.
Antecedentes: `docs/plan-motor-asociacion.md` T8 (M5 parte pasada 1, M15), `docs/spec-motor-asociacion.md` v3 §3, §5.3, §5.4, §6.1 y §6.2, `docs/spec-adapter-observation-listadoid.md` v0.2.1 §3.4 y §4 (recorte del 20/11, E6), `docs/spec-t7-verificaciones-duras.md` v0.2 (T7 hecho, rama `motor-t7`).
**Es una enmienda, no un diseño nuevo:** se implementa T8 como está en el plan, salvo lo que dice §2. Si choca con el plan, manda el plan salvo en lo que esta spec enmienda explícitamente.

---

## 1. Objetivo y alcance

La pasada 1 asigna nivel a cada instancia evaluándola **solo contra el tipo de su código** (spec-motor §6.2): normalización del nombre (T2, `normalizeName`), verificación dura (T7, `checkDims`), cupo, piso `dudosa` e inconsistencias de corrida.

**No es objetivo:** la pasada 2 (T9: ranking, top-3, `empate`, `conflicto`, `cupo-completo-sugerido`), la evidencia blanda y las advertencias (T6, T7 completo), `listadoId`, `engineRunId` y `versions` del run (T10). Por el recorte del 20/11 (E6), T9 queda para después.

Consecuencia (T8-E2): en el run del 20/11 **toda dudosa sale con `candidates: []`**, también las que con la pasada 2 tendrían candidatos.

## 2. Enmiendas y precisiones al plan

| # | Qué | Por qué | Propuesta |
|---|---|---|---|
| T8-E1 | El plan hace que `associate` devuelva un `AssociationRun` completo, pero `listadoId`, `engineRunId` y `versions` son de T10 | Un id inventado o vacío se podría publicar por error | T8 exporta `associatePass1(input): Pass1Result` (§3). T10 arma el `AssociationRun` encima, sin cambiar esta firma. Sin `node:crypto` en `associate.ts` en T8 |
| T8-E2 | Sin pasada 2, `candidates: []` en toda dudosa choca con su significado (§5.4: "dudosa sin tipo que cumpla medidas", métrica §9.5) | Con el recorte, `[]` quiere decir "no se rankeó", no "no hay candidatos" | Se acepta para el 20/11. El reporte del eval (T11 mínimo) **no** calcula la métrica de dudosas sin candidatos mientras falte T9, y lo dice |
| T8-E3 | El orden y la composición de `reasons` no están fijados del todo | El run tiene que ser igual byte a byte (§5.3) y explicable | Orden de evaluación (§3.2): nombre, listado, medidas, cupo. `codigo-exacto` **solo** en las seguras (es la razón de la segura); una dudosa lleva solo lo que la bajó |
| T8-E4 | `evidence` de la instancia y su `detail` no están fijados | Igual que T7-E4 | `[codigo, espesor, medidas, cantidad]`, solo las comparaciones que se hicieron (§3.3), con texto fijo |
| T8-E5 | **Contradicción:** `listadoId` (T1, `src/engine/hash.ts`) lanza `ListadoInvalidoError(code, "codigo-repetido")` con un código repetido; spec-motor §6.2.1 y M15 esperan que el motor lo procese como `codigo-duplicado` | Si T10 calcula `listadoId` antes de asociar, `codigo-duplicado` nunca ocurre con datos reales; si lo calcula después, el run falla igual | `associatePass1` implementa `codigo-duplicado` tal como dice spec-motor (prueba M15 con filas armadas a mano). Qué hace el run con un listado así (rechazarlo antes, o asociar y no publicar) se decide en T10. `toListing` (2b) además ya saca de `pieces` los códigos con filas que difieren |
| T8-E6 | Con cupo excedido, seguras(T) = 0 < reclamantes(T): también corresponde `sin-confirmar` | Lectura literal de §6.2.3 y §6.2.5 | Se registran las dos inconsistencias (literal). Si el equipo prefiere que `cupo-excedido` absorba a `sin-confirmar`, se enmienda acá |
| T8-E7 | `sin-componente`: ¿una inconsistencia por malla o una por corrida? | `Inconsistency.instanceKeys` admite las dos | Una por malla (`pieceCode: null`, `instanceKeys: [key]`): cada una se puede revisar por separado |
| T8-E8 | `typeSummary` con un código duplicado | `quantity` y `claimants` no son confiables (§6.2.1) | El código duplicado **no** entra en `typeSummary`; se ve en las razones de sus instancias. Una entrada por código restante, ordenada por código (binario) |

## 3. Contrato

```ts
// src/engine/associate.ts (puro: sin three, sin @/model/, sin DOM, sin node:crypto en T8)
import type { EngineParams, InstanceResult, Inconsistency, ListadoRow, Observation, AssociationRun } from "./types";

export interface AssociateInput {
  furnitureId: string;
  modelId: string;
  observations: readonly Observation[];
  listado: readonly ListadoRow[];
  params: EngineParams;
}

export interface Pass1Result {
  /** Ordenados por instanceKey, comparación binaria. */
  results: InstanceResult[];
  /** Ordenado por pieceCode, binario; sin códigos duplicados (T8-E8). */
  typeSummary: AssociationRun["typeSummary"];
  /** Ordenadas por kind, pieceCode (null primero) e instanceKeys. */
  inconsistencies: Inconsistency[];
}

export function associatePass1(input: AssociateInput): Pass1Result;
```

- Una observación con `modelId` distinto de `input.modelId` lanza un error (como `MuebleDistintoError` del cruce 2b): no se mezclan modelos.
- `vocabulary` del plan queda fuera hasta T6; se suma como campo opcional sin cambiar la firma.

### 3.1 Definiciones (spec-motor §3)

- **Reclamantes(T):** instancias cuyo código normalizado (canónico o anómalo) es el código de T, sin importar medidas ni alineación.
- **Seguras(T):** reclamantes de T que quedan `segura`.

### 3.2 Reglas, en orden de evaluación

| Paso | Condición | Nivel | Razón agregada |
|---|---|---|---|
| 0 | `rawName: null` | `sin-asociar` (único caso) | `sin-componente`; inconsistencia `sin-componente` (T8-E7). Fin |
| 1a | nombre anómalo | techo `dudosa` | `nombre-anomalo` |
| 1b | formato inválido | `dudosa` | `formato-invalido`. Fin (sin tipo) |
| 1c | código (canónico o anómalo) que no está en el listado | `dudosa` | `codigo-inexistente`. Fin (sin tipo) |
| 2 | el código está en dos o más filas | `dudosa` | `codigo-duplicado`. Fin: no se mide (no hay un tipo único) ni entra en cupo, `faltante` ni `sin-confirmar` |
| 3 | `checkDims(obs, T, params)` con `measured: false` | `dudosa` | `geometria-no-alineada` |
| 3 | `checkDims` con `measured` y `!ok` | `dudosa` | `medida-fuera-de-tolerancia` |
| 4 | reclamantes(T) > quantity(T) | `dudosa` (todos los reclamantes) | `cupo-excedido`; una inconsistencia `cupo-excedido` por T con todos sus reclamantes |
| 5 | canónico + `ok` + cupo no excedido | `segura`, `pieceCode` = código | `reasons: ["codigo-exacto"]` (T8-E3) |

- **Piso:** una instancia con código canónico o anómalo y existente nunca queda por debajo de `dudosa` (por construcción: solo el paso 0 da `sin-asociar`).
- `pieceCode` es `null` salvo en las seguras. `warnings: []` y `candidates: []` en todas (T7-E1, T8-E2).
- `checkDims` decide si es `geometria-no-alineada` o `medida-fuera-de-tolerancia` con `measured`, no releyendo `obs.axisAligned` (T7-E2).

**Inconsistencias por tipo** (no para códigos duplicados):

- `faltante`: reclamantes(T) < quantity(T). `instanceKeys` = los reclamantes (puede ser `[]`).
- `sin-confirmar`: seguras(T) < reclamantes(T). `instanceKeys` = los reclamantes que no son seguros (T8-E6).
- `instanceKeys` siempre ordenadas (binario).

### 3.3 `evidence` y `detail` (T8-E4)

Con `f(x) = x.toFixed(2)`, en este orden y solo si se evaluó:

- `codigo` (siempre, salvo `sin-componente`, que no lleva evidencia):
  - canónico y existente: `cumple`, `código <c>, en el listado`
  - anómalo y existente: `no-cumple`, `nombre anómalo <rawName>, código <c> en el listado`
  - formato inválido: `no-cumple`, `nombre sin código válido`
  - inexistente: `no-cumple`, `código <c>, no está en el listado`
  - duplicado: `no-cumple`, `código <c>, en <n> filas del listado`
- `espesor` y `medidas`: las dos de `checkDims`, tal cual (T7, §3.2), cuando hay tipo único.
- `cantidad` (cuando hay tipo único): `cumple` si reclamantes ≤ quantity, `no-cumple` si no; `reclamantes <r>, cantidad del listado <q>`.

`<rawName>` se escribe tal cual (es dato del .dae, no se interpreta). Sin `rule`.

## 4. Pruebas (`tests/engine/associate.pass1.test.ts`, primero; casos con `tests/helpers/engineFixtures.ts`)

| Id | Qué | Esperado |
|---|---|---|
| K1 | canónico, medidas ok, cupo ok | `segura`, `["codigo-exacto"]`, `pieceCode` = código |
| K2 | anómalo, medidas ok | `dudosa`, `["nombre-anomalo"]` |
| K3 | anómalo e inexistente | `dudosa`, `["nombre-anomalo", "codigo-inexistente"]` |
| K4 | formato inválido | `dudosa`, `["formato-invalido"]`, sin `espesor`/`medidas` |
| K5 | medidas fuera | `dudosa`, `["medida-fuera-de-tolerancia"]` |
| K6 | no alineada | `dudosa`, `["geometria-no-alineada"]` |
| K7 | anómalo y medidas fuera | `["nombre-anomalo", "medida-fuera-de-tolerancia"]` |
| K8 | sin componente | `sin-asociar`, `["sin-componente"]`, inconsistencia `sin-componente` con su clave |
| K9 (M15) | 3 reclamantes, quantity 2 | las 3 `dudosa` con `cupo-excedido`; inconsistencias `cupo-excedido` y `sin-confirmar` (T8-E6) |
| K10 (M15) | 1 reclamante, quantity 2 | `faltante` con 1 clave; la instancia sigue `segura` |
| K11 (M15) | 2 reclamantes, uno fuera de medida | `sin-confirmar` con la clave del que no es seguro |
| K12 (M15) | código en dos filas del listado | `dudosa`, `["codigo-duplicado"]`; ni `faltante` ni `sin-confirmar` ni `typeSummary` para ese código |
| K13 | tipo sin instancias | `faltante` con `instanceKeys: []` |
| K14 | `modelId` distinto en una observación | lanza |
| K15 | orden | `results` por `instanceKey` binario (`ID10` < `ID9`); `typeSummary` por código; inconsistencias por kind, código y claves |
| K16 | `detail` | texto exacto de §3.3, un caso por variante de `codigo` y uno de `cantidad` |
| K17 | primer fixture (`observeDae` + `toListing("olmo", …).pieces`, tol 2 mm) | 32 `segura`, 1 `dudosa` `["nombre-anomalo"]` (C01), 6 `sin-asociar`; inconsistencias: `sin-confirmar` de C01 y 6 `sin-componente`; ni `faltante` ni `cupo-excedido` |
| K17b | segundo fixture | se saltea si falta `Sabrina/`; sin códigos ni cifras: todas las instancias con código son `segura` y no hay `faltante` ni `cupo-excedido` |
| M3 | pureza | `associate.ts` entra en `tests/engine/purity.test.ts`; además, no importa `node:crypto` ni `./hash` (T8-E1) |

## 5. Después de T8

T10 mínimo (`AssociationRun` con `listadoId`, `engineRunId`, `versions`, determinismo y permutaciones; resuelve T8-E5; borrador en `docs/spec-t10-run-minimo.md` v0.1) → T11 mínimo → T12 → T14 (spec-adapter §4).

## 6. Decisiones (aprobadas por el equipo el 10/11)

| Id | Pregunta | Decisión |
|---|---|---|
| T8-E1 | ¿T8 exporta `associatePass1` (sin ids) y T10 arma el `AssociationRun`? | Sí |
| T8-E2 | ¿Las dudosas salen con `candidates: []` el 20/11 y el reporte no mide "sin candidatos"? | Sí |
| T8-E3 | ¿Orden nombre → listado → medidas → cupo, y `codigo-exacto` solo en seguras? | Sí |
| T8-E4 | ¿`evidence` y `detail` como en §3.3? | Sí |
| T8-E5 | ¿`codigo-duplicado` se implementa como en spec-motor y el choque con `listadoId` se resuelve en T10? | Sí |
| T8-E6 | ¿Cupo excedido registra también `sin-confirmar`? | Sí (literal) |
| T8-E7 | ¿Una inconsistencia `sin-componente` por malla? | Sí |
| T8-E8 | ¿Un código duplicado no entra en `typeSummary`? | Sí |

## 7. Precisiones de la implementación (10/11)

Lo que la spec no fijaba y la implementación tuvo que decidir. Todas **a revisar** por el equipo; ninguna cambia un nivel ni una razón de §3.2.

- **`detail` de cada `Inconsistency`** (el campo es obligatorio y §3.3 solo fija el de la evidencia). Texto fijo, sin números con decimales:
  - `faltante` y `cupo-excedido`: `reclamantes <r>, cantidad del listado <q>` (el mismo texto que la evidencia `cantidad`).
  - `sin-confirmar`: `seguras <s>, reclamantes <r>`.
  - `sin-componente`: `malla sin componente`.
- **Error de modelo:** `ModeloDistintoError(expectedModelId, receivedModelId, instanceKey)`, definido en `src/engine/associate.ts`. No se reutiliza `MuebleDistintoError` de `src/pdf/crossCheck.ts` para que el motor no dependa de `src/pdf/`.
- **Variante de `codigo` con dos condiciones:** un nombre anómalo cuyo código no existe o está duplicado lleva el texto de *inexistente* o de *duplicado*; la anomalía queda en `reasons` (`nombre-anomalo` primero). El texto "nombre anómalo …" es solo para anómalo y existente en una sola fila.
- **`cupo-excedido` se agrega después de la razón de medidas:** un reclamante fuera de medida con cupo excedido queda `["medida-fuera-de-tolerancia", "cupo-excedido"]` (orden de §3.2).
- **Evidencia `cantidad`** en todo reclamante de un tipo único, también en los no alineados y en los fuera de medida; es la misma para todos los reclamantes de un tipo.
- **Comparación binaria:** `a < b` sobre cadenas de JS (unidades UTF-16), igual que `src/engine/hash.ts`. spec-motor §5.3 dice "por punto de código": coinciden para claves y códigos ASCII, que son todos los actuales. Se revisa en T10 junto con el orden del run.
- **Helper nuevo:** `tests/helpers/engineFixtures.ts` (`obs`, `row`, `code`, `input`; `"C01"` se expande a `9999-01-M01-C01`, también dentro de un nombre como `"_C01__"`).
- **Pruebas de más** (no cambian el contrato): K6 mira que `espesor` y `medidas` salgan `no-disponible`; K9 suma un reclamante fuera de medida; "formato inválido e inexistente no son reclamantes de ningún tipo"; K15 suma "no depende del orden de entrada" (mismo JSON con observaciones y filas permutadas a mano; las permutaciones con semilla son de T10).
- **K17 coincidió sin tocar nada:** 32 `segura`, 1 `dudosa` (`["nombre-anomalo"]`, C01), 6 `sin-asociar`; inconsistencias: 6 `sin-componente` y el `sin-confirmar` de C01, ni `faltante` ni `cupo-excedido`. **K17b** corrió en local con la carpeta presente y pasó.

## 8. Historial

- **v0.1 (10/11/2026):** borrador, escrito al cerrar T7. Sin implementar.
- **v0.2 (10/11/2026):** aprobada (T8-E1 a T8-E8, sí). Implementada: `src/engine/associate.ts` (`associatePass1`, `ModeloDistintoError`), `tests/engine/associate.pass1.test.ts` (K1 a K17, K17b), `tests/helpers/engineFixtures.ts` y `associate.ts` en M3 (sin `node:crypto` ni `./hash`). Precisiones en §7.
