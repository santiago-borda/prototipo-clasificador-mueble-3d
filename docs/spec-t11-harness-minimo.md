# Especificación — T11 mínimo: harness con casos reales, G2 y publicación

Versión: **v0.2 (10/11/2026), aprobada** por el equipo (10/11: T11-E1 a T11-E9, todas sí). **Implementada** en la rama `motor-t11` (§8).
Antecedentes: `docs/plan-motor-asociacion.md` T11 (M13, Q5), `docs/spec-motor-asociacion.md` v3.1 §9.1, §9.5, §9.6 y §9.7, `docs/spec-adapter-observation-listadoid.md` v0.2.1 §2.3 (E2, guarda de publicación) y §4 (recorte del 20/11, E6), `docs/spec-t5-runner-eval.md` v0.2 (runner y jsdom), `docs/spec-t10-run-minimo.md` v0.2 (T10 hecho, rama `motor-t10`; T10-E2, T10-E3 y T10-E4).
**Es una enmienda, no un diseño nuevo:** se implementa T11 como está en el plan, recortado a lo que pide el 20/11 y con lo que dice §2. Si choca con el plan, manda el plan salvo en lo que esta spec enmienda explícitamente.

---

## 1. Objetivo y alcance

Completar `npm run eval` (`eval/run.ts`, hoy esqueleto de T5) para que corra los **casos reales**, evalúe el gate con **G2, G3 y G4**, escriba el reporte y, con `--publicar`, publique el `AssociationRun` del primer fixture en `eval/runs/<hash>.json`, solo si el gate aprueba y el listado es `publicable`.

**Es el mínimo del recorte del 20/11 (E6):** la pasada 1 y G2. T12 (primera corrida, `esperados.json` revisado a mano, activar M13) y T14 (visor) vienen después.

**No es objetivo:** casos sintéticos y perturbaciones (T13), G1 con variantes (T13), G5 y baseline (T20), modo sombra (T19), reportes de entrega (T21), la pasada 2 (T9), el vocabulario (T6). Sin dependencias nuevas.

## 2. Enmiendas y precisiones al plan

| # | Qué | Por qué | Propuesta |
|---|---|---|---|
| T11-E1 | **Recorte de archivos** | El plan crea `cases.ts`, `harness.ts`, `gate.ts`, `report.ts`, `publish.ts` y `src/lib/modelSources.ts` | Se crean los seis con las interfaces del plan, pero `synthetic` es siempre `[]` y `VariantOutcome` se declara vacío (`never`) hasta T13. Sin tiempo en el reporte por ahora (sí la versión de Node, que va con G3) |
| T11-E2 | **Fuente del listado del primer fixture** | El plan T12 usa `olmoDef.pieceTypes` (mock); T7, T8 y T10 (D8, K17, N9) usan `toListing("olmo", validateFurniture(olmoDocuments()))`, el listado del PDF transcripto. Los dos dan **distinto `listadoId`** (TP-61 fija el del PDF) | El harness usa el listado del PDF (`toListing`), igual que K17 y N9: es la entrada real del sistema (reunión del 20/10). `olmoDef.pieceTypes` queda para el visor. **A aprobar: decide qué `listadoId` se publica** |
| T11-E3 | **`--publicar` con `assertPublicable`** | E2: un `borrador` (con `excluded` o `unkeyedRows`) no se publica | `--publicar` llama a `assertPublicable(listing)` **antes** de `publishRun`; con `ListadoNoPublicableError` no escribe nada y sale con código distinto de 0, aunque el gate apruebe. El reporte del borrador sí se escribe (T10-E4: el run sirve para el reporte) |
| T11-E4 | **`excludedCodes` al motor** | T10-E4 | `cases.ts` pasa `excludedCodes: listing.excluded.map((e) => e.code)` a `buildRun`. Con el primer fixture hoy es `[]` (N9) |
| T11-E5 | **Caso real sin run** | T10-E3: con un código repetido `buildRun` lanza `ListadoInvalidoError`; un listado `bloqueado` no tiene piezas | **Redacción v0.2:** un caso real da `{ status: "no-ejecutado", motivo }` en **solo dos situaciones**: (a) el listado es `bloqueado` (no se llama a `buildRun`; motivo `listado bloqueado (<razón>)`) y (b) `buildRun` lanza `ListadoInvalidoError` (motivo `listado inválido (<motivo>)`). No se usa `ListadoNoPublicableError` ni `assertPublicable` para esto: esa guarda es solo de `--publicar` (T11-E3). El motivo no lleva códigos ni cifras del mueble. **Cualquier otro error** (`ModeloDistintoError`, `MarcoDistintoError`, `CodigoExcluidoYListadoError`, `DaeStructureError`...) se deja pasar: es un bug, no un caso. **G2 trata un `no-ejecutado` del primer fixture como falla** (está en el repo); del segundo, como hoy (§9.1). La lógica está en `buildRealCase` (`eval/cases.ts`), que `loadRealCases` usa para cada mueble y que las pruebas llaman directo (E6) |
| T11-E6 | **`passes` en el reporte** | T10-E2 | El reporte muestra `passes` por caso. Con `passes: 1` la métrica "dudosas sin candidatos" (§9.5) **no se calcula**: se escribe `n/a (pasada 1: no se rankeó)`. Top-1 y top-3 tampoco (no hay candidatos). Se siguen reportando % resuelto, % dudosas, sin componente y las inconsistencias, como n/N |
| T11-E7 | **G1 sin sintéticos** | El plan llama a G1 con `synthetic: []`: daría `ok` sin haber probado nada | G1 queda `"no-ejecutado"` con motivo "sin casos sintéticos (T13)" y **no** hace fallar el gate, igual que G5. Los reales no cuentan para G1 (su precisión es tautológica, §9.1) |
| T11-E8 | **`excludedCodes` fuera del `engineRunId`** (pendiente de T10 v0.2) | Dos runs con el mismo listado y distintos excluidos tendrían el mismo id | No se cambia el id: un run con excluidos viene de un `borrador` y T11-E3 impide publicarlo, así que nunca hay dos publicados con el mismo id. El reporte muestra la cantidad de excluidos por caso. Se revisa si algún día se publica un borrador |
| T11-E9 | **G2 antes de T12** | No existe `eval/esperados.json` | Como dice el plan (paso 5): hoy G2 falla para el primer fixture con "falta esperados" y `npm run eval` sale con 1. Esperado hasta T12. M13 queda `it.todo` hasta T12 (plan) |

