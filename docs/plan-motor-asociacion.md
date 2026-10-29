# Motor de asociación explicable y Eval Harness — Plan de implementación (fase 1)

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** asociar cada instancia del .dae con un tipo del listado en tres niveles (`segura` / `dudosa` / `sin-asociar`) con evidencia, medirlo con un Eval Harness con gate, y que el visor y la ficha vinculen solo las seguras leyendo un `AssociationRun` precalculado.

**Arquitectura:** un índice del XML del .dae (`src/model/daeIndex.ts`) da `instanceKey` y nombre crudo a cada instancia, lo usan el adapter (`src/model/observe.ts`, única capa con three) y el visor. El motor (`src/engine/`, funciones puras) recibe `Observation[]` + listado y devuelve un `AssociationRun` determinista. El harness (`eval/`, Node con `vite-node`) corre casos reales y perturbaciones, aplica el gate G1–G5 y publica `eval/runs/<hash>.json`, que el servidor de Next lee en build para pasar al visor el mapa `instanceKey → código` de las seguras.

**Stack:** TypeScript, three 0.186 (`ColladaLoader`), vitest 3.2.7 + jsdom 24.1.3, vite-node 3.2.4 (ya instalado por vitest), Next 16.4 (app router; `output: "export"` solo para la herramienta de etiquetado).

**Spec:** `docs/spec-motor-asociacion.md` (v3, commit 31a6e6c). Anexo local: `Sabrina/docs/anexo-motor.md` (ignorado). Este plan argumenta desde el spec; leer los dos.

---

## 0. Avisos antes de ejecutar (responder antes de la tarea 1)

Ambigüedades y contradicciones encontradas al planificar. **No están resueltas en silencio**: el plan toma la opción marcada como "por defecto" solo para poder escribirse; si la respuesta es otra, cambian las tareas indicadas.

| # | Tema | Qué encontré | Por defecto en el plan | Tareas afectadas |
|---|---|---|---|---|
| Q1 | "Olmo u Oslo" | El encargo dice preguntar a Casa Mueble "Olmo u Oslo" antes de etiquetar. El spec §2.2 y §15 dicen que **Olmo está confirmado** (consulta 34, cerrada el 16/10) y que lo pendiente es la **reexportación** (consulta 48). | Sigo el spec: el punto de parada es la consulta 48 (reexportación), no la 34. | T23, parada CM-48 |
| Q2 | Herramienta de etiquetado "solo de desarrollo" | El encargo la llama entrada solo de desarrollo. El spec §10.3 dice explícitamente que **cambió**: la usa personal de Casa Mueble desde afuera, con **despliegue aparte, no indexado**, y sigue fuera del bundle de producción. | Sigo el spec: app estática aparte (`tools/etiquetado/`, `output: "export"`), que el build de la app no compila; verificación contra la salida de los dos builds. | T17, T18 |
| Q3 | Orden de la fase 1 | El encargo pone el etiquetado (3) antes que motor y harness (4). El spec §2.2 y el cronograma §2.3 ponen motor y harness en el paso 3 y la herramienta en paralelo (paso 4), y el etiquetado espera la reexportación. | Dos pistas: **A** (adapter → motor → harness → visor, el mínimo de la pre-entrega) y **B** (herramienta de etiquetado, en paralelo desde T3, con meta 13/11). | Orden de tareas |
| Q4 | `modelId` y fines de línea | §3: `modelId = sha256` de los **bytes**. M1: "mismo `modelId` con fin de línea LF y CRLF". Son incompatibles si se hashean bytes crudos. Además, **en esta copia `public/models/Olmo/olmo.dae` está en CRLF en disco y LF en el índice** (`git ls-files --eol`: `i/lf w/crlf`): hoy el hash en Windows y en Linux da distinto. | `modelId = sha256` de los bytes **con `\r\n` → `\n`** antes de hashear; `.gitattributes` + re-checkout igual (defensa doble). Alternativa: bytes crudos y M1 verifica que el disco quede en LF tras el re-checkout. | T1 |
| Q5 | "Sin CI" | El spec §1 dice "lo que pasó G1–G5 en CI"; el proyecto no tiene CI (CLAUDE.md). | El gate se corre a mano (`npm run eval`) y `--publicar` solo escribe si el gate aprueba. Nada de CI. | T11 |
| Q6 | Cambios sin commitear del 16/10 | El encargo dice que hay cambios sin commitear en `CLAUDE.md`, `docs/spec-siguiente-paso.md` y `tests/sabrina.test.ts`. `git status` está limpio: esos cambios están en el commit `4eb8f04` ("actualizacion de archivo de spec"). | Nada que excluir. Igual, T12 tiene que tocar `tests/sabrina.test.ts` (A4 reescrito, spec §11). | T12 |
| Q7 | "Sabrina" en el spec | Cuento **15** líneas con "Sabrina" (no 13): 5, 153, 399, 403, 405, 482, 497, 511, 512, 573, 579, 621, 641, 642, 752. Cuatro son rutas o el nombre de la carpeta (5, 153 en parte, 405, 512). | Recomiendo homogeneizar el texto a "segundo modelo local" y dejar las rutas `Sabrina/`. **No toqué el spec**: espero tu OK. | ninguna (documento) |

---

## Restricciones globales

Cada tarea las incluye implícitamente.

- `src/engine/` **no importa three ni usa el DOM** (ni `DOMParser`, `document`, `window`). Puede usar `node:crypto` (el motor nunca corre en el cliente, spec §1).
- **Sin dependencias nuevas.** El eval corre con `vite-node` (ya en `node_modules` por vitest 3) e inyecta `DOMParser` desde `jsdom` 24.1.3, el mismo que usa vitest.
- **Privacidad:** nada de Sabrina en el repo — ni .dae, ni listado, ni esperados, ni baseline, ni etiquetas, ni reportes, ni códigos o cifras en documentos versionados. Todo lo de Sabrina vive en `Sabrina/` (ignorada). Sin `Sabrina/`, todo corre y el reporte dice **"no ejecutado"** (no es falla del gate).
- Los conteos de Olmo **32 seguras + 1 dudosa (C01) + 6 sin asociar son una estimación**: ninguna prueba los escribe a mano. Los fija la primera corrida real, revisada a mano, en `eval/esperados.json` (T12).
- La C01 de Olmo queda `dudosa` (`nombre-anomalo`) y **sin vincular** en la fase 1: efecto esperado, no regresión.
- `.gitattributes` con `*.dae binary` va en el **mismo commit** que `git add --renormalize .`.
- Nunca editar un .dae a mano. Un .dae nuevo y su `esperados.json` regenerado van en el mismo commit.
- `AssociationRun` sin fechas ni tiempos; `results` ordenados por `instanceKey` con comparación binaria (`a < b ? -1 : a > b ? 1 : 0`, nunca `localeCompare`).
- Parámetros: `ε = 1e-6` mm, `tupleRoundingMm = 0.01` (por defecto), tolerancia = `FurnitureDef.toleranceMm` (Olmo 2 mm).
- `modelId` y `listadoId` llevan prefijo `sha256:`; en nombres de archivo va el hash **sin** prefijo.
- Sin CI, sin base de datos, sin auth. No tocar `ESTADO.md`. **No commitear sin pedido explícito del usuario**: los pasos "Commit" de este plan son "proponer el commit y esperar el OK".
- Next 16: antes de usar una API de Next, leer `node_modules/next/dist/docs/` (AGENTS.md).

## Decisiones del plan (lo que el spec deja al plan)

| Tema | Decisión | Por qué |
|---|---|---|
| Correlación XML ↔ malla (spec §4a) | `daeIndex.ts` recorre el XML, arma la tabla de instancias y devuelve un XML **etiquetado**: el `name` de cada nodo-instancia pasa a `@key:<instanceKey>`. three conserva ese nombre; el adapter y el visor buscan el ancestro `@key:` de cada malla. `NamedColladaLoader` usa el mismo índice (deja de depender de `PIECE_NAME`). | Un solo recorrido del XML para adapter y visor; no depende de que three exponga el `id` (sin verificar, §19). |
| Instancia con componente | Nodo de `visual_scene` con exactamente un `<instance_node>` y sin contenido propio. `rawName` = `name` del nodo de `library_nodes` apuntado, tal cual. | Igual a lo verificado en §19. |
| Malla suelta | Nodo de `visual_scene` (fuera de un componente) con `<instance_geometry>` cuya geometría tiene triángulos. Una `Observation` por nodo, `rawName: null`. | Olmo: 6 nodos `group_6…group_11`, uno por malla. |
| Líneas | Geometría con solo `<lines>`/`<linestrips>`: se cuenta como línea, **no** como malla suelta. | El segundo modelo local tiene objetos de líneas y ninguna malla sin código (cifras en el anexo local). |
| Fallar fuerte | `DaeStructureError { nodeId }` si un nodo tiene >1 `instance_node`, o `instance_node` + contenido propio, o si un componente de la biblioteca contiene otro `instance_node` (componente anidado: no lo cubre el spec; se falla en vez de adivinar). | §4a "el adapter no adivina". |
| Caja de referencia del mueble | Unión de las cajas de **todas** las observaciones del modelo sin perturbar (con y sin componente). | §5.2 "geometría del modelo". |
| Marco v1 (`frameVersion = "marco/1"`, AS2) | Escena de three tras `ColladaLoader` (Y arriba). Eje 0 = X (izquierda 0 → derecha 1), eje 1 = Y (abajo → arriba), eje 2 = Z (atrás → **frente**, +Z). Frente = lado desde el que mira la cámara inicial del visor (`BASE_CAMERA = [1.8, 1.2, 2.15]`). Se documenta en `docs/marco-referencia.md` y se verifica con las tapas de cajón de Olmo. | §4a pide documentarlo. |
| Tupla (`ScoreTuple`) | 7 números, **menor = mejor**, comparación lexicográfica. e1–e3: 0/1; e4–e6: 0 cumple, 1 neutral o no disponible, 2 no cumple; e7: desvío total en mm redondeado a `tupleRoundingMm`. | Un único orden ascendente; el primer elemento distinto es la explicación. |
| Proyección para G2 | `esperados.json` guarda por `modelId`: `furnitureId`, `listadoId`, y por instancia `instanceKey`, `level`, `pieceCode`, `reasons`, códigos del top-3. La evidencia (texto) no entra. | Evita que un cambio de redacción rompa G2; lo que decide el nivel sí entra. |
| Publicación | `npm run eval -- --publicar` escribe `eval/runs/<hash>.json` solo si el gate aprueba y el `furnitureId` está en `eval/publico.json`. Sabrina publica en `Sabrina/eval/runs/`. La primera publicación de un `modelId` escribe `eval/primera-corrida.json`. | §1, §9.7, §10.6. |
| Lectura en la app | En build, un módulo de servidor (`src/lib/publishedRuns.ts`) lee el .dae del disco, calcula su `modelId` y busca el run. A los componentes cliente solo llega `SafeLinks` (mapa de seguras). | El motor no corre en el cliente (RF11); `crypto.subtle` no existe en http por LAN. |
| Sabrina presente sin esperados | G2 **falla** con "falta Sabrina/eval/esperados.json" (salvo con `--escribir-esperados`). Sabrina **ausente** = "no ejecutado". | Presente y sin referencia no es "no ejecutado". |
| Herramienta de etiquetado | App Next aparte en `tools/etiquetado/` (`output: "export"`, build con `next build tools/etiquetado`). No importa nada de `src/`: consume `public/modelo.dae` (saneado) y `public/listado.json` (sin códigos: refs opacas). Tabla token ↔ `instanceKey` y ref ↔ código en `tools/etiquetado/tokens.json`, fuera de `public/`. | §10.3; Turbopack autodetecta la raíz por `package-lock.json`, así que resuelve `node_modules` del repo. |

## Foco de revisión

Entradas que el spec implica y que ninguna tarea probaría por sí sola; cada una tiene su prueba en la tarea indicada.

