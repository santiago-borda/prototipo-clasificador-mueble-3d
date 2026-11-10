# Especificación — T12: primera corrida del primer fixture, `esperados.json` revisado a mano, A4 y run publicado

Versión: **v0.1 (10/11/2026), BORRADOR a aprobar** por el equipo. **No implementada.** Con una parada obligatoria (U-esperados, §4).
Antecedentes: `docs/plan-motor-asociacion.md` T12 (A4, M13, parada U-esperados), `docs/spec-motor-asociacion.md` v3.1 §9.6 (G2), §9.7 (archivos) y §10 (revisión humana), `docs/spec-t11-harness-minimo.md` v0.2 (T11 hecho en `motor-t11`: `--escribir-esperados`, `--publicar`, T11-E3, T11-E5 y T11-E9), `docs/spec-adapter-observation-listadoid.md` v0.2.1 §2.3 (E2) y §4 (recorte del 20/11, E6).
**Es una enmienda, no un diseño nuevo:** se hace T12 como está en el plan, con lo que dice §2. Si choca con el plan, manda el plan salvo en lo que esta spec enmienda explícitamente.

---

## 1. Objetivo y alcance

Dejar `npm run eval` en verde por primera vez:

1. Generar `eval/esperados.json` del primer fixture con `npm run eval -- --escribir-esperados`.
2. **Que el equipo lo revise a mano, instancia por instancia (§4), antes de commitearlo.** Es la parada U-esperados.
3. Reescribir A4 contra `eval/esperados.json` (§5) y activar M13.
4. Con el gate aprobado y el listado `publicable`: `npm run eval -- --publicar` escribe `eval/runs/<hash>.json` y `eval/primera-corrida.json`.

**No es objetivo:** T13 (sintéticos, G1 con variantes), T14 (visor), T9 (pasada 2), T6 (vocabulario). Sin dependencias nuevas. El gate sigue siendo **parcial** (G2, G3 y G4; G1 y G5 `no-ejecutado`).

## 2. Enmiendas y precisiones al plan

| # | Qué | Por qué | Propuesta |
|---|---|---|---|
| T12-E1 | **Quién revisa: el equipo, no Casa Mueble** | La revisión de `esperados.json` no necesita a Casa Mueble: el .dae es el provisorio y la verdad de esta corrida sale del **código** del componente (§9.1). Casa Mueble etiqueta aparte, a ciegas, para el control independiente (§10, "Quién etiqueta") | La revisión de §4 la hacen dos personas del equipo, y el resultado se registra (§4.5). **No sustituye** el etiquetado ciego de §10 y **no se pide a Casa Mueble**. Ninguna consulta nueva |
| T12-E2 | **A4 usa las mismas entradas que el eval** | El plan T12 escribe A4 con `associate` y `olmoDef.pieceTypes`; hoy el run es `buildRun` y el listado del primer fixture es `toListing` (T11-E2). Si A4 usara otra entrada daría otro `listadoId` y no probaría lo que corre el eval | A4 arma el run con `buildRealCase` (T11), o con las mismas llamadas que `eval/cases.ts`, y compara `projectRun(run)` con `readEsperados("eval/esperados.json")[modelId]` |
| T12-E3 | **El reporte de la primera corrida se lee, no solo se guarda** | `eval/out/` está ignorado; si nadie lo ve, la revisión se hace sobre la proyección y no sobre el reporte | La revisión de §4 incluye leer `eval/out/reporte.md` (encabezado PARCIAL, `passes`, n/N, inconsistencias) |
| T12-E4 | **`mapping.ts` y `checkAssociation` no se tocan** | El plan los borra en T14 | En T12 solo se quita el `it` de A4 que usa `checkAssociation` (plan, paso 3). `src/data/mapping.ts` queda |
| T12-E5 | **Segundo fixture solo en local** | CLAUDE.md: nada de Sabrina al repo | Si `Sabrina/` está presente: `--escribir-esperados` escribe `Sabrina/eval/esperados.json` (carpeta ignorada), se revisa igual con §4, los conteos de la corrida van a `Sabrina/docs/anexo-motor.md`, y el reporte de salida no lleva códigos ni cifras (T11, E13). A4 de Sabrina compara contra ese archivo y se saltea si falta |

## 3. Qué se commitea

Un solo commit de datos y pruebas, **solo después de la aprobación de U-esperados** (plan, paso 6):

| Archivo | Contenido |
|---|---|
| `eval/esperados.json` | proyección (`projectRun`) del primer fixture, indexada por `modelId`, ya revisada (§4) |
| `eval/runs/<hash>.json` | `AssociationRun` publicado (`--publicar`) |
| `eval/primera-corrida.json` | fecha de la primera corrida por `modelId` (`recordFirstRun`; se escribe una vez) |
| `tests/olmo.test.ts` | A4 reescrito (§5) |
| `tests/sabrina.test.ts` | A4 contra `Sabrina/eval/esperados.json`, salteado si falta |
| `tests/eval/m13.test.ts` | M13 activo (`it.todo` → `it`) |