## 3. Contrato (del plan, con las enmiendas)

```ts
// src/lib/modelSources.ts (Node, node:fs)
export function modelSourceFor(furnitureId: string, opts?: { sabrinaDir?: string }):
  { daePath: string; runsDir: string; esperadosPath: string } | null;

// eval/cases.ts
export type RealCase =
  | { furnitureId: string; status: "ok"; listing: Extract<Listing, { status: "publicable" | "borrador" }>; dae: DaeObservation; run: AssociationRun }
  | { furnitureId: string; status: "no-ejecutado"; motivo: string };
export function buildRealCase(x: { furnitureId: string; listing: Listing; dae: DaeObservation; toleranceMm: number }): RealCase; // T11-E4 y T11-E5
export function loadRealCases(opts: { sabrinaDir: string }): Promise<RealCase[]>;  // async: el import() dinámico del segundo fixture

// eval/gate.ts
export function projectRun(run: AssociationRun): ExpectedRun;      // proyección del plan, con `passes`
export type EsperadosFile = Record<string /* modelId */, ExpectedRun>;
export function readEsperados(file: string): EsperadosFile;          // {} si no existe
export function evaluateGate(x: {
  real: readonly RealCase[];
  esperados: (furnitureId: string) => EsperadosFile | null;     // {} o null = sin esperados -> "falta esperados"
  published: (furnitureId: string, modelId: string) => { engineRunId: string } | null; // E5: run publicado, si hay
  determinism: { a: string; b: string };
  permutations: { ok: boolean; detail: string };
}): GateResult;                                                       // G1 y G5 "no-ejecutado" (T11-E7)

// eval/publish.ts
export function publishRun(run: AssociationRun, runsDir: string, publico: readonly string[]): string;
export function recordFirstRun(file: string, modelId: string, date: string): void;
```