1. **El .dae en CRLF en Windows** (caso real en esta copia): el `modelId` tiene que ser el mismo que en Linux, o G2 y la lectura del run publicado fallan solo en una máquina. → T1, `modelId: CRLF y LF dan el mismo hash`.
2. **El servidor sirve un .dae distinto del publicado** (reexportación commiteada sin `--publicar`): la app no debe vincular nada por `instanceKey` viejos, y tiene que avisar. → T14, `getSafeLinks: modelId sin run publicado → sin-publicacion`.
3. **Geometrías de solo líneas** contadas como mallas sueltas inflarían `sin-componente` (el segundo modelo local tiene varias). → T3, `una geometría solo de líneas cuenta como línea, no como malla suelta`.
4. **Fuga por referencias compartidas en el modelo saneado:** dos instancias del mismo componente apuntan al mismo nodo de biblioteca (`url="#ID7"`); en pares equivalentes eso revela el tipo aunque el nombre sea un token. → T17, `ningún instance_node del modelo saneado comparte url`.
5. **Nombres del listado con tildes, mayúsculas o dos reglas en conflicto** ("Cajón"/"Cajon", "Techo y piso" → arriba y abajo a la vez): la regla debe disparar igual y el conflicto quedar neutral, no "cumple". → T6, `matching sin tildes ni mayúsculas` y `reglas en conflicto → neutral`.

---

## Paradas (dependencias externas)

| Parada | Qué se espera | De quién | Bloquea | No bloquea |
|---|---|---|---|---|
| **P-0** | Respuestas a Q1–Q7 | Usuario | T1 (Q4), T17–T18 (Q2) | — |
| **CM-48** | Reexportación del .dae de Olmo con el nombre corregido | Casa Mueble | T23 (cambio controlado), etiquetado real | T1–T22 (se trabaja con el .dae provisorio) |
| **CM-55** | Quién etiqueta, cuándo, desde qué dispositivo | Casa Mueble | Sesión de etiquetado (T18 paso final) | Construir la herramienta |
| **CM-49** | ¿El `__` de C01 es error? | Casa Mueble | Nada (cambia la expectativa en T23) | Todo |
| **U-esperados** | Revisión a mano de la primera corrida de Olmo | Usuario | Escribir `eval/esperados.json` y publicar (T12) | T13 |
| **U-vercel** | Crear el proyecto de Vercel de la herramienta (acción externa) | Usuario | Despliegue de T18 | Build local de T18 |
| **PROF-IA** | ¿El motor de reglas cumple como "IA obligatoria"? (§17) | Profesor | T15, T19, T20 (catálogo completo, sombra, baseline) | T1–T14 (mínimo de pre-entrega) |
| **PROF-RF** | Validar RF1–RF11; metas numéricas tras el baseline | Profesor | Fijar metas (fuera de este plan) | Todo |

Consultas que el código **no** necesita para avanzar (quedan como supuestos ya etiquetados en el spec): 2/47 (leyenda de canto), 33 (mallas sueltas), 42 (segmentos del código), 50 (tolerancia), 51 (canto en la medida), 52 (`Canto_*`), 53 (marco), 54 (espejo).

## Trazabilidad

| Criterio | Tareas | | Gate | Tareas |
|---|---|---|---|---|
| M1 | T1 | | G1 | T11 (implementación), T13 (casos) |
| M2 | T3, T4 | | G2 | T11, T12 |
| M3, M4 | T2 | | G3 | T10, T11 |
| M5 | T8, T9 | | G4 | T10, T11 |
| M6, M7 | T10 | | G5 | T20 |
| M8 | T12, T14 | | | |
| M9 | T13 (críticos), T15 (resto) | | | |
| M10 | T13 | | | |
| M11 | T17, T18 | | | |
| M12 | T16 | | | |
| M13 | T11 | | | |
| M14 | T21 | | | |
| M15 | T8, T9 | | | |
| M16 | T7 | | | |
| M17 | T19 | | | |
| M18 | T20 | | | |
| M19 | T6, T21 | | | |
| M20 | T5 | | | |

Pruebas independientes del §13 → tarea donde van **primero** (antes de la implementación): detector de canto T4; `evidence.ts` T7; normalización T2; detectabilidad T13 (combinación T15); permutaciones T10; pureza T2; jsdom T5; adapter T3–T4; herramienta T18; esquema T16; cuantización T9.

## Mapa de archivos

```
.gitattributes                         T1   *.dae binary
src/engine/hash.ts                     T1   modelId, listadoId, canonicalListado, engineRunId
src/engine/types.ts                    T2   contratos del spec §5 (Observation, AssociationRun, …)
src/engine/normalize.ts                T2   nombre → estado (§6.1)
src/engine/versions.ts                 T2   ENGINE_VERSION, FRAME_VERSION
src/model/daeIndex.ts                  T3   XML → instancias, instanceKey, líneas, XML etiquetado
src/model/observe.ts                   T4   .dae → Observation[] (única capa con three del motor)
src/model/edgeFaces.ts                 T4   detector de caras Canto_* (sale de tests/helpers)
docs/marco-referencia.md               T4   marco v1 (AS2)
eval/dom.ts, eval/run.ts               T5   DOM de jsdom + CLI (npm run eval)
src/engine/vocabulary.ts               T6   reglas, rulesFor, vocabularyCoverage
src/engine/evidence.ts                 T7   verificaciones duras y blandas por par
src/engine/associate.ts                T8–T10 pasadas 1 y 2, nivel, top-3, inconsistencias, run
src/lib/modelSources.ts                T11  furnitureId → .dae en disco y carpeta de runs
eval/cases.ts, harness.ts, gate.ts,    T11  casos reales, corrida, gate, reporte, publicación
  report.ts, publish.ts
eval/publico.json                      T11  ["olmo", "sintetico"]
eval/esperados.json, eval/runs/*.json, T12  salida revisada de la primera corrida
  eval/primera-corrida.json
eval/fixtures/muebleSintetico.ts       T13  mueble inventado (pares equivalentes, canto 0,22)
eval/perturb/{prng,operators,          T13, T15  perturbaciones y detectabilidad
  detectability}.ts, eval/metrics.ts
src/lib/publishedRuns.ts               T14  SafeLinks para el visor y la ficha (servidor)
eval/labels/{schema,concordance}.ts    T16  validador revision-asociacion/1, concordancia
eval/etiquetado/{sanear,importar}.ts   T17, T18  modelo saneado; export de la herramienta → etiquetas
tools/etiquetado/**                    T18  app estática de etiquetado
scripts/check-builds.mjs               T18  verificación de la salida de los dos builds (M11)
eval/shadow.ts                         T19  modo sombra
eval/baseline.ts, eval/baseline.json   T20  G5
eval/reportes/                         T21  reportes de entrega (lista blanca)
tests/engine/*.test.ts, tests/model/*.test.ts, tests/eval/*.test.ts, tests/fixtures/dae/*
```

Modificados: `src/model/namedColladaLoader.ts`, `colladaModel.ts`, `types.ts`, `ids.ts`, `verifyModel.ts`, `useFurnitureModel.ts` (T14); `src/lib/lookup.ts`, `src/app/p/layout.tsx`, `src/app/p/[qrId]/page.tsx`, `src/components/viewer/{ViewerPane,FurnitureModel}.tsx`, `src/components/PieceSheet.tsx` (T14); `src/data/mapping.ts` (se borra en T14); `tests/olmo.test.ts`, `tests/sabrina.test.ts` (T12); `tests/helpers/edgeFaces.ts` (se borra en T4); `package.json` (T5, T18); `.gitignore` (T5: `eval/out/`, `tools/etiquetado/out/`, `tools/etiquetado/.next/`); `CLAUDE.md` (T22).

---

# Pista A — núcleo (mínimo de la pre-entrega)

## Hito 19/10 — M1, M3, M4

### Tarea 1: Congelar entradas — `.gitattributes`, `modelId`, `listadoId`

Sin dependencia de Casa Mueble. **Requiere la respuesta a Q4.**

**Archivos:**
- Crear: `.gitattributes`, `src/engine/hash.ts`
- Test: `tests/engine/hash.test.ts`

**Interfaces:**
- Produce:
  - `modelId(bytes: Uint8Array): string` → `"sha256:<hex>"`, hash de los bytes con `\r\n` → `\n` (Q4).
  - `canonicalListado(rows: readonly ListadoRow[]): string` (§5.1).
  - `listadoId(rows: readonly ListadoRow[]): string` → `"sha256:<hex>"`.
  - `hashFileName(id: string): string` → hex sin `sha256:`.
  - `type ListadoRow = Pick<PieceType, "code" | "name" | "lengthMm" | "widthMm" | "thicknessMm" | "material" | "quantity" | "edgeBanding" | "notes">` (exportado desde `src/engine/types.ts`; en esta tarea se crea ese archivo solo con `ListadoRow`).

- [ ] **Paso 1: escribir las pruebas (fallan)**

```ts
// tests/engine/hash.test.ts
it(".gitattributes declara *.dae binary", () => {
  expect(fs.readFileSync(".gitattributes", "utf8")).toMatch(/^\*\.dae\s+binary\s*$/m);
});
it("modelId: CRLF y LF dan el mismo hash", () => {
  const lf = new TextEncoder().encode("<a>\n<b/>\n</a>\n");
  const crlf = new TextEncoder().encode("<a>\r\n<b/>\r\n</a>\r\n");
  expect(modelId(crlf)).toBe(modelId(lf));
  expect(modelId(lf)).toBe("sha256:" + createHash("sha256").update("<a>\n<b/>\n</a>\n").digest("hex"));
});
it("modelId de olmo.dae no depende de cómo git dejó el archivo en disco", () => {
  const bytes = fs.readFileSync("public/models/Olmo/olmo.dae");
  const lfOnly = Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  expect(modelId(bytes)).toBe(modelId(lfOnly));
});
it("canonicalListado: orden por code, claves fijas, null explícito, edgeBanding ordenado, NFC", () => {
  const rows = [
    { code: "B", name: "Cajón", lengthMm: 400, widthMm: 100.5, thicknessMm: 18, material: "M", quantity: 2, edgeBanding: ["largo-B", "corto-A"], notes: null },
    { code: "A", name: "X", lengthMm: 1, widthMm: 2, thicknessMm: 3, material: "M", quantity: 1, edgeBanding: null, notes: null },
  ];
  expect(canonicalListado(rows)).toBe(
    '[{"code":"A","name":"X","lengthMm":1,"widthMm":2,"thicknessMm":3,"material":"M","quantity":1,"edgeBanding":null,"notes":null},' +
    '{"code":"B","name":"Cajón","lengthMm":400,"widthMm":100.5,"thicknessMm":18,"material":"M","quantity":2,"edgeBanding":["corto-A","largo-B"],"notes":null}]');
});
it("listadoId = sha256 de la cadena canónica, calculado aparte", () => {
  // hash esperado escrito como literal: calcularlo una vez con `node -e` sobre la cadena del test anterior
  expect(listadoId(rows)).toBe("sha256:<literal calculado aparte>");
});
it("un campo ausente se serializa como null y qrId/moduleId quedan fuera", () => { /* fila con notes undefined y qrId: "x" */ });
```

- [ ] **Paso 2:** `npx vitest run tests/engine/hash.test.ts` → FAIL (`hash.ts` no existe, `.gitattributes` no existe).
- [ ] **Paso 3: implementar `src/engine/hash.ts`** con `node:crypto` (`createHash("sha256")`). Números con `String(n)`; cadenas con `.normalize("NFC")`; comparación de `code` binaria.
- [ ] **Paso 4: crear `.gitattributes`** con `*.dae binary`; correr `git add --renormalize .`; luego `git checkout -- public/models/Olmo/olmo.dae` para que el archivo en disco quede igual al índice (LF). Verificar: `git ls-files --eol public/models/Olmo/olmo.dae` → `i/-text w/-text attr/-text` (binario) y `git status` limpio salvo los archivos nuevos.
- [ ] **Paso 5:** `npx vitest run tests/engine/hash.test.ts` → PASS; `npm test` → todo en verde (A6 sigue igual).
- [ ] **Paso 6: proponer commit** (`.gitattributes` + renormalize + `hash.ts` + test en **un** commit: "Congelar entradas: .gitattributes, modelId y listadoId (M1)").