Antes de commitear: `git ls-files "*.pdf"` vacío y `git status` sin nada de `Sabrina/`, `.ocr-data/` ni `eval/out/`. `eval/runs/` solo con `furnitureId` de `eval/publico.json` (lo garantiza `publishRun`).

## 4. Parada U-esperados y protocolo de revisión

### 4.1 La parada

1. Claude Code corre `npm run eval -- --escribir-esperados`. Sale con 1 a propósito (T11): la proyección escrita todavía **no** está aprobada.
2. Claude Code **se detiene** y entrega al equipo, sin tocar el motor ni el archivo:
   - conteo por nivel (`segura`, `dudosa`, `sin-asociar`) y por razón;
   - la lista completa de dudosas y sin asociar con `instanceKey`, nombre crudo (`rawName`), razones y candidatos;
   - las inconsistencias (`faltante`, `sin-confirmar`, `sin-componente`...) con el código y las claves;
   - la comparación con la **estimación** (32 seguras + 1 dudosa + 6 sin asociar; §9.7: "estimado, no es criterio").
3. **Toda diferencia con la estimación se explica antes de seguir.** No se ajusta el motor ni el listado para que coincida: una diferencia es un hallazgo (de los datos, del marco o del motor) y se anota.
4. Claude Code **no commitea** `eval/esperados.json` ni corre `--publicar` hasta que el equipo apruebe por escrito la revisión de §4.2 a §4.5.

### 4.2 Qué se mira, instancia por instancia

Se revisa **cada una de las observaciones** del primer fixture (39 según `alias-check` y N9), no una muestra. Para cada una, con el reporte y la proyección delante:

1. **Identidad.** La `instanceKey` existe en el .dae y el `rawName` (o `null` si es malla suelta) es el esperado. Un nombre con `_` de más o fuera de formato es una anomalía a registrar.
2. **Nivel.**
   - `segura`: el nombre normalizado es exactamente el `pieceCode` y ese código está en el listado.
   - `dudosa`: hay una razón del catálogo que la explica y esa razón es cierta en el .dae (p. ej. `nombre-anomalo`: el nombre trae guiones bajos de más; `medida-fuera-de-tolerancia`: se mide a mano con la caja del .dae).
   - `sin-asociar`: solo por `sin-componente`.
3. **Medidas y espesor.** Para cada `segura`, `medidas` y `espesor` figuran `cumple` en la evidencia con una desviación dentro de la tolerancia del mueble (2 mm el primer fixture); se contrasta una muestra contra la caja del .dae y el listado del PDF transcripto, y todas las de borde.
4. **Cupo.** Por cada tipo, `seguras + dudosas que lo reclaman ≤ quantity` y las cantidades coinciden con el listado (`typeSummary`). Ningún `cupo-excedido` ni `faltante` sin explicación.
5. **La dudosa por nombre anómalo.** Confirmar que es la pieza de código C01 (del proyecto del fixture), que su `rawName` es el que trae el `__` y que las medidas coinciden con el tipo del listado. Debe quedar con `pieceCode: null`, razón `nombre-anomalo` y una `sin-confirmar` del código.
6. **Las sin asociar.** Confirmar una por una que son las mallas sueltas de ~20 x 35 x 10 mm (material `Color_M06`, sin código) que CLAUDE.md describe, y que ninguna es una pieza real sin nombre.
7. **Candidatos.** Con `passes: 1` todos los `top3` son `[]` (T10-E2, T8-E2): se confirma que no hay candidatos en ninguna. Si apareciera alguno, es un bug.
8. **Cabecera del run.** `passes: 1`; `listadoId` igual al literal de TP-61; `modelId` igual al de `public/models/Olmo/olmo.dae` (`modelId`, con `\\r\\n` → `\\n`); `versions` = `motor/1`, `vocabulario/0`, `marco/1`; el listado es `publicable` (sin `excluded` ni `unkeyedRows`).
9. **Contraste independiente de la corrida.** Las cifras de la verificación de desarrollo y de A6 (21 tipos, 33 instancias con código, 1 anomalía, 6 mallas sin código, 0 líneas) coinciden con lo que muestra el reporte. Se cuentan a mano, no con el motor.
10. **Archivos.** `eval/esperados.json` tiene una sola entrada (el `modelId` del primer fixture) y no trae evidencia (solo la proyección).

### 4.3 Qué NO se mira ni se concluye

- No se evalúa el ranking, el vocabulario ni la pasada 2 (no existen).
- No se concluye "precisión" ni "exactitud" del motor: la verdad del primer fixture sale del código (§9.1, tautológica). Que el motor coincida con `esperados.json` solo dice que **no cambió**, no que **acierta**.
- No se toca el motor, `toListing` ni el .dae durante la revisión. Un hallazgo se anota y se decide después.