`eval/harness.ts`: `runEval(opts, io?: EvalIo): Promise<{ exitCode; gate; messages }>` orquesta todo (casos, G3 con dos cargas completas, G4 con 20 permutaciones de instancias y de filas del listado por caso, gate, reporte, `--escribir-esperados` y `--publicar`). `EvalIo` (`loadCases`, `sourceFor`, `publico`, `today`) inyecta las fuentes: las pruebas usan directorios temporales. `eval/report.ts`: `buildReport`, `renderMarkdown`, `writeReport(report, outDir, privateDir?)`; el encabezado dice **GATE PARCIAL — solo G2, G3 y G4** mientras algún check esté `no-ejecutado`; del segundo fixture, `outDir` solo lleva "ejecutado; detalle solo en la carpeta local" y el detalle completo va a `<sabrinaDir>/eval/out/` (E13). `eval/publico.json`: `["olmo", "sintetico"]`.

`eval/run.ts`: flags del plan (`--sabrina-dir`, `--out`, `--seed`, `--publicar`, `--escribir-esperados`). `--publicar`: gate aprobado **y** `assertPublicable` (T11-E3). `--escribir-esperados` escribe la proyección y no aprueba el gate en esa corrida.

## 4. Pruebas (`tests/eval/gate.test.ts`, `tests/eval/publish.test.ts`, primero)

| Id | Qué | Esperado |
|---|---|---|
| E1 (G2) | caso real presente distinto de esperados | falla |
| E2 (G2) | modelo del repo con `modelId` ausente en esperados | falla con "hash distinto" |
| E3 (G2, §9.1) | segundo fixture ausente | `no-ejecutado`, el gate aprueba |
| E4 (G2) | segundo fixture presente sin esperados | falla |
| E5 (G2) | run publicado con `engineRunId` distinto del actual | falla "publicación desactualizada" |
| E6 (T11-E5) | primer fixture con `ListadoInvalidoError` | `no-ejecutado` con el motivo y G2 falla; otro error (p. ej. `MarcoDistintoError`) se propaga |
| E7 (G3, G4) | dos corridas y 20 permutaciones dentro del harness | `ok` |
| E8 (T11-E7) | sin sintéticos | G1 y G5 `no-ejecutado`, no fallan |
| E9 (T11-E3) | `--publicar` con un listado `borrador` (gate aprobado) | no escribe en `runsDir` ni en `primera-corrida.json`, sale ≠ 0, el reporte sí se escribe (`tests/eval/harness.test.ts`) |
| E10 | `publishRun` con un `furnitureId` fuera de `eval/publico.json` | lanza |
| E11 | `recordFirstRun` | no sobrescribe una fecha ya escrita |
| E12 (T11-E6) | reporte con `passes: 1` | "dudosas sin candidatos", top-1 y top-3 = `n/a (pasada 1: no se rankeó)`; `passes` visible por caso |
| E13 | privacidad | el reporte con el segundo fixture no escribe códigos ni cifras de ese caso fuera de `Sabrina/` |
| M13 | `npm run eval` con `--sabrina-dir` inexistente | `it.todo` hasta T12 (plan; `tests/eval/m13.test.ts`) |
| R4 (T5, actualizada) | `npm run eval --sabrina-dir <inexistente> --out <tmp>` | sale con 1, imprime `jsdom 24.1.3`, `falta esperados` y `GATE PARCIAL` (T11-E9) |
| H10 (ampliada) | `src/lib/modelSources.ts` | ningún `"use client"` ni `src/pdf/` lo importa |

Archivos: `tests/eval/{gate,publish,cases,report,harness,m13}.test.ts` (los dos primeros son los de la spec; E6 en `cases`, E12 y E13 en `report`, E9 y E7 dentro del harness en `harness`) y `tests/helpers/evalFixtures.ts`. Todas en directorios temporales (`mkdtemp`); ninguna escribe en `eval/runs/` ni en `eval/esperados.json` del repo.

## 5. Alternativas descartadas

- **T11-E2, listado del mock:** el visor y el motor compararían contra fuentes distintas sin que lo pruebe nada; además TP-61 ya fija el `listadoId` del PDF.
- **T11-E3, publicar el borrador con una marca:** E2 ya lo prohíbe; un run publicado con códigos excluidos dejaría piezas sin ficha sin aviso en el visor.
- **T11-E7, G1 `ok` con cero variantes:** un gate que aprueba sin evaluar es engañoso en el reporte de la pre-entrega.
- **T11-E6, calcular "dudosas sin candidatos" igual:** con `passes: 1` daría 100 % siempre y se leería como "ningún tipo cumple medidas", que es falso.

## 6. Después de T11

T12 (primera corrida, `esperados.json` revisado a mano, A4 reescrito, M13 activo, run publicado; borrador en `docs/spec-t12-primera-corrida.md`) → T14 (visor con seguras).

