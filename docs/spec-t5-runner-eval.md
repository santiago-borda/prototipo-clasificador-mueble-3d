# Especificación — T5: runner del eval y DOM de jsdom

Versión: **v0.2 (10/11/2026), aprobada** por el equipo (10/11): T5-E1, T5-E2 y T5-E3 sí; T5-E4 no (no se silencia la consola de `ColladaLoader`).
Antecedentes: `docs/plan-motor-asociacion.md` T5 (M20), `docs/spec-motor-asociacion.md` v3 §4a, §4c y §13 ("jsdom"), `docs/spec-adapter-observation-listadoid.md` v0.2 §4 (recorte del 20/11, E6), T3 y T4 hechos (rama `motor-t3-t4`).
**Es una enmienda, no un diseño nuevo:** se implementa T5 como está en el plan, salvo lo que dice §2. Si choca con el plan, manda el plan salvo en lo que esta spec enmienda explícitamente.

---

## 1. Objetivo y alcance

`npm run eval` corre en Node, fuera de vitest, con el alias `@/` resuelto y con el `DOMParser` que necesitan `indexDae` y `ColladaLoader`, tomado del **mismo** `jsdom` que usa vitest (M20). Es el esqueleto: imprime la versión de jsdom y sale con 0. Lo completa T11.

**No es objetivo:** casos, gate, reporte ni publicación (T11), ni el motor (T7 a T10).

## 2. Enmiendas al plan

| # | Qué | Por qué | Propuesta |
|---|---|---|---|
| T5-E1 | La prueba "package.json no suma dependencias" del plan fija una lista que ya no es la del repo: faltan `@google-cloud/vision` y `@vercel/blob` (entraron con el importador y el adaptador de OCR, antes de T5) | Con la lista del plan la prueba falla sin que T5 sume nada | La prueba compara contra la lista **actual** de `dependencies` y `devDependencies`, escrita en el test; `vite-node` sigue sin estar en `devDependencies` (viene con vitest) |
| T5-E2 | `observeDae` devuelve `DaeObservation` (interfaz del plan T4), no `Observation[]` como dice spec-adapter §1 | Es la interfaz que consume T5 (`alias-check`) y T11 (`lineObjects`, caja de referencia) | `alias-check` imprime `observaciones: <observeDae(bytes).observations.length>` (39 en el primer fixture) |
| T5-E3 | vite-node no aplica `setupFiles` de `vitest.config.ts`: la guarda `tests/setup/sinRed.ts` (fetch falla) no rige en el eval | El eval solo lee archivos locales; nada debería salir a la red | Prueba estática: ningún archivo de `eval/` usa `fetch` ni importa `@google-cloud/vision`, `@vercel/blob`, `src/pdf/ocr/` ni `src/importer/` |
| T5-E4 | `ColladaLoader` escribe por consola ("File version 1.4.1" y el aviso de `Z_UP`) | Ensucia la salida del eval, pero no es un error | Se deja tal cual (no se silencia `console`); T11 decide el formato del reporte |

## 3. Contrato

```ts
// eval/dom.ts
/** Crea UN JSDOM y asigna a globalThis DOMParser, XMLSerializer y document. Idempotente. */
export function installDom(): { jsdomVersion: string };
```

- Sin `installDom()`, `indexDae` falla con `ReferenceError: DOMParser is not defined` (spec-motor §4a, a verificar en T5; el motivo queda escrito en el comentario de `dom.ts`).
- Si al correr hace falta otro global (por ejemplo para `ImageLoader` con `skipTextures`), se agrega **solo** en `dom.ts` y se anota en el comentario con el error que lo pidió. No se agregan globales "por las dudas".
- Verificado al implementar (10/11): sin `installDom()`, `indexDae` falla con `ReferenceError: DOMParser is not defined` (R3). `document` hace falta: aun con `skipTextures`, `ImageLoader` llama a `document.createElementNS` (sin él, `ReferenceError: document is not defined` con el primer fixture). Con los tres globales no hizo falta ninguno más.
- `eval/jsdom.d.ts`: declaración mínima del módulo `jsdom` (solo `JSDOM` y `window`). El repo no tiene `@types/jsdom` y T5 no suma dependencias (R5).
- `eval/run.ts`: `installDom()`, imprime `jsdom <versión>`, sale con 0.
- `eval/alias-check.ts`: `installDom()`, importa `observeDae` por `@/model/observe`, imprime `observaciones: <n>` del primer fixture. Nada del segundo fixture.
- `package.json`: `"eval": "vite-node --config vitest.config.ts eval/run.ts --"` (misma forma que `fixture:sintetico` y `ocr:sintetico`).
- `.gitignore`: `/eval/out/`.

## 4. Pruebas (`tests/eval/runner.test.ts`)

| Id | Qué | Esperado |
|---|---|---|
| R1 (M20) | versión de jsdom resuelta desde vitest y desde `eval/dom.ts` | iguales, y `24.1.3` |
| R2 (M20) | `vite-node … eval/alias-check.ts` en un proceso aparte | código 0 y `observaciones: 39` en la salida |
| R3 | `vite-node` sobre un script que llama a `indexDae` **sin** `installDom()` | código distinto de 0 y `DOMParser is not defined` en la salida |
| R4 | `npm run eval` | `jsdom 24.1.3`, código 0 |
| R5 (T5-E1) | dependencias de `package.json` | igual a la lista actual; sin `vite-node` en `devDependencies` |
| R6 (T5-E3) | importaciones y `fetch` en `eval/` | ninguna de las prohibidas |
| R7 | `installDom()` dos veces | un solo `JSDOM` (devuelve lo mismo, no reemplaza los globales) |

R2 a R4 lanzan procesos (`spawnSync` con `shell: true`): llevan un `timeout` de 60 s.

## 5. Después de T5 (recorte del 20/11, E6)

T7 solo verificaciones duras → T8 (pasada 1, puede seguir aunque el marco cambie: spec-adapter §3.4) → T10 mínimo → T11 mínimo → T12 (`esperados.json` revisado a mano, parada U-esperados) → T14.

## 6. Decisiones

| Id | Pregunta | Propuesta |
|---|---|---|
| T5-E1 | ¿La prueba de dependencias usa la lista actual? | Sí |
| T5-E2 | ¿`observeDae` queda con `DaeObservation`? | Sí (interfaz del plan; spec-adapter §1 se lee como "las observaciones de") |
| T5-E3 | ¿Prueba estática de red en `eval/`? | Sí |
| T5-E4 | ¿Se silencia la consola de `ColladaLoader`? | No |

**Decisiones del equipo (10/11):** T5-E1, T5-E2 y T5-E3 aprobadas como se proponen; T5-E4: no se silencia la consola.

## 7. Historial

- **v0.1 (8/11/2026):** borrador, escrito al cerrar T3 y T4.
- **v0.2 (10/11/2026):** aprobada (T5-E1 a T5-E4 como se proponen). Implementada en la rama `motor-t5`: §3 suma lo verificado (`DOMParser`, `document`) y `eval/jsdom.d.ts`. R6 es estática y solo ve imports directos de `eval/` (no sigue la cadena de dependencias).
