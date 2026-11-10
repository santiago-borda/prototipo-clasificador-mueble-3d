# Especificación — Adapter real de `Observation` y función de `listadoId`

Versión: **v0.2.1 (10/11/2026)**; v0.2 **aprobada** por el equipo (Santiago y Lautaro, 7/11): E1 a E6 como se proponen, con las respuestas de §5. La v0.2.1 solo aclara (§7).
Antecedentes: `docs/spec-motor-asociacion.md` v3 (§3, §4a, §5.1, §5.2, §9.7), `docs/plan-motor-asociacion.md` (T1 a T5), `docs/spec-esquema-pdf.md` §6 y RP9, `docs/spec-sesion-2b-listado-cruce.md` v0.4 (D1, D3, `Listing`), `docs/test-plan-esquema-pdf.md` (TP-40, TP-60, TP-61).
**Es una enmienda, no un diseño nuevo:** el plan del motor ya especifica `listadoId` (T1) y el adapter (T3 y T4) con sus pruebas. Esta spec dice solo qué cambia por lo que dejó la sesión 2b y qué se recorta para la pre-entrega. Si choca con spec-motor v3, manda spec-motor salvo en lo que esta spec enmienda explícitamente (§2.1, §3.2).

---

## 0. Inconsistencias encontradas (resolver o aceptar antes de implementar)

| # | Qué | Dónde | Propuesta |
|---|---|---|---|
| I1 | spec-motor v3 y su plan **ya están en `main`** (commit `31a6e6c`); el Estado los da como "pendiente de commit" | Estado §1 y §4 | Corregir el Estado |
| I2 | `eval/esperados.json` **no depende de la consulta 55**: sale de la primera corrida revisada a mano por el equipo (spec-motor §9.7, plan T12, parada U-esperados). La 55 solo bloquea la concordancia (RF10) | Estado §3 y resumen del chat | Corregir el Estado: la 55 no bloquea la pre-entrega |
| I3 | §5.1 hashea `PieceType` (`edgeBanding: EdgeId[] \| null`). La conversión del PDF produce un tercer valor, `"sin-definir"` (D3). spec-esquema §6 dice "sin cambios" a §5.1 | spec-motor §5.1, spec-esquema §6, RP9 | Enmendar §5.1 (§2.1 de esta spec, decisión E1) |
| I4 | Hay dos normalizadores del código: `src/pdf/code.ts` (`normalizeCode`, ya existe) y el `normalizeName` que el plan T2 crea en `src/engine/`. La prueba de pureza de T2 prohíbe que el motor importe `@/model/`, de donde `code.ts` toma `CODE_FORMAT`. Además difieren en `""`: el PDF lo trata como ausente y el plan como `formato-invalido` | `src/pdf/code.ts`, plan T2 | Una sola regla, en el motor (§3.2, E3) |
| I5 | Las preguntas Q1 a Q7 del plan (sobre todo **Q4**, `modelId` con CRLF) no tienen respuesta registrada | plan §0 | Responderlas antes de T1 (E4) |
| I6 | La spec 2b v0.3 dice que el helper usa "`modelId` el del mueble"; la v0.4 separa `modelId` de `furnitureId`. No pude ver qué valor usa `tests/helpers/observations.ts` (la rama `pdf-sesion-2b` no está en el remoto) | spec 2b §5, helper | Verificarlo al reemplazar el helper (§3.3) |
| I7 | `CLAUDE.md` dice "el `listadoId` de Sabrina no se cambia", pero **no existe ningún `listadoId` calculado ni publicado**: la restricción no protege nada hoy | `CLAUDE.md` | Reformular: "no se publica ningún `listadoId` del segundo fixture hasta resolver PDF-2" |
| I8 | Los hitos del 19/10 al 9/11 del cronograma confirmado no se ejecutaron: quedan 13 días para T1 a T14 | spec-motor §2.3 | Recorte para el 20/11 (§4, E6) |

## 1. Objetivo y alcance

1. `listadoId`: una única función, en el motor, que sirva para el listado del mock y para el que sale del PDF (`ListedPiece`). Destraba **TP-61**.
2. Adapter real: `observeDae(bytes) → DaeObservation` (plan T3 y T4; `{ modelId, observations, lineObjects, referenceBoxMm }`, interfaz del plan T4, aclarado en spec T5, T5-E2), cuyas `observations: Observation[]` reemplazan a `tests/helpers/observations.ts` en TP-40 y TP-40b.