## 7. Decisiones (aprobadas por el equipo el 10/11: todas sí)

| Id | Pregunta | Decisión |
|---|---|---|
| T11-E1 | ¿Se crean los seis archivos del plan con `synthetic: []` y sin tiempo en el reporte? | **Sí** |
| T11-E2 | ¿El harness usa el listado del PDF (`toListing`) y no `olmoDef.pieceTypes`? (Decide el `listadoId` publicado) | **Sí** |
| T11-E3 | ¿`--publicar` exige `assertPublicable` además del gate, y un borrador sale ≠ 0 sin escribir? | **Sí** |
| T11-E4 | ¿`cases.ts` pasa `excludedCodes` desde `listing.excluded`? | **Sí** |
| T11-E5 | ¿Solo `ListadoInvalidoError` y el `bloqueado` dan `no-ejecutado`, y en el primer fixture eso falla G2? | **Sí** |
| T11-E6 | ¿Con `passes: 1` no se calculan "dudosas sin candidatos", top-1 ni top-3? | **Sí** |
| T11-E7 | ¿G1 `no-ejecutado` sin sintéticos, sin hacer fallar el gate? | **Sí** |
| T11-E8 | ¿`excludedCodes` sigue fuera del `engineRunId`? | **Sí** |
| T11-E9 | ¿Se acepta que `npm run eval` salga con 1 (G2 sin esperados) hasta T12? | **Sí** |

## 8. Historial

- **v0.1 (10/11/2026):** borrador, escrito al cerrar T10. Sin implementar.
- **v0.2 (10/11/2026):** aprobada por el equipo (T11-E1 a T11-E9, todas sí) e implementada en `motor-t11`: `src/lib/modelSources.ts`, `eval/{cases,harness,gate,report,publish}.ts`, `eval/publico.json`, `eval/run.ts` completo. T11-E5 reescrita (§2): `bloqueado` e `ListadoInvalidoError` son los únicos `no-ejecutado`. Precisiones de la implementación (desvíos respecto de v0.1, todos conservadores):
  - `loadRealCases` es **asíncrona** (`Promise<RealCase[]>`): el `import()` dinámico de la definición del segundo fixture lo es, y el plan T11 lo pide así. Se agrega `buildRealCase` para poder probar T11-E5 sin leer archivos.
  - `evaluateGate` recibe además `published` (E5 necesita el run publicado y el contrato de v0.1 no lo traía) y no recibe `synthetic` (T11-E1: siempre `[]`, no hay nada que pasar).
  - `ExpectedRun` suma `passes` (§3: "proyección del plan, con `passes`").
  - G2 distingue `falta esperados` (archivo ausente o vacío) de `hash distinto` (archivo con entradas pero sin el `modelId`): E2 pide el segundo texto y el paso 5 del plan el primero. Un caso del repo muestra el número de instancias distintas; los demás, nada con cifras (E13).
  - Se agrega la orquestación `runEval` con `EvalIo` inyectable (el plan solo describe el CLI): es la única forma de probar E9 sin escribir en `eval/runs/`. Con `--publicar`, la guarda `assertPublicable` se aplica a **todos** los casos públicos antes de escribir nada.
  - `--publicar` además llama a `recordFirstRun` (`primera-corrida.json` junto a `esperados.json`, con la fecha de la corrida; el run no lleva fechas).
  - El reporte de salida del segundo fixture no lleva hashes, códigos ni cifras; el detalle completo va a `<sabrinaDir>/eval/out/reporte.{md,json}` (carpeta ignorada). No estaba en el plan; es lo que implica E13 sin perder la información.
  - `REPO_ROOT` se calcula con `__dirname` (`import.meta.url` no es una URL `file:` en el entorno jsdom de vitest). Con la carpeta del segundo fixture presente y un número de `.dae` distinto de uno, `modelSourceFor` lanza (configuración rota, no un caso).
  - Estado (10/11, con `Sabrina/` presente): 624 pasan, 4 `todo` (TP-23, TP-55, TP-70, M13). `npm run eval` sale con 1: G2 falla con `falta esperados` para el primer fixture (T11-E9), G3 y G4 ok; con `Sabrina/` presente, también para el segundo. El primer fixture da 32 / 1 / 6, como K17 y N9. G1 y G5 `no-ejecutado`.