### Tarea 2: Contratos, normalización y pureza del motor

Sin dependencia de Casa Mueble.

**Archivos:**
- Crear/completar: `src/engine/types.ts`, `src/engine/normalize.ts`, `src/engine/versions.ts`
- Test: `tests/engine/normalize.test.ts`, `tests/engine/purity.test.ts`

**Interfaces:**
- Produce (`types.ts`): `Observation`, `Level`, `Evidence`, `Candidate`, `InstanceResult`, `AssociationRun` **copiados del spec §5.2–5.3**; además:
  - `type Reason = "codigo-exacto" | "nombre-anomalo" | "formato-invalido" | "codigo-inexistente" | "codigo-duplicado" | "medida-fuera-de-tolerancia" | "cupo-excedido" | "geometria-no-alineada" | "sin-componente" | "empate"`
  - `type Warning = "orientacion-no-coincide" | "posicion-no-coincide" | "canto-no-coincide"`
  - `interface Inconsistency { kind: "faltante" | "sin-confirmar" | "cupo-excedido" | "cupo-completo-sugerido" | "conflicto" | "sin-componente"; pieceCode: string | null; instanceKeys: string[]; detail: string }`
  - `type ScoreTuple = [number, number, number, number, number, number, number]` (menor = mejor, ver Decisiones)
  - `interface EngineParams { toleranceMm: number; epsilonMm: number; tupleRoundingMm: number }` y `DEFAULT_PARAMS = { epsilonMm: 1e-6, tupleRoundingMm: 0.01 }`
- Produce (`normalize.ts`):
  - `CODE = /\d{4}-\d{2}-M\d{2}-C\d{2}/` como fuente; `CANONICAL = /^_?(C)$/`, `ANOMALOUS = /^_*(C)_*$/` armadas desde `CODE`.
  - `type NameStatus = { kind: "sin-componente" } | { kind: "canonico"; code: string } | { kind: "anomalo"; code: string } | { kind: "formato-invalido" }`
  - `normalizeName(rawName: string | null): NameStatus`
- Produce (`versions.ts`): `ENGINE_VERSION = "motor/1"`, `FRAME_VERSION = "marco/1"`.

- [ ] **Paso 1: pruebas (fallan).** Tabla M4, una fila por fila de §6.1 más los subcasos de anómalo:

```ts
it.each([
  [null, { kind: "sin-componente" }],
  ["0001-01-M01-C04", { kind: "canonico", code: "0001-01-M01-C04" }],
  ["_0001-01-M01-C04", { kind: "canonico", code: "0001-01-M01-C04" }],
  ["__0001-01-M01-C04", { kind: "anomalo", code: "0001-01-M01-C04" }],    // solo inicial
  ["_0001-01-M01-C01__", { kind: "anomalo", code: "0001-01-M01-C01" }],   // solo final (C01 de Olmo)
  ["0001-01-M01-C04_", { kind: "anomalo", code: "0001-01-M01-C04" }],     // solo final, sin _ inicial
  ["___0001-01-M01-C04__", { kind: "anomalo", code: "0001-01-M01-C04" }], // ambos
  ["instance_3", { kind: "formato-invalido" }],
  ["_0001-01-M01-C4", { kind: "formato-invalido" }],
  ["x_0001-01-M01-C04", { kind: "formato-invalido" }],
  ["", { kind: "formato-invalido" }],
])("normalizeName(%j)", (raw, expected) => expect(normalizeName(raw)).toEqual(expected));
```

`codigo-inexistente` se prueba en T8 (necesita el listado). Pureza (M3, §13):

```ts
it("src/engine no importa three ni usa el DOM", () => {
  for (const file of glob("src/engine/**/*.ts")) {
    const src = fs.readFileSync(file, "utf8");
    expect(src, file).not.toMatch(/from\s+["'](three|@react-three)[^"']*["']/);
    expect(src, file).not.toMatch(/from\s+["']@\/model\//);   // el adapter es la única capa con three
    expect(src, file).not.toMatch(/\b(DOMParser|XMLSerializer|document|window)\b/);
  }
});
```

(`glob`: `fs.readdirSync(dir, { recursive: true })` filtrado; sin dependencias.)
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3:** implementar `types.ts`, `normalize.ts`, `versions.ts`.
- [ ] **Paso 4:** correr → PASS; `npm run typecheck`.
- [ ] **Paso 5: proponer commit** ("Motor: contratos y normalización de nombres (M3, M4)").

## Hito 26/10 — M2, M20

### Tarea 3: Índice del XML del .dae (`daeIndex.ts`)

Sin dependencia de Casa Mueble (el .dae reexportado se vuelve a contar en T23).

**Archivos:**
- Crear: `src/model/daeIndex.ts`, `tests/fixtures/dae/minimo.dae` (escrito a mano: 2 paneles, 1 componente con 2 instancias, unidad pulgada), `tests/helpers/daeBuilder.ts`
- Test: `tests/model/daeIndex.test.ts`

**Interfaces:**
- Consume: nada del motor.
- Produce:
  - `KEY_PREFIX = "@key:"`
  - `interface DaeEntry { instanceKey: string; nodeId: string; rawName: string | null; kind: "componente" | "malla-suelta" }`
  - `interface DaeIndex { entries: DaeEntry[]; lineObjects: number; unitMeters: number; taggedXml: string }`
  - `indexDae(xml: string): DaeIndex` (usa el `DOMParser` global; no importa three)
  - `class DaeStructureError extends Error { constructor(readonly nodeId: string, message: string) }`
  - `instanceKey` = `id` de los nodos desde la raíz de `visual_scene` hasta el nodo de la instancia, unidos con `/`, saltando nodos sin `id` (ej. `ID4/ID5/ID6`).
- `daeBuilder.ts` (solo pruebas, no comparte código con el adapter): `buildDae(spec: { unit?: { meter: number; name: string }; panels: { name: string | null; sizeMm: [number, number, number]; atMm: [number, number, number]; rotZ90?: boolean; mirrorX?: boolean; cantoFaces?: ("x-" | "x+" | "y-" | "y+")[]; sharedComponent?: string }[]; lineObjects?: number; nodeWithTwoInstances?: boolean; nestedComponent?: boolean; oddCantoTriangles?: boolean }): string`.

- [ ] **Paso 1: pruebas (fallan).**

```ts
it("minimo.dae: 2 entradas de componente, instanceKey único con la ruta de ids", () => {
  const idx = indexDae(read("tests/fixtures/dae/minimo.dae"));
  expect(idx.entries.map((e) => e.kind)).toEqual(["componente", "componente"]);
  expect(new Set(idx.entries.map((e) => e.instanceKey)).size).toBe(2);
  expect(idx.entries[0].instanceKey).toMatch(/^ID\d+(\/ID\d+)*$/);
});
it("el nombre de formato inválido llega crudo como rawName", () => {
  const idx = indexDae(buildDae({ panels: [{ name: "pieza rara", sizeMm: [500, 300, 18], atMm: [0, 0, 0] }] }));
  expect(idx.entries[0]).toMatchObject({ kind: "componente", rawName: "pieza rara" });
});
it("malla suelta: rawName null", () => { /* panel con name: null → kind "malla-suelta" */ });
it("una geometría solo de líneas cuenta como línea, no como malla suelta", () => {
  const idx = indexDae(buildDae({ panels: [], lineObjects: 3 }));
  expect(idx.entries).toEqual([]);
  expect(idx.lineObjects).toBe(3);
});
it("nodo con dos instance_node → DaeStructureError con el id del nodo", () => {
  expect(() => indexDae(buildDae({ panels: [], nodeWithTwoInstances: true }))).toThrowError(DaeStructureError);
});
it("componente anidado → DaeStructureError", () => { /* nestedComponent: true */ });
it("taggedXml: cada nodo-instancia lleva name = @key:<instanceKey>", () => { /* DOMParser sobre taggedXml */ });
it("unitMeters lee <unit meter>", () => { /* 0.0254 en minimo.dae, 0.01 con unit cm */ });
it("olmo.dae: 33 componentes + 6 mallas sueltas + 0 líneas, instanceKey únicos", () => {
  const idx = indexDae(read("public/models/Olmo/olmo.dae"));
  expect(idx.entries.filter((e) => e.kind === "componente")).toHaveLength(33);
  expect(idx.entries.filter((e) => e.kind === "malla-suelta")).toHaveLength(6);
  expect(idx.lineObjects).toBe(0);
  expect(new Set(idx.entries.map((e) => e.instanceKey)).size).toBe(39);
  expect(idx.entries.filter((e) => e.rawName === "_0001-01-M01-C01__")).toHaveLength(1);
});
```

(33 + 6 + 0 son conteos del .dae ya verificados por A6, no la estimación de niveles.)
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3:** implementar `indexDae` según "Decisiones del plan" (instancia, malla suelta, líneas, fallar fuerte).
- [ ] **Paso 4:** correr → PASS.
- [ ] **Paso 5: proponer commit** ("Adapter: índice del XML del .dae con instanceKey (M2, parte)").

### Tarea 4: Adapter `observe.ts`, detector de canto y marco v1

Sin dependencia de Casa Mueble (el marco es AS2, consulta 53, no bloquea).

**Archivos:**
- Crear: `src/model/observe.ts`, `src/model/edgeFaces.ts` (movido desde `tests/helpers/edgeFaces.ts`), `docs/marco-referencia.md`
- Modificar: `tests/sabrina.test.ts` (importa `collectEdgeFaces` desde `@/model/edgeFaces`); borrar `tests/helpers/edgeFaces.ts`
- Test: `tests/model/observe.test.ts`, `tests/model/edgeFaces.test.ts`

**Interfaces:**
- Consume: `indexDae`, `KEY_PREFIX`, `DaeStructureError` (T3); `modelId` (T1); `Observation`, `FRAME_VERSION` (T2).
- Produce:
  - `interface DaeObservation { modelId: string; observations: Observation[]; lineObjects: number; referenceBoxMm: { min: [number, number, number]; max: [number, number, number] } }`
  - `observeDae(bytes: Uint8Array): DaeObservation` — `ColladaLoader` sobre `taggedXml`, con `skipTextures`; agrupa mallas por ancestro `@key:`; **lee grupos de material antes de cualquier merge** (no usa `buildFurnitureModel`).
  - `class OddEdgeTrianglesError extends Error { constructor(readonly instanceKey: string, count: number) }`
  - `edgeRunsOf(mesh: Mesh): number[]` en `edgeFaces.ts` (largo en mm de cada triángulo `Canto_*`); el agrupado de a pares y el error impar viven en `observe.ts`.
  - Campos: `sizeMm` caja en mm ordenada ascendente; `axisAligned` = todas las normales con una componente |n| ≥ 1 − 1e-6; `orientation` por el eje del espesor en el marco (Y → `horizontal`, X → `vertical-lateral`, Z → `vertical-frontal`); `centerRel` relativo a `referenceBoxMm`; `crossesMidplane[i]` = la caja contiene el plano medio de la caja de referencia en el eje i; `edgeRunsMm` = `"no-disponible"` si la instancia no tiene caras `Canto_*`; `mirrored` = determinante de `matrixWorld` < 0.

- [ ] **Paso 1: pruebas del detector (§13, contadas a mano, fallan).**

```ts
it("panel 500x300 con canto en los dos lados largos → [500, 500]", () => {
  const obs = observeDae(enc(buildDae({ panels: [{ name: "_0001-01-M01-C01", sizeMm: [500, 300, 18], atMm: [0, 0, 0], cantoFaces: ["y-", "y+"] }] })));
  expect(obs.observations[0].edgeRunsMm).toEqual([500, 500].map((v) => expect.closeTo(v, 3)));
});
it("largo < ancho (300 de largo, 500 de ancho): devuelve largos crudos, sin clasificar", () => { /* edgeRunsMm [300] */ });
it("largo ≈ ancho (400 x 401): dos caras con largos 400 y 401", () => {});
it("sin caras Canto_* → 'no-disponible'", () => {});
it("cantidad impar de triángulos de canto → OddEdgeTrianglesError con instanceKey", () => {});
```