**No es objetivo:** el motor (`associate.ts`, `evidence.ts`, vocabulario), el harness, la publicación ni el visor. Tampoco resolver PDF-2, el marco (consulta 53) ni el módulo (consultas 42 y 44).

## 2. `listadoId`

### 2.1 Enmienda a spec-motor §5.1

Todo §5.1 sigue igual, salvo:

- **Entrada:** filas con la forma `ListadoRow` (abajo), no `PieceType`. `PieceType` (mock) y `ListedPiece` (PDF) son asignables a `ListadoRow`; las claves que sobran (`qrId`, `moduleId`, `rows`) no se serializan.
- **`edgeBanding` tiene tres formas y las tres son distintas en el hash:** lista de `EdgeId` (ordenada, binaria), `null` ("sin dato") y la cadena `"sin-definir"` (columna ausente, D3). Cuando se responda PDF-2, la conversión cambia `"sin-definir"` por `[]` o `null`, y el `listadoId` cambia: es lo correcto, porque cambió el listado.
- **El hash no valida el estado del listado.** Publicar un `AssociationRun` exige `Listing.status = "publicable"` (§2.3).

### 2.2 Contrato

```ts
// src/engine/types.ts (se suma a lo que dejó 2b)
import type { EdgeId } from "@/data/types";            // solo tipo; @/data no trae three ni DOM
export type ListadoEdgeBanding = readonly EdgeId[] | null | "sin-definir";
export interface ListadoRow {
  code: string; name: string;
  lengthMm: number; widthMm: number; thicknessMm: number;
  material: string; quantity: number;
  edgeBanding: ListadoEdgeBanding;
  notes: string | null;
}

// src/engine/hash.ts
export type Sha256Id = `sha256:${string}`;
export function canonicalListado(rows: readonly ListadoRow[]): string;
export function listadoId(rows: readonly ListadoRow[]): Sha256Id;
export function modelId(bytes: Uint8Array): Sha256Id;   // plan T1, según la respuesta a Q4
export function hashFileName(id: Sha256Id): string;     // hex sin prefijo
export class ListadoInvalidoError extends Error {
  constructor(readonly code: string | null, readonly motivo: ListadoInvalidoMotivo) { super(); }
}
type ListadoInvalidoMotivo =
  | "codigo-formato" | "codigo-repetido" | "numero-no-finito" | "medida-no-positiva"
  | "cantidad-no-entera" | "cantidad-no-positiva" | "canto-repetido" | "canto-desconocido";
```

**Aserciones (fallan fuerte, no corrigen):** código canónico (sin `_`; el listado ya viene normalizado), códigos sin repetir, números finitos, medidas > 0, `quantity` entera (`cantidad-no-entera`) y ≥ 1 (`cantidad-no-positiva`), `EdgeId` conocidos y sin repetir. `-0` en una medida se rechaza como `medida-no-positiva` (se prueba). Las cadenas se pasan a NFC, como dice §5.1.

**Dónde corre:** `hash.ts` usa `node:crypto` (plan T1). Solo lo importan el eval y el servidor. Prueba: ningún archivo con `"use client"` ni ningún archivo de `src/pdf/` importa `@/engine/hash` (el cruce sigue importando solo tipos, D1).

### 2.3 Guarda de publicación

```ts
// src/pdf/listing.ts (sin crypto)
export class ListadoNoPublicableError extends Error { constructor(readonly status: "bloqueado" | "borrador") { super(); } }
export function assertPublicable(l: Listing): asserts l is Extract<Listing, { status: "publicable" }>;
```

El eval la llama antes de `--publicar` (plan T11). Con un `borrador` el harness puede calcular el `listadoId` para el reporte, pero no publica: a un borrador le faltan los códigos de `excluded`, y un hash de un listado incompleto no debe quedar como versión publicada.

### 2.4 Pruebas

