# Especificación — T7 mínimo: verificaciones duras por par (`checkDims`)

Versión: **v0.2 (10/11/2026), aprobada** por el equipo (10/11): T7-E1 a T7-E5, todas sí. Implementada en la rama `motor-t7`.
Antecedentes: `docs/plan-motor-asociacion.md` T7 (M16), `docs/spec-motor-asociacion.md` v3 §5.3, §5.4, §6.2 y §14 (RF3), `docs/spec-adapter-observation-listadoid.md` v0.2.1 §3.4 y §4 (recorte del 20/11, E6), `docs/spec-t5-runner-eval.md` v0.2 (T5 hecho, rama `motor-t5`).
**Es una enmienda, no un diseño nuevo:** se implementa la parte dura de T7 como está en el plan, salvo lo que dice §2. Si choca con el plan, manda el plan salvo en lo que esta spec enmienda explícitamente.

---

## 1. Objetivo y alcance

Por el recorte del 20/11 (E6), T7 queda en **la verificación dura de un par (observación, tipo)**: medidas y espesor (spec-motor §6.2, elemento 2). Es lo que necesita T8 (pasada 1) para decidir `segura` o `dudosa` con `medida-fuera-de-tolerancia` o `geometria-no-alineada`.

**No es objetivo (queda para después del 20/11, con T6 y T9):** `orientationEvidence`, `positionEvidence`, `edgeEvidence`, `mirrorEvidence` y `rank` del plan T7. Tampoco la cantidad (`cupo-excedido`, `faltante`): es por tipo, no por par, y la calcula T8. Ni el código (`codigo-exacto`, `nombre-anomalo`): lo da `normalizeName` (T2).

Consecuencia que el equipo tiene que aceptar (T7-E1): el `AssociationRun` del 20/11 sale **sin advertencias** (`orientacion-no-coincide`, `posicion-no-coincide`, `canto-no-coincide`). Por RF3 la evidencia blanda nunca baja una segura, así que los niveles no cambian; solo falta información.

## 2. Enmiendas y precisiones al plan

| # | Qué | Por qué | Propuesta |
|---|---|---|---|
| T7-E1 | Recorte: solo `checkDims` | E6; la evidencia blanda depende del vocabulario (T6), que también queda para después | `src/engine/evidence.ts` exporta solo `checkDims`. Las otras funciones del plan se suman sin cambiar esta firma |
| T7-E2 | `checkDims` con `axisAligned: false` devuelve `ok: false`, igual que una medida fuera de tolerancia, pero la razón es otra | T8 tiene que distinguir `geometria-no-alineada` de `medida-fuera-de-tolerancia` | Se agrega `measured: boolean` al resultado (`false` solo si no está alineada). T8 decide la razón con `measured`, no releyendo `obs.axisAligned` |
| T7-E3 | El plan no dice qué vale `deviationMm` si no se mide | Un número inventado (0) haría que una no alineada parezca la mejor en la pasada 2 | `deviationMm: null` cuando `measured: false`. Cambia el tipo del plan (`number` → `number \| null`); la pasada 2 (T9) decide cómo ordenarla |
| T7-E4 | El texto de `detail` no está fijado | `AssociationRun` tiene que ser igual byte a byte en dos corridas (§5.3) | Formato fijo, §3.2, con `toFixed(2)`; una prueba compara el texto exacto |
| T7-E5 | Prueba con datos reales (no está en el plan) | Atrapar temprano un desvío entre el listado del PDF y el .dae, antes de T8 | §4, D8: las observaciones con código del primer fixture contra `toListing("olmo", validateFurniture(…)).pieces` (como en TP-61). Si alguna no cumple, **se para y se avisa**: no se toca la tolerancia ni el listado |

## 3. Contrato

```ts
// src/engine/evidence.ts (puro: sin three, sin @/model/, sin DOM; lo vigila tests/engine/purity.test.ts)
import type { EngineParams, Evidence, ListadoRow, Observation } from "./types";

export interface DimsCheck {
  /** false solo si obs.axisAligned es false: no se midió. */
  measured: boolean;
  /** measured y |Δ| ≤ tol + ε en los tres ejes. */
  ok: boolean;
  /** Suma de |Δ| de los tres ejes, en mm; null si no se midió. */
  deviationMm: number | null;
  /** Siempre dos, en este orden: espesor, medidas. */
  evidence: [Evidence, Evidence];
}
export function checkDims(obs: Observation, type: ListadoRow, p: EngineParams): DimsCheck;
```

### 3.1 Regla (spec-motor §6.2, elemento 2)