### 4.4 Quién revisa

Dos personas del equipo, una de ellas distinta de quien escribió el motor. **Es una revisión del equipo, no de Casa Mueble** (T12-E1): el .dae es provisorio y los esperados son provisorios hasta la reexportación (§2.2 del spec del motor). El control independiente es el etiquetado ciego de §10, que hace personal de Casa Mueble y es otra tarea. Si alguien del equipo revisa el segundo fixture, queda registrado que no es ciego.

### 4.5 Registro

El commit de T12 lleva en el mensaje: quiénes revisaron, la fecha, las diferencias con la estimación y cómo se explicaron (o "ninguna"), y la frase "revisión del equipo, provisoria hasta la reexportación". Si hubo hallazgos, se anotan como pendientes en el historial de esta spec.

## 5. A4 reescrito, M13 y publicación

**A4 (`tests/olmo.test.ts`):**

```ts
it("A4: cada instancia con exactamente un nivel, igual a eval/esperados.json", () => {
  // mismas llamadas que eval/cases.ts (T12-E2): observeDae + toListing("olmo", ...) + buildRun
  expect(new Set(run.results.map((r) => r.instanceKey)).size).toBe(dae.observations.length);
  expect(projectRun(run)).toEqual(readEsperados("eval/esperados.json")[dae.modelId]);
});
it("la C01 anómala queda dudosa por nombre-anomalo (efecto esperado, §6.1)", () => { /* como en el plan */ });
```

Se quita el `it` que usa `checkAssociation`. A6 de `verifyModel` sigue igual (21 tipos, 33 instancias, 1 anomalía, 6 + 0 excluidos). A4 de Sabrina: igual contra `Sabrina/eval/esperados.json`, salteado si falta.

**M13 (`tests/eval/m13.test.ts`):** `npm run eval -- --sabrina-dir <inexistente> --out <tmp>` sale con **0** y `reporte.md` dice que el segundo fixture está "no ejecutado" (plan; en T11 era `it.todo`). El gate sigue siendo parcial: el exit 0 no dice "completo".

**Publicación:** `npm run eval -- --publicar` con gate aprobado y `assertPublicable` (T11-E3). Escribe `eval/runs/<hash>.json` y `eval/primera-corrida.json`. Una segunda corrida con el mismo .dae y el mismo listado no cambia ningún archivo (G3).

## 6. Pruebas

| Id | Qué | Esperado |
|---|---|---|
| A4 | primer fixture contra `eval/esperados.json` | igual; un nivel por instancia |
| A4-C01 | la C01 anómala | dudosa, `pieceCode: null`, `nombre-anomalo` |
| M13 | `npm run eval` sin segundo fixture | exit 0, el reporte dice "no ejecutado" |
| T12-1 | `eval/esperados.json` | una sola entrada, sin evidencia (solo proyección) |
| T12-2 | `eval/runs/<hash>.json` | su `engineRunId` es el del run actual y solo hay runs de `eval/publico.json` |
| T12-3 | `eval/primera-corrida.json` | una fecha por `modelId` |

Pasos (plan T12): pruebas (fallan) → `--escribir-esperados` → **PARADA** (§4) → implementar A4 y M13 → `--publicar` → `npm test` y `npm run eval` con exit 0 → commit.

## 7. Alternativas descartadas

- **Commitear `esperados.json` sin revisión** («es la salida del motor»): el archivo sería circular (G2 compararía el motor consigo mismo). La revisión de §4 es lo único que lo ancla a algo ajeno al código del motor.
- **Pedirle la revisión a Casa Mueble:** el primer fixture usa un .dae provisorio y la verdad es el código; el control independiente es el etiquetado ciego (§10), que es otra tarea.
- **Ajustar el motor para que dé 32 + 1 + 6:** la estimación no es criterio (§9.7).
- **Publicar un borrador marcado:** T11-E3 y E2 lo prohíben.

## 8. Decisiones a aprobar

| Id | Pregunta | Propuesta |
|---|---|---|
| T12-E1 | ¿La revisión de `esperados.json` es del equipo (dos personas) y no de Casa Mueble, con el registro de §4.5? | Sí |
| T12-E2 | ¿A4 usa las mismas entradas que el eval (`toListing` + `buildRun`)? | Sí |
| T12-E3 | ¿La revisión incluye leer `eval/out/reporte.md`? | Sí |
| T12-E4 | ¿`mapping.ts` y `checkAssociation` quedan hasta T14? | Sí |
| T12-E5 | ¿El segundo fixture se revisa solo en local, con sus esperados en `Sabrina/eval/`? | Sí |
| §4 | ¿Se aprueba el protocolo de revisión y la parada U-esperados tal como está? | Sí |

## 9. Historial

- **v0.1 (10/11/2026):** borrador, escrito al cerrar T11. Sin implementar.