| Id | Qué | Esperado |
|---|---|---|
| H1–H6 | las de plan T1 (orden, claves fijas, `null` explícito, NFC, `qrId`/`moduleId` fuera, literal calculado aparte) | sin cambios |
| H7 | `"sin-definir"`, `null` y `[]` en la misma fila | tres hashes distintos; `"sin-definir"` serializado como cadena |
| H8 | `ListedPiece` con `rows` | mismo hash que la fila sin `rows` |
| H9 | cada `ListadoInvalidoMotivo` | lanza con su código y motivo |
| H10 | importaciones | ni `"use client"` ni `src/pdf/` importan `@/engine/hash` |
| **TP-61** (reescrita) | `listadoId(toListing(olmo).pieces)` | igual al **literal** escrito en el test (calculado una vez aparte) e igual a `listadoId` de las mismas filas armadas a mano como `ListadoRow`; ninguna función de hash del listado en `src/pdf/`; `createHash` solo se admite en `src/pdf/ocr/gate.ts`, que hashea bytes del PDF |
| TP-61b | `assertPublicable` | lanza con `bloqueado` y `borrador`; no lanza con `publicable` |

TP-61 en su redacción vieja ("mismos `PieceType`") no se puede cumplir: el listado del primer fixture tiene `"sin-definir"`, que `PieceType` no admite.

## 3. Adapter real de `Observation`

### 3.1 Base

Se implementan **T3 (`src/model/daeIndex.ts`) y T4 (`src/model/observe.ts`, `src/model/edgeFaces.ts`, `docs/marco-referencia.md`) tal como están en el plan**, con sus pruebas, sus errores tipados (`DaeStructureError`, `OddEdgeTrianglesError`) y su regla de parar si la prueba del marco v1 falla. `Observation` no cambia (ya está en `src/engine/types.ts`).

### 3.2 Normalizador único (enmienda, E3)

- La regla vive en `src/engine/normalize.ts` (`normalizeName`, plan T2), con el formato del código escrito ahí (el motor no importa `@/model/`).
- `src/pdf/code.ts` deja de tener regex propias: `normalizeCode` llama a `normalizeName` y traduce los estados (`sin-componente`/vacío → `ausente`, `formato-invalido` → `invalido`). **La diferencia en `""` se conserva a propósito y queda escrita:** una celda vacía del PDF es "sin código" (`ausente`); un componente del .dae con nombre vacío es un componente con nombre inválido (`formato-invalido`). `looksLikeCode` usa la misma fuente.
- Prueba: `CODE_FORMAT` de `@/model/ids` y el formato del motor aceptan y rechazan lo mismo sobre la tabla M4 del plan T2 (`tests/engine/normalize.test.ts`); las pruebas actuales de `code.ts` siguen en verde sin cambios.

### 3.3 Reemplazo del helper de prueba

1. TP-40 y TP-40b pasan a `observeDae`. `context.modelId` = `obs.modelId` (el hash del .dae), nunca el `furnitureId` (I6).
2. **Criterio:** los `findings` y `edges` de TP-40 son los mismos que con el helper, salvo diferencias listadas y justificadas en el commit. Son esperables dos: las 6 mallas sin componente (el helper no las veía) y la C01 con `__` (el helper no conservaba el nombre crudo). Si `crossCheck` no está preparado para `rawName: null` o anómalo con datos reales, se para y se avisa: no se filtra en el adapter para que el cruce pase.
3. Se borran `tests/helpers/observations.ts` y `tests/helpers/edgeFaces.ts` (A8 pasa a `edgeRunsOf`, plan T4 paso 4). `tests/helpers/loadModel.ts` queda para las pruebas del visor.
4. TP-40b sigue salteándose si falta `Sabrina/` y no escribe códigos ni cifras del segundo fixture.

### 3.4 Qué consume cada etapa

Para la pasada 1 del motor alcanzan `modelId`, `instanceKey`, `rawName`, `sizeMm` y `axisAligned`; el cruce de 2b usa además `edgeRunsMm`. `orientation`, `centerRel`, `crossesMidplane` y `mirrored` son evidencia blanda (pasada 2). Por eso, si la prueba del marco falla, **T8 (pasada 1) puede seguir** mientras se redefine el marco; la pasada 2 no.

## 4. Orden propuesto para llegar al 20/11 (E6, recorte a decidir)