- [ ] **Paso 2: pruebas del adapter (fallan).**

```ts
it("unidad: el mismo panel en pulgadas y en cm da el mismo sizeMm", () => {
  const inch = observeDae(enc(buildDae({ unit: { meter: 0.0254, name: "inch" }, panels: [p] })));
  const cm = observeDae(enc(buildDae({ unit: { meter: 0.01, name: "centimeter" }, panels: [p] })));
  // p.sizeMm está en mm; el builder lo escribe en la unidad pedida
  expect(cm.observations[0].sizeMm).toEqual(inch.observations[0].sizeMm.map((v) => expect.closeTo(v, 3)));
  expect(inch.observations[0].sizeMm).toEqual([18, 300, 500].map((v) => expect.closeTo(v, 3)));
});
it("orientación por eje del espesor; panel girado 90° en Z sigue alineado", () => {});
it("transformada espejada → mirrored true", () => {});
it("centerRel y crossesMidplane respecto de la caja de referencia", () => {
  // dos paneles: uno a la izquierda, otro que cruza el medio en X → centerRel[0] < 0.5 y crossesMidplane [false,…] / [true,…]
});
it("olmo.dae: 39 observaciones, 6 con rawName null, ninguna con Canto_, todas alineadas, ninguna espejada", () => {
  const obs = observeDae(fs.readFileSync("public/models/Olmo/olmo.dae"));
  expect(obs.observations).toHaveLength(39);
  expect(obs.observations.filter((o) => o.rawName === null)).toHaveLength(6);
  expect(obs.observations.every((o) => o.edgeRunsMm === "no-disponible" && o.axisAligned && !o.mirrored)).toBe(true);
  expect(obs.lineObjects).toBe(0);
});
it("marco v1: las tapas de cajón de Olmo (C12, C13) están en la mitad del frente", () => {
  const tapas = obs.observations.filter((o) => /-C1[23]$/.test(o.rawName ?? ""));
  expect(tapas.every((o) => o.centerRel[2] > 0.5 && o.orientation === "vertical-frontal")).toBe(true);
});
```

Si la prueba del marco falla, **parar y avisar**: el frente no es +Z y hay que redefinir el marco v1 antes de seguir (no invertir el eje en silencio).
- [ ] **Paso 3:** correr → FAIL.
- [ ] **Paso 4:** implementar `edgeFaces.ts` (mover el cálculo por triángulo de `tests/helpers/edgeFaces.ts`) y `observe.ts`. Reescribir `collectEdgeFaces` de `tests/sabrina.test.ts` para usar `edgeRunsOf`, o pasar A8 a `observeDae` (A8 cuenta por instancia: misma información).
- [ ] **Paso 5:** escribir `docs/marco-referencia.md`: ejes, sentido, por qué +Z es frente (cámara inicial del visor), la verificación con C12/C13, "ASUMIDO (AS2), consulta 53", `FRAME_VERSION`.
- [ ] **Paso 6:** `npm test` → PASS (incluida `sabrina.test.ts` si `Sabrina/` está presente: A8 sigue igual).
- [ ] **Paso 7: proponer commit** ("Adapter: Observation desde el .dae, detector de canto y marco v1 (M2)").

### Tarea 5: Runner del eval (`npm run eval`) y DOM desde jsdom

**Archivos:**
- Crear: `eval/dom.ts`, `eval/run.ts` (esqueleto), `eval/alias-check.ts`
- Modificar: `package.json` (`"eval": "vite-node --config vitest.config.ts eval/run.ts --"`), `.gitignore` (`/eval/out/`)
- Test: `tests/eval/runner.test.ts`

**Interfaces:**
- Produce: `installDom(): { jsdomVersion: string }` — crea **un** `JSDOM` y asigna a `globalThis` `DOMParser`, `XMLSerializer` y `document` (lo que `ColladaLoader` + `ImageLoader` necesitan con `skipTextures`). Si al correr hace falta otro global, se agrega solo acá y se anota.
- `eval/run.ts`: llama a `installDom()`, imprime `jsdom <versión>`, sale con 0. (Se completa en T11.)

- [ ] **Paso 1: pruebas (fallan).**

```ts
it("M20: el eval y vitest resuelven el mismo jsdom", () => {
  const fromVitest = createRequire(require.resolve("vitest/package.json"))("jsdom/package.json").version;
  const fromEval = createRequire(path.resolve("eval/dom.ts"))("jsdom/package.json").version;
  expect(fromEval).toBe(fromVitest);
  expect(fromEval).toBe("24.1.3");
});
it("M20: npm run eval resuelve el alias @/ y corre observeDae en Node sin el entorno de vitest", () => {
  const r = spawnSync("npx", ["vite-node", "--config", "vitest.config.ts", "eval/alias-check.ts"], { shell: true, encoding: "utf8" });
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("observaciones: 39");
}, 60_000);
it("package.json no suma dependencias", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  expect(Object.keys(pkg.dependencies).sort()).toEqual(["@react-three/drei", "@react-three/fiber", "jsqr", "next", "qrcode", "react", "react-dom", "three", "zustand"]);
  expect(Object.keys(pkg.devDependencies)).not.toContain("vite-node"); // ya viene con vitest
});
```

`eval/alias-check.ts`: `installDom()`, importa `observeDae` por `@/model/observe`, imprime `observaciones: <n>` para Olmo.
- [ ] **Paso 2:** correr → FAIL. Comprobar también que sin `installDom()` falla con `DOMParser is not defined` (deja el motivo escrito en el comentario de `dom.ts`).
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** `npx vitest run tests/eval/runner.test.ts` → PASS; `npm run eval` → imprime `jsdom 24.1.3`, código 0.
- [ ] **Paso 5: proponer commit** ("Eval: runner con vite-node y DOM de jsdom (M20)").

## Hito 2/11 — M5–M7, M15, M16

### Tarea 6: Vocabulario

AS3. Sin dependencia de Casa Mueble.

**Archivos:** Crear `src/engine/vocabulary.ts`. Test `tests/engine/vocabulary.test.ts`.

**Interfaces:**
- Produce:
  - `interface VocabRule { id: string; words: string[]; orientation?: Observation["orientation"]; half?: { axis: 0 | 1 | 2; side: "low" | "high" } }`
  - `VOCABULARY_VERSION = "vocab/1"`, `VOCABULARY: readonly VocabRule[]`, `VOCABULARY_SOURCES = ["olmo", "segundo modelo local"]` (registro de qué listados se usaron, §7; sin nombres de piezas de Sabrina en el archivo, solo palabras genéricas).
  - `rulesFor(name: string, vocab?: readonly VocabRule[]): VocabRule[]` — palabra completa, sin mayúsculas ni tildes (`normalize("NFD")` + quitar marcas).
  - `vocabularyCoverage(rows: readonly ListadoRow[], vocab?: readonly VocabRule[]): { byRule: { id: string; fired: number; total: number }[]; withoutRule: string[] }`
- Reglas iniciales (palabras del §7; el ejecutor completa la tabla con los nombres del listado de Olmo y el del modelo local, sin copiar nombres de Sabrina al repo): `piso` (horizontal, y low), `techo` (horizontal, y high), `mesa` (horizontal), `estante` (horizontal), `lateral`/`laterales` (vertical-lateral), `tapa`/`frente` (vertical-frontal, z high), `fondo` (vertical-frontal, z low), `zocalo` (y low), `faja` (sin expectativa propia), `adelante` (z high), `atras` (z low), `arriba` (y high), `abajo` (y low).

- [ ] **Paso 1: pruebas (fallan), incluidas las del foco de revisión 5 y la tabla M19 escrita a mano.**

```ts
it("matching sin tildes ni mayúsculas, palabra completa", () => {
  expect(rulesFor("Cajón FONDO").map((r) => r.id)).toContain("fondo");
  expect(rulesFor("Fondos")).toEqual([]);           // palabra completa
});
it("M19: cobertura por regla sobre una tabla escrita a mano", () => {
  const vocab: VocabRule[] = [{ id: "piso", words: ["piso"] }, { id: "techo", words: ["techo"] }, { id: "nunca", words: ["xyz"] }];
  const rows = [row("A", "Piso"), row("B", "Techo y piso"), row("C", "Faja")];
  expect(vocabularyCoverage(rows, vocab)).toEqual({
    byRule: [{ id: "piso", fired: 2, total: 3 }, { id: "techo", fired: 1, total: 3 }, { id: "nunca", fired: 0, total: 3 }],
    withoutRule: ["C"],
  });
});
```

("reglas en conflicto → neutral" se prueba en T7, donde se evalúa la evidencia.)
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** congelar: comentario en `vocabulary.ts` con fecha, `VOCABULARY_VERSION` y listados usados. **Debe quedar congelado antes de T13** (§7).
- [ ] **Paso 6: proponer commit** ("Motor: vocabulario v1 congelado (M19, parte)").

### Tarea 7: `evidence.ts`

**Archivos:** Crear `src/engine/evidence.ts`. Test `tests/engine/evidence.test.ts`.

**Interfaces:**
- Consume: `Observation`, `ListadoRow`, `Evidence`, `EngineParams` (T2); `rulesFor`, `VocabRule` (T6).
- Produce:
  - `checkDims(obs: Observation, type: ListadoRow, p: EngineParams): { ok: boolean; deviationMm: number; evidence: Evidence[] }` — compara `obs.sizeMm` con `[thickness, width, length]` ordenados; cumple si `|Δ| ≤ tol + ε` en los tres; `deviationMm` = suma de |Δ|; evidencia `espesor` (eje menor) y `medidas` (los otros dos). Con `axisAligned: false` devuelve `ok: false` y evidencia `no-disponible`.
  - `orientationEvidence(obs, type, vocab?): Evidence` — reglas que disparan; si dos reglas esperan orientaciones distintas → `neutral`; sin reglas → `neutral`.
  - `positionEvidence(obs, type, vocab?): Evidence` — por cada regla con `half`; cruza el plano medio → `neutral`; reglas en conflicto en el mismo eje → `neutral`; alguna mitad no coincide → `no-cumple`.
  - `edgeEvidence(obs, type, p): Evidence` (§8.1) — `no-disponible` si `edgeRunsMm` es `"no-disponible"`; `neutral` si `edgeBanding === null` o `|lengthMm − widthMm| ≤ tol`; si no, clasifica cada cara (largo si ≈ `lengthMm`, corto si ≈ `widthMm`, ambos con `tol`) y compara con la cantidad de `largo-*` y `corto-*` del canteado.
  - `mirrorEvidence(obs): Evidence` — siempre `neutral`, `kind: "espejo"`.
  - `rank(result: Evidence["result"]): 0 | 1 | 2` — `cumple` 0, `neutral`/`no-disponible` 1, `no-cumple` 2.

- [ ] **Paso 1: tablas del §13 (fallan).**