- `obs.sizeMm` ya viene ascendente (marco v1). Del tipo se ordena `[thicknessMm, widthMm, lengthMm]` ascendente: así las piezas con largo < ancho del listado (L y A sin reordenar, D3) se comparan bien.
- Δᵢ = `obs.sizeMm[i] − listado[i]`. Cumple el eje si `|Δᵢ| ≤ p.toleranceMm + p.epsilonMm` (borde inclusivo).
- Evidencia `espesor`: eje 0. Evidencia `medidas`: ejes 1 y 2 (cumple si cumplen los dos).
- `axisAligned: false`: `measured: false`, `ok: false`, `deviationMm: null`, las dos evidencias `no-disponible`.
- Sin redondeo en la decisión: la cuantización (`tupleRoundingMm`) es solo para la tupla de la pasada 2.
- No valida el listado (eso lo hace `listadoId`, T1) ni el código.

### 3.2 `detail` (T7-E4)

Con `f(x) = x.toFixed(2)` y `t = f(p.toleranceMm)`:

- espesor: `espesor <f(obs)> mm, listado <f(lst)> mm, tolerancia <t> mm`
- medidas: `medidas <f(a)> x <f(b)> mm, listado <f(la)> x <f(lb)> mm, tolerancia <t> mm`
- no alineada (las dos): `geometría no alineada: no se mide`

`rule` no se usa (no hay vocabulario).

## 4. Pruebas (`tests/engine/evidence.test.ts`, primero)

| Id | Qué | Esperado |
|---|---|---|
| D1 | largo = listado ± k·tol, k ∈ {0,95; 1,0; 1,05} (tabla del plan, las dos direcciones) | ok, ok, no ok |
| D2 | lo mismo en el ancho | ídem |
| D3 | espesor 21 mm con listado 18 y tol 2 | `ok: false`; `espesor` `no-cumple`, `medidas` `cumple` |
| D4 | `axisAligned: false` | `measured: false`, `deviationMm: null`, dos `no-disponible` |
| D5 | listado con largo < ancho (150 x 900) y caja [18, 150, 900] | ok |
| D6 | `deviationMm` | suma exacta de \|Δ\| en un caso armado a mano |
| D7 | `detail` | texto exacto de §3.2 en un caso que cumple, uno que no y uno no alineado |
| D8 (T7-E5) | primer fixture: cada observación con `rawName` que normaliza a un código del listado del PDF, contra su fila, tol = `olmoDef.toleranceMm` | todas `ok`. Segundo fixture: se saltea si falta `Sabrina/`, no escribe códigos ni cifras |
| M3 | pureza | `evidence.ts` entra en `tests/engine/purity.test.ts` (se suma a la lista de archivos esperados) |

## 5. Después de T7

T8 (pasada 1: código, `checkDims`, cupo, piso `dudosa`, inconsistencias `faltante` y `sin-confirmar`) → T10 mínimo → T11 mínimo → T12 → T14 (spec-adapter §4).

## 6. Decisiones (aprobadas por el equipo el 10/11)

| Id | Pregunta | Decisión |
|---|---|---|
| T7-E1 | ¿T7 queda solo en `checkDims` y el run del 20/11 sale sin advertencias? | Sí |
| T7-E2 | ¿Se agrega `measured` al resultado? | Sí |
| T7-E3 | ¿`deviationMm: null` cuando no se mide? | Sí |
| T7-E4 | ¿`detail` con el formato de §3.2? | Sí |
| T7-E5 | ¿Prueba D8 con el listado del PDF del primer fixture? | Sí; si falla, se para |

## 7. Precisiones de la implementación (10/11)

- D8 cuenta como "con código" las observaciones con nombre canónico **o anómalo** (`normalizeName`), así que el componente con `__` del primer fixture también se mide: 33 observaciones, todas `ok`. Las 6 mallas sin componente no entran.
- D8b (segundo fixture) corrió en local con la carpeta presente: todas `ok`. Además de "ninguna falla", verifica que la cantidad medida sea la suma de `quantity` del listado (sin escribir la cifra).
- D1 suma un caso que mira las dos evidencias del que no cumple (`espesor` cumple, `medidas` no); D6 suma un caso que no cumple; D7 suma "sin `rule`". No cambian el contrato.
- El ordenamiento del listado usa `sort((a, b) => a - b)` sobre una copia; `obs.sizeMm` no se reordena (viene ascendente del marco v1).

## 8. Historial

- **v0.1 (10/11/2026):** borrador, escrito al cerrar T5.
- **v0.2 (10/11/2026):** aprobada (T7-E1 a T7-E5, sí). Implementada: `src/engine/evidence.ts` (`checkDims`) y `tests/engine/evidence.test.ts` (D1 a D8, D8b); `evidence.ts` en M3. Precisiones en §7.