| Fechas | Tareas del plan | Sale |
|---|---|---|
| 8–10/11 | T1 + T2 (con §2 y §3.2) | `listadoId`, TP-61 en verde, normalizador único |
| 10–12/11 | T3 + T4 (con §3.3) | `observeDae`, helper borrado |
| 12–15/11 | T5; T7 solo verificaciones duras; T8; T10 mínimo | `AssociationRun` de la pasada 1 |
| 15–17/11 | T11 mínimo (casos reales, G2, `--publicar`); T12; T14 | `esperados.json` revisado a mano, run publicado, visor con seguras |
| 18–19/11 | QR impresos (pendiente: consulta 59) y prueba en celular | ensayo de la demo |
| Después | T6, T9, T13, T15 y la pista B | pasada 2, perturbaciones, etiquetado |

**Contradice el cronograma confirmado (spec-motor §2.3):** la pre-entrega prometía el harness con sintéticos y los casos críticos (P1, P3–P8, P10–P12). Con este recorte, el 20/11 muestra la pasada 1 y G2; las perturbaciones pasan a después. Requiere decisión del equipo antes de aplicarlo.

## 5. Decisiones a aprobar

| Id | Pregunta | Propuesta |
|---|---|---|
| E1 | ¿Se enmienda §5.1 para admitir `"sin-definir"`? | Sí, como cadena distinta de `null` y `[]` (§2.1) |
| E2 | ¿Se publica un run con listado `borrador`? | No: `assertPublicable` antes de `--publicar` (§2.3) |
| E3 | ¿Un solo normalizador? | Sí, en el motor; `code.ts` lo envuelve y conserva la diferencia en `""` (§3.2) |
| E4 | Q1–Q7 del plan, en especial Q4 | Tomar los "por defecto" del plan (Q4: `\r\n` → `\n` antes de hashear, más `.gitattributes`) salvo objeción |
| E5 | ¿Se reformula la regla de `CLAUDE.md` sobre el `listadoId` del segundo fixture? | Sí (I7) |
| E6 | ¿Se acepta el recorte del §4? | A decidir por el equipo |

**Decisiones del equipo (7/11, Santiago y Lautaro):**

| Id | Decisión |
|---|---|
| E1 a E5 | Aprobadas como se proponen |
| E6 | Recorte del 20/11 aprobado (§4) |
| Q4 | `modelId` = `sha256` de los bytes con `\r\n` → `\n` antes de hashear, más `.gitattributes` con `*.dae binary` en el mismo commit que `git add --renormalize .` |
| Q1 a Q3, Q5 a Q7 | Los "por defecto" del plan (`docs/plan-motor-asociacion.md` §0) |

## 6. Trazabilidad

| Requisito | Prueba | Tarea del plan |
|---|---|---|
| §5.1 enmendado, RP9 | H1–H9, TP-61 | T1 |
| D1 (dependencia `pdf` → `engine`, sin crypto en `pdf`) | H10 | T1 |
| INV-14 / publicación | TP-61b | T11 |
| §6.1 y §7.1 de spec-esquema (una regla) | M4 + pruebas de `code.ts` | T2 |
| §4a y §5.2 (adapter) | pruebas de T3 y T4 | T3, T4 |
| TP-40, TP-40b con datos reales | §3.3 | T4 |

## 7. Historial

- **v0.1 (7/11/2026):** borrador. Enmienda §5.1 (`ListadoRow`, `"sin-definir"`), guarda de publicación, normalizador único, reemplazo del helper y recorte para el 20/11.
- **v0.2 (7/11/2026):** aprobada. E1 a E6 aprobadas (recorte del 20/11 incluido); Q4 con normalización `\r\n` → `\n` y `.gitattributes`; Q1 a Q3 y Q5 a Q7 por defecto del plan. Ajustes del equipo (7/11) al implementar: (1) TP-61 admite `createHash` solo en `src/pdf/ocr/gate.ts` (hashea bytes del PDF, no el listado; `pdfIdOf` no se mueve); (2) motivo nuevo `cantidad-no-positiva` (`quantity < 1`), `cantidad-no-entera` queda para no enteros; (3) se quita "`-0` se serializa como `0`": `-0` en una medida se rechaza como `medida-no-positiva`.
- **v0.2.1 (10/11/2026):** sin cambios de fondo. §1: `observeDae` devuelve `DaeObservation` (spec T5, T5-E2, aprobada el 10/11). §5 y §7: el `\r\n` de Q4 había quedado como saltos de línea reales; se escribe como texto.