```ts
const type = row("T", "Lateral", { lengthMm: 500, widthMm: 300, thicknessMm: 18 });
const p = { toleranceMm: 2, epsilonMm: 1e-6, tupleRoundingMm: 0.01 };
it.each([[0.95, true], [1.0, true], [1.05, false]])("largo = listado + k·tol, k=%s → ok %s", (k, ok) => {
  expect(checkDims(obsSize([18, 300, 500 + k * 2]), type, p).ok).toBe(ok);
});
it.each([[0.95, true], [1.0, true], [1.05, false]])("largo = listado − k·tol, k=%s → ok %s", (k, ok) => {});
it("espesor fuera (21 mm) → no cumple, evidencia espesor no-cumple", () => {});
it("geometría no alineada → no se mide", () => {});
it("orientación: Lateral vertical-lateral cumple; horizontal no-cumple; nombre sin regla neutral", () => {});
it("posición: 'Fondo' con centerRel z 0.2 cumple, 0.8 no-cumple, cruzando el medio en z neutral", () => {});
it("reglas en conflicto → neutral ('Techo y piso')", () => {});
it.each([
  ["cumple", { edgeRunsMm: [500, 300], banding: ["largo-A", "corto-A"] }, "cumple"],
  ["no cumple", { edgeRunsMm: [500, 500], banding: ["largo-A", "corto-A"] }, "no-cumple"],
  ["neutral por largo≈ancho", { size: [18, 400, 401], edgeRunsMm: [401], banding: ["largo-A"] }, "neutral"],
  ["neutral por edgeBanding null", { edgeRunsMm: [500], banding: null }, "neutral"],
  ["no disponible", { edgeRunsMm: "no-disponible", banding: ["largo-A"] }, "no-disponible"],
  ["largo < ancho del listado", { listado: { lengthMm: 150, widthMm: 900 }, edgeRunsMm: [150], banding: ["largo-A"] }, "cumple"],
])("canto: %s", (_, c, expected) => {});
it("espejo: siempre neutral", () => {});
```

- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5: proponer commit** ("Motor: evidencia dura y blanda (M16)").

### Tarea 8: `associate.ts` — pasada 1 e inconsistencias de cupo

**Archivos:** Crear `src/engine/associate.ts`. Test `tests/engine/associate.pass1.test.ts`, `tests/helpers/engineFixtures.ts` (`obs(...)`, `row(...)` para armar casos a mano).

**Interfaces:**
- Consume: T2, T6, T7.
- Produce: `associate(input: AssociateInput): AssociationRun` con `interface AssociateInput { furnitureId: string; modelId: string; observations: readonly Observation[]; listado: readonly ListadoRow[]; params: EngineParams; vocabulary?: readonly VocabRule[] }`. En esta tarea la pasada 2 queda como "dudosa con `candidates: []`" (se completa en T9).

Reglas (spec §6.1–6.2, copiar el orden de razones): sin componente → `sin-asociar` + inconsistencia `sin-componente`; formato inválido / inexistente → `dudosa`; duplicado en listado → `dudosa` `codigo-duplicado` y ese código fuera de `faltante`/`sin-confirmar`; medidas → `medida-fuera-de-tolerancia`; no alineada → `geometria-no-alineada`; reclamantes > quantity → **todos** `cupo-excedido` + inconsistencia; reclamantes < quantity → `faltante`; anómalo → techo `dudosa`; segura = canónico + medidas + cupo; seguras < reclamantes → `sin-confirmar`; segura con advertencias blandas, `candidates: []`, `reasons: ["codigo-exacto"]`.

- [ ] **Paso 1: tabla M5 (parte pasada 1) + M15 (fallan).**

```ts
it.each([
  ["canónico, medidas ok, cupo ok → segura", [obs("_C01", [18, 300, 500])], [row("C01", 1)], { level: "segura", reasons: ["codigo-exacto"] }],
  ["anómalo → dudosa (piso)", [obs("_C01__", ...)], [row("C01", 1)], { level: "dudosa", reasons: ["nombre-anomalo"] }],
  ["anómalo e inexistente → dos razones en orden", [obs("_C09__", ...)], [row("C01", 1)], { level: "dudosa", reasons: ["nombre-anomalo", "codigo-inexistente"] }],
  ["formato inválido → dudosa", [obs("panel", ...)], [row("C01", 1)], { level: "dudosa", reasons: ["formato-invalido"] }],
  ["medidas fuera → dudosa", ...],
  ["no alineada → dudosa geometria-no-alineada", ...],
  ["sin componente → sin-asociar", [obs(null, ...)], [], { level: "sin-asociar", reasons: ["sin-componente"] }],
])("%s", (_, observations, listado, expected) => {
  expect(associate(input(observations, listado)).results[0]).toMatchObject(expected);
});
// M15: un caso por inconsistencia de cupo
it("cupo-excedido: 3 reclamantes con quantity 2 → las 3 dudosas + inconsistencia", () => {});
it("faltante: 1 reclamante con quantity 2", () => {});
it("sin-confirmar: 2 reclamantes, uno fuera de medida", () => {});
it("sin-componente: inconsistencia por malla suelta", () => {});
it("código duplicado en el listado: dudosa codigo-duplicado y sin faltante ni sin-confirmar para ese código", () => {});
it("segura con orientación que no coincide → sigue segura con advertencia", () => {});
```

(Los nombres `"_C01"` son abreviaturas del helper `obs`, que arma el código completo `0001-01-M01-C01`.)
- [ ] **Paso 2–4:** FAIL → implementar pasada 1 → PASS.
- [ ] **Paso 5: proponer commit** ("Motor: pasada 1 y verificación dura (M5, M15)").

### Tarea 9: `associate.ts` — pasada 2 (ranking, top-3, empate, conflicto)

**Archivos:** Modificar `src/engine/associate.ts`. Test `tests/engine/associate.pass2.test.ts`.

**Interfaces:**
- Produce (exportado para pruebas): `scoreTuple(obs, type, ctx: { nameCode: string | null; remaining: number; params: EngineParams; vocab }): ScoreTuple` y `compareTuples(a, b): number`.
- Reglas (spec §6.3): r(T) fijo tras la pasada 1; entran los tipos que cumplen e1 + el tipo del código (válido y existente) siempre; e7 = `Math.round(desvío / tupleRoundingMm)` (entero: cantidad de pasos de `tupleRoundingMm`, así no se comparan flotantes); orden por tupla y luego por código binario; top-3; tipo del código con nota `"tipo del código; medidas no coinciden"` y forzado dentro del top-3; `cupoCompleto: true` + `cupo-completo-sugerido`; top-1 == top-2 → razón `empate`; `conflicto` por T cuando las dudosas con T en su conjunto top-1 superan r(T) (una dudosa empatada cuenta para cada empatado).

- [ ] **Paso 1: pruebas (fallan).**

```ts
it("cuantización (§13): dos tipos que difieren solo por ruido de pulgadas→mm empatan", () => {
  // dos tipos con medidas 500 x 300 x 18 y 500.0000001 x 300 x 18 (distinto código); instancia sin código
  // desvíos 4e-7 y 3e-7 mm: con tupleRoundingMm 0,01 los dos redondean a 0 → empate
  const run = associate(input([obs("panel", [18, 300, 500.0000004])], [row("C01", 1, dims), row("C02", 1, dimsNoise)]));
  expect(run.results[0].reasons).toContain("empate");
  expect(run.results[0].candidates.map((c) => c.pieceCode)).toEqual([code("C01"), code("C02")]);
});
it("sin cuantizar no empataría (tupleRoundingMm muy chico)", () => {
  // mismo caso con params.tupleRoundingMm = 1e-12 → sin "empate"
});
it("tipo del código siempre en el top-3, aunque no cumpla medidas, con su nota", () => {});
it("cupo completo baja pero sigue en el top-3, con cupoCompleto y cupo-completo-sugerido", () => {});
it("top-3 vacío: sin código existente y ningún tipo cumple medidas → candidates []", () => {});
it("el primer elemento distinto decide (orientación gana sobre posición)", () => {});
it("conflicto: 3 dudosas con top-1 = T y r(T) = 2", () => {});
it("dudosa empatada cuenta en el conflicto de cada empatado", () => {});
it("sin-asociar solo por sin-componente: nada más produce sin-asociar", () => {});
```

- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5: proponer commit** ("Motor: pasada 2, top-3, empates y conflictos (M5, M15)").

### Tarea 10: `AssociationRun` completo, determinismo y permutaciones

**Archivos:** Modificar `src/engine/associate.ts`, `src/engine/hash.ts` (`engineRunId`). Test `tests/engine/run.test.ts`.

**Interfaces:**
- Produce: `engineRunId(x: { modelId: string; listadoId: string; versions: AssociationRun["versions"]; params: EngineParams }): string` (sha256 del JSON con claves en orden fijo). `associate` llena `listadoId`, `engineRunId`, `versions` (`ENGINE_VERSION`, `VOCABULARY_VERSION`, `FRAME_VERSION`), `params`, `typeSummary` (ordenado por código), `inconsistencies` (ordenadas por `kind`, `pieceCode`, `instanceKeys`) y `results` ordenados por `instanceKey` binario.

- [ ] **Paso 1: pruebas (fallan).**

```ts
it("G3/M7: misma entrada → JSON idéntico byte a byte, sin fechas", () => {
  const a = JSON.stringify(associate(fixture)); const b = JSON.stringify(associate(fixture));
  expect(a).toBe(b);
  expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
});
it("G4/M6: invariante ante permutaciones de instancias y de filas del listado (20 permutaciones con semilla fija)", () => {
  const base = JSON.stringify(associate(fixture));
  for (const perm of permutations(fixture, 20, seed)) expect(JSON.stringify(associate(perm))).toBe(base);
});
it("engineRunId cambia si cambia un parámetro o una versión", () => {});
it("results ordenados por instanceKey con comparación binaria ('ID10' < 'ID9')", () => {});
```

`fixture`: mezcla de segura, anómala, inexistente, empate, cupo excedido y malla suelta (de `engineFixtures.ts`). `permutations` usa el PRNG de T13 si ya existe; si no, un LCG local de 5 líneas en el helper de pruebas.
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5: proponer commit** ("Motor: AssociationRun determinista e invariante (M6, M7)").

## Hito 9/11 — M8, M10, M13

### Tarea 11: Harness — casos reales, gate, reporte, publicación

**Parada P-0 resuelta (Q5).** Sin dependencia de Casa Mueble.

**Archivos:**
- Crear: `src/lib/modelSources.ts`, `eval/cases.ts`, `eval/harness.ts`, `eval/gate.ts`, `eval/report.ts`, `eval/publish.ts`, `eval/publico.json` (`["olmo", "sintetico"]`)
- Modificar: `eval/run.ts`
- Test: `tests/eval/gate.test.ts`, `tests/eval/m13.test.ts`

**Interfaces:**
- `modelSources.ts` (servidor/Node, usa `node:fs`): `modelSourceFor(furnitureId: string, opts?: { sabrinaDir?: string }): { daePath: string; runsDir: string; esperadosPath: string } | null` — Olmo: `public/models/Olmo/olmo.dae`, `eval/runs`, `eval/esperados.json`; Sabrina: el único `.dae` de `<sabrinaDir>/Archivo Collada`, `<sabrinaDir>/eval/runs`, `<sabrinaDir>/eval/esperados.json`, o `null` si la carpeta no existe.
- `cases.ts`: `loadRealCases(opts: { sabrinaDir: string }): RealCase[]` con `type RealCase = { furnitureId: string; status: "ok"; def: FurnitureDef; dae: DaeObservation; run: AssociationRun } | { furnitureId: string; status: "no-ejecutado"; motivo: string }`. Sabrina se carga con el mismo `import()` dinámico que `tests/sabrina.test.ts`.
- En `gate.ts`: `projectRun(run: AssociationRun): ExpectedRun` (ver "Proyección para G2"), `type EsperadosFile = Record<string /* modelId */, ExpectedRun>` y `readEsperados(file: string): EsperadosFile` (`{}` si no existe).
- `report.ts`: `buildReport(x: { real: RealCase[]; synthetic: VariantOutcome[]; gate: GateResult; timing: { medianMs: number; repeticiones: number; node: string; maquina: string } }): Report` y `writeReport(report: Report, outDir: string): void` (`reporte.json` + `reporte.md`). Tiempo (§9.5): `harness` corre el motor M = 5 veces por caso real y guarda la mediana; anota `process.version` y `os.cpus()[0].model`; no gatea. La versión de Node también va junto a G3.
- `gate.ts`: `evaluateGate(x: { real: RealCase[]; esperados: (furnitureId: string) => EsperadosFile | null; synthetic: VariantOutcome[]; determinism: { a: string; b: string }; permutations: { ok: boolean; detail: string } }): GateResult` con `GateResult = { passed: boolean; checks: { id: "G1" | "G2" | "G3" | "G4" | "G5"; status: "ok" | "falla" | "no-ejecutado"; detail: string }[] }`. G5 queda `"no-ejecutado"` hasta T20. `VariantOutcome` se define en T13; en esta tarea `synthetic: []`.
- `publish.ts`: `publishRun(run: AssociationRun, runsDir: string, publico: string[]): string` (rechaza `furnitureId` fuera de la lista; escribe `<runsDir>/<hash>.json` con `JSON.stringify(run, null, 2) + "\n"`); `recordFirstRun(file: string, modelId: string, date: string): void` (no sobrescribe una entrada existente).
- `run.ts` CLI: `--sabrina-dir <ruta>` (por defecto `Sabrina`), `--out <dir>` (por defecto `eval/out`), `--seed <n>` (por defecto 1), `--publicar`, `--escribir-esperados`. Escribe `reporte.json` y `reporte.md`; imprime el gate; `process.exit(gate.passed ? 0 : 1)`. `--escribir-esperados` escribe la proyección y **no** aprueba el gate en esa corrida (obliga a revisar y volver a correr).

- [ ] **Paso 1: pruebas (fallan).**

```ts
it("G2: un caso real presente distinto de esperados → falla", () => {});
it("G2: modelo del repo con modelId que no está en esperados → falla con 'hash distinto'", () => {});
it("G2: Sabrina ausente → 'no-ejecutado' y el gate aprueba igual", () => {});
it("G2: Sabrina presente sin esperados → falla", () => {});
it("G2: run publicado con engineRunId distinto del actual → falla 'publicación desactualizada'", () => {});
it("G3 y G4 se calculan dentro del harness (dos corridas, permutaciones)", () => {});
it("publishRun rechaza un furnitureId fuera de eval/publico.json", () => {});
it("recordFirstRun no sobrescribe una fecha ya escrita", () => {});
// M13
it("M13: npm run eval con --sabrina-dir inexistente sale con 0 y el reporte dice 'no ejecutado'", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "eval-"));
  const r = spawnSync("npm", ["run", "eval", "--", "--sabrina-dir", path.join(out, "no-existe"), "--out", out], { shell: true, encoding: "utf8" });
  expect(r.status).toBe(0);
  expect(fs.readFileSync(path.join(out, "reporte.md"), "utf8")).toMatch(/sabrina.*no ejecutado/i);
}, 120_000);
```

La prueba M13 necesita `eval/esperados.json` de Olmo: queda `it.todo` hasta T12 y se activa ahí.
- [ ] **Paso 2–4:** FAIL → implementar → PASS (salvo el `todo`).
- [ ] **Paso 5:** `npm run eval` → hoy G2 falla para Olmo ("falta esperados"): esperado hasta T12.
- [ ] **Paso 6: proponer commit** ("Eval: casos reales, gate G1–G4, reporte y publicación").

### Tarea 12: Primera corrida de Olmo → `esperados.json`, run publicado, A4

**Parada U-esperados.** Sin dependencia de Casa Mueble (el .dae es el provisorio).

**Archivos:**
- Crear: `eval/esperados.json`, `eval/runs/<hash>.json`, `eval/primera-corrida.json`
- Modificar: `tests/olmo.test.ts`, `tests/sabrina.test.ts` (A4 reescrito), `tests/eval/m13.test.ts` (activar)

- [ ] **Paso 1:** `npm run eval -- --escribir-esperados`. Mostrar al usuario un resumen de la proyección: conteo por nivel, por razón, la lista de dudosas y sin asociar con su `instanceKey`, nombre crudo y razones, y los candidatos. Comparar con la **estimación** (32 + 1 + 6): toda diferencia se explica antes de seguir, no se ajusta el motor para que coincida.
- [ ] **Paso 2: PARAR** hasta que el usuario apruebe la proyección revisada a mano. Si Sabrina está presente, hacer lo mismo en local con `Sabrina/eval/esperados.json` (nada de eso al repo) y anotar en `Sabrina/docs/anexo-motor.md` los conteos de la corrida.
- [ ] **Paso 3: reescribir A4** (spec §11): en `tests/olmo.test.ts`, "cada instancia recibe exactamente un nivel y el resultado es igual a `eval/esperados.json`":

```ts
it("A4: cada instancia con exactamente un nivel, igual a eval/esperados.json", () => {
  const dae = observeDae(fs.readFileSync("public/models/Olmo/olmo.dae"));
  const run = associate({ furnitureId: "olmo", modelId: dae.modelId, observations: dae.observations, listado: olmoDef.pieceTypes, params: { ...DEFAULT_PARAMS, toleranceMm: olmoDef.toleranceMm } });
  expect(new Set(run.results.map((r) => r.instanceKey)).size).toBe(dae.observations.length);
  expect(projectRun(run)).toEqual(readEsperados("eval/esperados.json")[dae.modelId]);
});
it("la C01 anómala queda dudosa por nombre-anomalo (efecto esperado, §6.1)", () => {
  const c01 = run.results.find((r) => dae.observations.find((o) => o.instanceKey === r.instanceKey)?.rawName === "_0001-01-M01-C01__");
  expect(c01).toMatchObject({ level: "dudosa", pieceCode: null });
  expect(c01?.reasons[0]).toBe("nombre-anomalo");
});
```

Quitar el `it` que usa `checkAssociation` (se borra `mapping.ts` en T14). En `tests/sabrina.test.ts`, A4 igual contra `Sabrina/eval/esperados.json`, salteado si falta. Mantener A6 de `verifyModel` (21 tipos, 33 instancias, 1 anomalía, 6 + 0 excluidos) sin cambios.
- [ ] **Paso 4:** `npm run eval -- --publicar` → gate aprobado; escribe `eval/runs/<hash>.json` y `eval/primera-corrida.json`. Activar M13.
- [ ] **Paso 5:** `npm test` → PASS; `npm run eval` → código 0.
- [ ] **Paso 6: proponer commit** con esperados, run publicado, primera corrida y tests en el mismo commit ("Eval: esperados de Olmo (provisorio) y AssociationRun publicado (M8)").

### Tarea 13: Perturbaciones críticas (P1, P3–P8, P10–P12), detectabilidad, métricas, G1

**Archivos:**
- Crear: `eval/perturb/prng.ts`, `eval/perturb/operators.ts`, `eval/perturb/detectability.ts`, `eval/metrics.ts`, `eval/fixtures/muebleSintetico.ts`
- Modificar: `eval/harness.ts`, `eval/report.ts`, `eval/gate.ts`
- Test: `tests/eval/detectability.test.ts`, `tests/eval/operators.test.ts`, `tests/eval/metrics.test.ts`

**Interfaces:**
- `prng.ts`: `mulberry32(seed: number): () => number`; `shuffle<T>(xs: readonly T[], rnd): T[]`.
- `operators.ts`: `interface BaseCase { furnitureId: "olmo" | "sintetico"; observations: Observation[]; listado: ListadoRow[]; params: EngineParams }`; `CATALOG_VERSION = "catalogo/1"`; `type OperatorId = "P1" | … | "P14"`; `interface Variant { id: string; base: "olmo" | "sintetico"; operators: { op: OperatorId; params: Record<string, unknown> }[]; observations: Observation[]; listado: ListadoRow[]; truth: Record<string, string | null>; expected: ExpectedOutcome; detectable: boolean; critical: ("piezas-equivalentes" | "canteado-parcial" | "codigos-anomalos" | "nombre-anomalo")[] }`; `individualVariants(base: BaseCase, ops: OperatorId[]): Variant[]` (exhaustivo, sin semilla).
- `ExpectedOutcome = { instanceKey: string; level?: Level; reasonIncludes?: Reason; truthInTopK?: 1 | 3; inconsistency?: Inconsistency["kind"] }[]`.
- `detectability.ts`: `hardSignature(row): string` (medidas ordenadas, espesor, cantidad); `softSignature(row, vocab): string`; `isDetectable(variant: Pick<Variant, "operators" | "listado">, original: ListadoRow[], vocab): boolean`.
- `metrics.ts`: `type Ratio = { n: number; N: number }`; `type Metrics = Record<string /* nombre de la métrica, §9.5 */, Ratio | number>`; `interface MetricsByGroup { porCaso: Record<string, Metrics>; porMueble: Record<string, Metrics>; porOperador: Partial<Record<OperatorId, Metrics>>; porCasoCritico: Record<string, Metrics> }`; `computeMetrics(outcomes: VariantOutcome[]): MetricsByGroup` (por caso, mueble, operador, caso crítico; todas las de §9.5 salvo concordancia, sombra y tiempo-sin-gate); `interface VariantOutcome { variant: Variant; run: AssociationRun; checks: { ok: boolean; detail: string }[] }`.
- `muebleSintetico.ts`: listado inventado (furnitureId `"sintetico"`, códigos `0009-01-M01-Cxx` para no chocar con Olmo) y observaciones a mano: un par equivalente (misma medida, material y canto; cantidades 1 y 2), un tipo con caras de canto, uno con largo < ancho, canto ABS 0,22 mm.
- Operadores de esta tarea (§9.4): P1 (rawName → `"pieza"`), P3 (`_` de más: inicial, final, ambos), P4 (formato roto), P5 (código válido inexistente), P6 (instancia extra), P7 (quita una), P8 (`listado ± k·tol`, k ∈ {0.95, 1.00, 1.05}, **relativo al listado**), P10 (fila duplicada), P11 (quita el código a todo un par equivalente: sintético), P12 (malla suelta).
- G1: 0 seguras incorrectas en variantes `detectable`; las no detectables van a "límites conocidos".

- [ ] **Paso 1: detectabilidad contada a mano (§13, falla).**

```ts
it.each([
  ["misma firma dura (intercambio entre tipos idénticos en medida, espesor y cantidad)", swap(A, A2), false],
  ["firma dura distinta (P2)", swap(A, B), true],
  ["firma blanda distinta, dura igual", swap(A, Asoft), false],   // indetectable: límite conocido
  ["firmas idénticas (P2e)", swap(A, Aeq), false],
])("%s → detectable %s", (_, variant, expected) => expect(isDetectable(variant, listado, vocab)).toBe(expected));
```

(La combinación recalculada va en T15.)
- [ ] **Paso 2: operadores (fallan):** por operador, una variante sobre el mueble sintético con su resultado esperado contado a mano (p. ej. P8 k=1.00 → segura; k=1.05 → dudosa `medida-fuera-de-tolerancia`; P6 → las N+1 dudosas `cupo-excedido`; P12 → `sin-asociar`). Y `metrics.test.ts` con 3 outcomes armados a mano → n/N exactos.
- [ ] **Paso 3–4:** implementar → PASS.
- [ ] **Paso 5:** `npm run eval` → reporte con secciones **real** y **sintético** separadas, por operador y por caso crítico, G1 ok, código 0.
- [ ] **Paso 6: proponer commit** ("Eval: perturbaciones críticas, detectabilidad y G1 (M9 parte, M10)").

### Tarea 14: Visor y ficha vinculan solo seguras (run publicado)

Sin dependencia de Casa Mueble. Es lo que se ve en la pre-entrega al escanear un QR.

**Archivos:**
- Crear: `src/lib/publishedRuns.ts`
- Modificar: `src/model/namedColladaLoader.ts` (usa `indexDae(...).taggedXml` y expone `daeIndex`), `src/model/colladaModel.ts` (`buildFurnitureModel(scene, index)`: partes por entrada `componente`, con `instanceKey`), `src/model/types.ts` (`FurniturePart.instanceKey: string`), `src/model/ids.ts` (quitar `PIECE_NAME` y `canonicalCode` si ya no se usan; `CODE_FORMAT` pasa a venir de `normalize.ts`), `src/model/verifyModel.ts` ((b) y (c) usan `checkDims` y `normalizeName`), `src/model/useFurnitureModel.ts` (quita `checkAssociation`; en desarrollo loguea el estado de `SafeLinks`), `src/lib/lookup.ts`, `src/app/p/layout.tsx`, `src/app/p/[qrId]/page.tsx`, `src/components/viewer/ViewerPane.tsx`, `src/components/viewer/FurnitureModel.tsx`, `src/components/PieceSheet.tsx`
- Borrar: `src/data/mapping.ts`
- Test: `tests/publishedRuns.test.ts`, `tests/lookup.test.ts`

**Interfaces:**
- `publishedRuns.ts` (solo servidor; importarlo desde un componente cliente es un error de build — verificar con la doc de Next 16 sobre `server-only` en `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` antes de elegir cómo marcarlo):
  - `type SafeLinks = { status: "ok"; modelId: string; byInstanceKey: Record<string, string>; unlinked: number } | { status: "sin-publicacion"; modelId: string | null }`
  - `getSafeLinks(furnitureId: string, opts?: { sabrinaDir?: string; runsDir?: string }): SafeLinks` — lee el .dae con `modelSourceFor`, calcula `modelId`, busca `<runsDir>/<hash>.json`; `byInstanceKey` solo con `level === "segura"`; `unlinked` = instancias con componente no seguras.
- `lookup.ts`: `getPieceForInstance(def, instanceKey, links: SafeLinks): PieceType | undefined`; `isInstanceHot(target, instanceKey, links): boolean`; `linkedCount(piece, links): number`. Sin `links.status === "ok"`, todo devuelve "no vinculado".
- `layout.tsx` (servidor) arma `Record<furnitureId, SafeLinks>` para los muebles registrados y lo pasa a `<ViewerPane links={…} />` → `FurnitureModel`.
- `PieceSheet`: muestra "Vinculadas en el 3D: n de quantity"; si `n < quantity`, "k sin vincular (asociación dudosa)"; con `sin-publicacion`, aviso "No hay asociación publicada para este modelo: no se resalta ninguna pieza."

- [ ] **Paso 1: pruebas (fallan).**

```ts
it("getSafeLinks('olmo'): las seguras de eval/runs coinciden con esperados.json", () => {
  const links = getSafeLinks("olmo");
  expect(links.status).toBe("ok");
  const seguras = Object.values(readEsperados("eval/esperados.json"))[0].results.filter((r) => r.level === "segura");
  expect(Object.keys(links.byInstanceKey).sort()).toEqual(seguras.map((r) => r.instanceKey).sort());
});
it("la C01 anómala no está vinculada", () => {});
it("getSafeLinks: modelId sin run publicado → sin-publicacion (foco de revisión 2)", () => {
  expect(getSafeLinks("olmo", { runsDir: fs.mkdtempSync(path.join(os.tmpdir(), "runs-")) })).toEqual({ status: "sin-publicacion", modelId: expect.stringMatching(/^sha256:/) });
});
it("lookup: una dudosa no resalta ni abre ficha; una segura sí", () => {});
it("lookup: con sin-publicacion no resalta nada", () => {});
it("buildFurnitureModel: cada parte trae el instanceKey del índice; 33 partes en Olmo", () => {});
```

- [ ] **Paso 2–4:** FAIL → implementar → PASS. A6 (`verifyModel`) sigue verde.
- [ ] **Paso 5:** `npm run typecheck && npm run lint && npm test && npm run build`. El build no debe incluir `src/engine/associate.ts` en el cliente: buscar `"cupo-completo-sugerido"` (cadena que solo existe en el motor) en `.next/static/**` → 0 resultados.
- [ ] **Paso 6: verificación manual en la app** (skill `run`): `npm run dev`, abrir `/p/olmo-c04` (resalta sus instancias), `/p/olmo-c01` (ficha con "1 sin vincular (asociación dudosa)", sin resaltado), click en el 3D sobre C01 no navega. Luego `npm run dev:lan` y lo mismo desde el celular escaneando el QR de `/qr`.
- [ ] **Paso 7: proponer commit** ("Visor y ficha vinculan solo seguras desde el AssociationRun publicado (M8, §11)").

**Fin del mínimo de la pre-entrega (20/11).** La semana del 16/11 (QR impresos, prueba en celular, ensayo de la demo) no tiene tareas de código.

---

# Pista B — herramienta de etiquetado (en paralelo desde T3; meta 13/11)

Los números de tarea siguen el orden de los criterios, no el calendario: T16–T18 corren en paralelo con T4–T14; T15 va después del 20/11.

**Requiere Q2.** Construirla no espera a Casa Mueble; **usarla** espera CM-48 (reexportación) y CM-55 (quién etiqueta). Plan B si no llega a tiempo: la concordancia se reporta "no ejecutado" (ya es el comportamiento sin etiquetas).

### Tarea 16: Esquema `revision-asociacion/1`, validador, concordancia, ceguera temporal

**Archivos:** Crear `eval/labels/schema.ts`, `eval/labels/concordance.ts`; modificar `eval/harness.ts`, `eval/report.ts`. Test `tests/eval/labels.test.ts`.

**Interfaces:**
- `validateLabels(file: unknown, ctx: { modelId: string; listadoId: string; instanceKeys: ReadonlySet<string>; codes: ReadonlySet<string> }): { ok: true; labels: LabelFile } | { ok: false; errors: string[] }` — todas las reglas de §10.2.
- `concordance(run: AssociationRun, labels: LabelFile, firstRunDate: string | null): ConcordanceReport` con `{ seguras: Ratio; dudosasTop1: Ratio; dudosasTop3: Ratio; ningunoVsSinAsociar: Ratio; noSe: number; discrepancias: { instanceKey: string; motor: string | null; etiqueta: string | null; parEquivalente: boolean }[]; posterioresAPrimeraCorrida: number; entreEtiquetadores: { acuerdo: Ratio; kappa: number | null; n: number } | null }`. `no-se` fuera de los denominadores. Etiquetas con `decidedAt` posterior a la primera corrida → se cuentan aparte.
- El harness busca `eval/etiquetas/<hash>.json` (Sabrina: `Sabrina/eval/etiquetas/`); sin archivo → concordancia "no ejecutado".

- [ ] **Paso 1: un caso válido y uno inválido por regla (§13), fallan.**

```ts
it.each([
  ["decision fuera del catálogo", (f) => (f.decisions[0].decision = "quizas")],
  ["pieceCode con 'ninguno'", (f) => Object.assign(f.decisions[0], { decision: "ninguno" })],
  ["pieceCode inexistente", (f) => (f.decisions[0].pieceCode = "0001-01-M01-C99")],
  ["engineRunId en ciego", (f) => (f.decisions[0].engineRunId = "sha256:x")],
  ["revision sin engineRunId", (f) => (f.decisions[0].mode = "revision")],
  ["duplicado (instanceKey, labeler, mode)", (f) => f.decisions.push({ ...f.decisions[0] })],
  ["instanceKey inexistente", (f) => (f.decisions[0].instanceKey = "ID999")],
  ["modelId distinto", (f) => (f.modelId = "sha256:otro")],
  ["listadoId distinto", (f) => (f.listadoId = "sha256:otro")],
  ["labeler sin declarar", (f) => (f.decisions[0].labeler = "zz")],
  ["exposicion vacía", (f) => (f.labelers.cm1.exposicion = [])],
  ["exposicion como string (formato v2)", (f) => (f.labelers.cm1.exposicion = "ninguna")],
  ["origen fuera del catálogo", (f) => (f.labelers.cm1.origen = "cliente")],
])("rechaza: %s", (_, mutate) => {});
it("acepta el ejemplo del spec §10.2 (con exposicion combinada)", () => {});
it("concordancia: tabla de 6 etiquetas de prueba → n/N contados a mano, no-se aparte", () => {});
it("ceguera temporal: etiqueta posterior a primera-corrida se reporta aparte", () => {});
it("kappa de Cohen con dos etiquetadores (valor calculado a mano)", () => {});
```

- [ ] **Paso 2–4:** FAIL → implementar → PASS. El reporte suma: concordancia por mueble, discrepancias (pares equivalentes aparte), `no-se` siempre visible.
- [ ] **Paso 5: proponer commit** ("Eval: esquema de etiquetas, concordancia y ceguera temporal (M12)").

### Tarea 17: Modelo saneado (token opaco)

**Archivos:** Crear `eval/etiquetado/sanear.ts` (CLI: `npm run etiquetado:sanear -- --seed <n>`). Salidas: `tools/etiquetado/public/modelo.dae`, `tools/etiquetado/public/listado.json`, `tools/etiquetado/tokens.json`. Test `tests/eval/sanear.test.ts`.

**Interfaces:**
- `sanitizeDae(xml: string, seed: number): { xml: string; tokens: Record<string /* token */, string /* instanceKey */> }` — usa `indexDae`; cada nodo-instancia (componente y malla suelta) recibe `name` = token y su `id` = token; **cada instancia recibe su propia copia** del nodo de biblioteca (sin `url` compartida); todos los demás `id`/`name` de nodos, geometrías y materiales pasan a tokens; los hijos de `visual_scene` y `library_nodes` se reordenan por semilla; las rutas de imagen se vacían (dicen "Oslo").
- `sanitizeListado(rows: readonly ListadoRow[], seed: number): { listado: { ref: string; name: string; lengthMm: number; widthMm: number; thicknessMm: number; material: string; quantity: number; edgeBanding: readonly EdgeId[] | null }[]; refs: Record<string /* ref */, string /* code */> }` — sin códigos, ordenado por nombre.
- `tokens.json` = `{ modelId, listadoId, seed, instances: tokens, types: refs }` (fuera de `public/`).
- Token = 8 hex de `mulberry32(seed)`; nunca deriva del `instanceKey` ni del orden del .dae.

- [ ] **Paso 1: pruebas (fallan).**

```ts
const { xml, tokens } = sanitizeDae(read("public/models/Olmo/olmo.dae"), 7);
it("sin nombres de componente ni códigos en el modelo saneado", () => {
  expect(xml).not.toMatch(/\d{4}-\d{2}-M\d{2}-C\d{2}/);
});
it("sin instanceKey del original", () => {
  for (const key of indexDae(read("public/models/Olmo/olmo.dae")).entries.map((e) => e.instanceKey.split("/").pop()!))
    expect(xml).not.toMatch(new RegExp(`id="${key}"`));
});
it("ningún instance_node del modelo saneado comparte url (foco de revisión 4)", () => {});
it("39 tokens únicos; el modelo saneado da la misma geometría (sizeMm) por token", () => {
  // observeDae sobre el saneado: mismas cajas que el original, emparejadas por tokens → instanceKey
});
it("misma semilla → mismo archivo; otra semilla → otro orden", () => {});
it("listado sin códigos", () => { expect(JSON.stringify(sanitizeListado(olmoDef.pieceTypes, 7).listado)).not.toMatch(/M\d{2}-C\d{2}/); });
```

- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** generar las salidas con el .dae provisorio (se regeneran con la reexportación, T23).
- [ ] **Paso 6: proponer commit** ("Etiquetado: modelo y listado saneados con token opaco (M11 parte)").

### Tarea 18: App de etiquetado, verificación de builds, importación

**Paradas Q2, U-vercel; CM-48 y CM-55 para usarla.**

**Archivos:**
- Crear: `tools/etiquetado/next.config.ts` (`output: "export"`, `images: { unoptimized: true }`), `tools/etiquetado/tsconfig.json` (extiende el de la raíz, sin `paths` a `src/`), `tools/etiquetado/app/layout.tsx` (metadata `robots: { index: false, follow: false }`), `tools/etiquetado/app/page.tsx` (`"use client"`), `tools/etiquetado/public/robots.txt` (`Disallow: /`), `eval/etiquetado/importar.ts`, `scripts/check-builds.mjs`
- Modificar: `package.json` (`"build:etiquetado": "next build tools/etiquetado"`, `"dev:etiquetado": "next dev tools/etiquetado -p 3001"`, `"check:builds": "node scripts/check-builds.mjs"`, `"etiquetado:importar": "vite-node --config vitest.config.ts eval/etiquetado/importar.ts --"`), `.gitignore` (`/tools/etiquetado/.next/`, `/tools/etiquetado/out/`)
- Test: `tests/etiquetado/app.test.tsx` (vitest + jsdom; ampliar `include` de `vitest.config.ts` a `tests/**/*.test.{ts,tsx}`), `tests/eval/importar.test.ts`

Antes de escribir: leer en `node_modules/next/dist/docs/01-app/02-guides/static-exports.md` (sin headers, sin route handlers dinámicos) y `03-api-reference/05-config/01-next-config-js/turbopack.md` (raíz autodetectada por `package-lock.json`).

**Interfaces:**
- La página: carga `modelo.dae` y `listado.json` por `fetch`; orden de instancias = `shuffle(tokens, mulberry32(seed))` con la semilla en `listado.json`; muestra el 3D con la instancia resaltada (R3F + `ColladaLoader` propios de la herramienta, sin importar `src/`) y la tabla del listado (nombre, medidas, espesor, material, cantidad, canteado); botones: un tipo, `ninguno`, `no-se`; campo de seudónimo; progreso en `localStorage` (try/catch); botón "Exportar JSON" → `{ schema: "etiquetado-herramienta/1", seed, labeler, decisions: [{ token, decision, ref | null, decidedAt }] }`. **No** muestra ni guarda nombres, códigos, `instanceKey`, ni salida del motor.
- `importar.ts`: `importToolExport(exported, tokensFile, ctx: { labelers: LabelFile["labelers"] }): LabelFile` → `eval/etiquetas/<hash>.json` (token → `instanceKey`, ref → código, `mode: "ciego"`, `engineRunId: null`), validado con `validateLabels` (T16).
- `check-builds.mjs` (M11, método fijado): después de `npm run build` y `npm run build:etiquetado`:
  1. en `.next/` de la app: ningún archivo de ruta bajo `.next/server/app/` contiene `etiquetado`, y ningún archivo de `.next/static/` contiene la marca `ETIQUETADO-7f3a` (cadena constante que solo existe en `tools/etiquetado/app/page.tsx`);
  2. en `tools/etiquetado/out/`: ningún archivo contiene `/\d{4}-\d{2}-M\d{2}-C\d{2}/` ni un `id`/`name` de `instanceKey` del original, y no hay `tokens.json`;
  3. sale con 1 si algo falla e imprime qué y dónde.

- [ ] **Paso 1: pruebas (fallan).**

```tsx
it("el DOM de la herramienta no muestra nombres de componente, códigos ni instanceKey", async () => {
  render(<Page />) /* con fetch simulado que sirve modelo.dae y listado.json reales del public/ de la herramienta */;
  await screen.findByText(/Cajon 1/);
  expect(document.body.innerHTML).not.toMatch(/\d{4}-\d{2}-M\d{2}-C\d{2}/);
  expect(document.body.innerHTML).not.toMatch(/\bID\d+\b/);
});
it("el orden de presentación depende de la semilla, no del orden del .dae", () => {});
it("exportar produce decisions con token y ref, sin códigos", () => {});
it("importar: token → instanceKey, ref → código, valida con el esquema", () => {});
```

(La herramienta usa React sin Testing Library: el render de prueba usa `react-dom/client` + `act` de `react`, ya instalados; sin dependencias nuevas. Si el 3D bloquea el render en jsdom, el componente del visor se separa y la prueba del DOM monta la página con el visor reemplazado por un stub vía prop.)
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5: verificación de builds:** `npm run build && npm run build:etiquetado && npm run check:builds` → código 0. Comprobar a mano que `tools/etiquetado/out/` tiene `index.html`, `modelo.dae`, `listado.json`, `robots.txt` y **no** `tokens.json`.
- [ ] **Paso 6:** `npm run dev:etiquetado` y probar desde PC y celular (LAN).
- [ ] **Paso 7: proponer commit** ("Herramienta de etiquetado: app estática aparte, fuera del bundle de producción (M11)").
- [ ] **Paso 8: PARAR (U-vercel).** Pedir al usuario que cree un proyecto de Vercel **nuevo** (no tocar el de los QR): raíz del repo, comando de build `npm run build:etiquetado`, directorio de salida `tools/etiquetado/out`, sin variables de Sabrina.
- [ ] **Paso 9: PARAR (CM-48 + CM-55).** Con la reexportación aplicada (T23) y alguien de Casa Mueble designado: regenerar el saneado, redesplegar, compartir la URL, recibir el JSON exportado, `npm run etiquetado:importar`, revisar el resultado con el usuario y proponer commit de `eval/etiquetas/<hash>.json`. Si a la fecha de corte del cronograma no hay reexportación: plan B ("no ejecutado").

---

# Después del 20/11 (cronograma §2.3)

**Parada PROF-IA antes de T15, T19 y T20** (§17: preguntar a la cátedra si el motor de reglas cumple como "IA obligatoria" antes de invertir semanas en el harness).

### Tarea 15: Resto del catálogo (P2, P2b, P2e, P9, P13, P14), combinaciones y límites conocidos

**Archivos:** Modificar `eval/perturb/operators.ts`, `eval/perturb/detectability.ts`, `eval/harness.ts`, `eval/report.ts`. Test `tests/eval/operators2.test.ts`.

**Interfaces:**
- `combinedVariants(base: BaseCase, n: number, seed: number): Variant[]` — 2 a 3 operadores sorteados con `mulberry32(seed)`; detectabilidad **recalculada** sobre la variante combinada.
- Reporte: "seguras incorrectas en límite conocido: N" y "advertencia saltó: n/N" para P2b; P2e como límite conocido; P9 rotulado **sintético** sobre Olmo; P13 mide cuántas dudosas cambian su top-1 con nombres degradados (seguras sin cambio).

- [ ] **Paso 1:** pruebas por operador con resultado contado a mano + **la combinación recalculada (§13)**: P8 k=1.05 + P1 sobre la misma instancia → detectable aunque P1 sola sobre un par equivalente no lo sea.
- [ ] **Paso 2–4:** FAIL → implementar → PASS; `npm run eval` → código 0 (los límites conocidos no gatean).
- [ ] **Paso 5: proponer commit** ("Eval: catálogo P1–P14 completo y combinaciones (M9)").

### Tarea 19: Modo sombra

**Archivos:** Crear `eval/shadow.ts`; modificar `eval/report.ts`. Test `tests/eval/shadow.test.ts`.

**Interfaces:**
- `decidingElement(c1: Candidate, c2: Candidate | undefined): 1 | 2 | 3 | 4 | 5 | 6 | 7 | null` (primer elemento distinto; `null` si empate).
- `shadowCurve(outcomes: VariantOutcome[], seeds: { seleccion: number; validacion: number }): { k: number; aciertos: number; errores: number; total: number }[]` — las dudosas se reparten entre selección y validación con semillas distintas; la curva se mide en validación. **No fija k.**

- [ ] **Paso 1:** fixture sintético con k calculado a mano (M17): 4 dudosas decididas en los elementos 1, 2, 4 y 7, una errada → curva exacta. Prueba de que selección y validación no comparten instancias.
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5: proponer commit** ("Eval: modo sombra sin umbral (M17)").

### Tarea 20: Baseline y G5

**Archivos:** Crear `eval/baseline.ts`, `eval/baseline.json` (Sabrina: `Sabrina/eval/baseline.json`); modificar `eval/gate.ts`, `eval/run.ts` (`--escribir-baseline`). Test `tests/eval/g5.test.ts`.

**Interfaces:**
- `baseline.json` = `{ catalogVersion, vocabularyVersion, byOperator: Record<OperatorId, Metrics> }`.
- `compareBaseline(current, baseline): { metric: string; operator: OperatorId; antes: Ratio; ahora: Ratio; empeora: boolean }[]` — "empeora" según §9.6: error sube; precisión baja; cobertura (resuelto, top-1, top-3, variantes por caso crítico) baja; conteos informativos nunca empeoran (solo se muestran). Versiones distintas → G5 falla con "baseline de otra versión: regenerar con commit justificado".

- [ ] **Paso 1 (M18):** baseline armado a propósito **mejor** que la corrida actual en una métrica de error de un operador → `npm run eval` con ese baseline (copia temporal, `--baseline <ruta>`) sale distinto de 0; con un conteo informativo peor → sale 0.
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** generar `eval/baseline.json` con `--escribir-baseline`; mostrarlo al usuario; proponer commit **con justificación en el mensaje** (§9.6).

### Tarea 21: Reportes de entrega (lista blanca) y cobertura del vocabulario

**Archivos:** Modificar `eval/report.ts`, `eval/run.ts` (`--reporte-entrega <AAAA-MM-DD>`). Test `tests/eval/reporteEntrega.test.ts`.

**Interfaces:**
- `writeDeliveryReport(report: Report, publico: string[], dir: string, date: string): string` — lanza si algún caso del reporte tiene un `furnitureId` fuera de `publico` (no lo filtra en silencio: el llamador arma el reporte solo con los públicos y la función verifica); escribe `eval/reportes/<fecha>.md`.
- El reporte incluye la cobertura por regla y los tipos sin regla (`vocabularyCoverage`, M19) para cada caso público.

- [ ] **Paso 1 (M14):** rechaza un reporte con `furnitureId: "sabrina"`; acepta `olmo` y `sintetico`; el .md generado no contiene "sabrina" (ni mayúsculas).
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5: proponer commit** ("Eval: reporte de entrega con lista blanca (M14, M19)").

### Tarea 22: Cierre de la fase 1 — documentación y verificación total

**Archivos:** Modificar `CLAUDE.md` (spec §20: motor, harness, `npm run eval`, herramienta, `.gitattributes`, A4 nuevo, C01 dudosa sin vincular, "Simulado" de `mapping.ts` reemplazado). **No** tocar `ESTADO.md`.

- [ ] **Paso 1:** `npm run typecheck && npm run lint && npm test && npm run build && npm run build:etiquetado && npm run check:builds && npm run eval` → todo en 0. Pegar la salida en el resumen.
- [ ] **Paso 2:** recorrer la tabla de trazabilidad: cada M y G con su prueba en verde (o "no ejecutado" justificado para Sabrina).
- [ ] **Paso 3:** `git status` y `git diff --stat`: confirmar que nada de `Sabrina/` ni de `dashboard/` está agregado y que ningún archivo versionado nuevo contiene códigos o cifras de Sabrina (`git grep -i sabrina -- eval tools docs/plan-motor-asociacion.md` → solo rutas y la lógica de "no ejecutado").
- [ ] **Paso 4: proponer commit** ("CLAUDE.md: motor de asociación y Eval Harness").

---

# Condicional — cuando llegue la reexportación (CM-48)

### Tarea 23: Cambio controlado del .dae de Olmo

**Parada CM-48 (y CM-49 si cambia el nombre de C01).** No se edita el .dae a mano.

**Archivos:** Reemplazar `public/models/Olmo/olmo.dae`; regenerar `eval/esperados.json`, `eval/runs/<hash nuevo>.json` (el viejo se borra), `tools/etiquetado/public/*`, `tools/etiquetado/tokens.json`; revisar `tests/olmo.test.ts` (A6), `tests/model/daeIndex.test.ts` y `observe.test.ts` (conteos 33 / 6 / 0).

- [ ] **Paso 1:** copiar el .dae nuevo; `npm test` → anotar qué falla (conteos, nombre de C01, `instanceKey`). Si las rutas de textura ya no dicen "Oslo", anotarlo.
- [ ] **Paso 2:** `npm run eval` → G2 falla por hash distinto (esperado por diseño).
- [ ] **Paso 3:** `npm run eval -- --escribir-esperados`; revisión a mano con el usuario (como T12). Si C01 vino corregida: pasa a `segura` (si cumple medidas), A6 espera 0 anomalías y se actualiza `tests/olmo.test.ts`.
- [ ] **Paso 4:** `npm run eval -- --publicar` (escribe la primera corrida del `modelId` nuevo: desde acá, etiquetas posteriores se reportan aparte, §10.6); `npm run etiquetado:sanear`.
- [ ] **Paso 5:** `npm test && npm run build && npm run check:builds` → 0.
- [ ] **Paso 6: proponer un único commit** con el .dae, `esperados.json`, el run publicado, la primera corrida, el saneado y los tests actualizados (§2.2).
