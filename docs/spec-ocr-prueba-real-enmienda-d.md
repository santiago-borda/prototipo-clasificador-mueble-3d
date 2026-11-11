# SPEC-B2, enmienda D: validación con un segundo PDF real

| Campo | Valor |
|---|---|
| Estado | **APROBADA v0.2** (11/11/2026), aprobada por el equipo y el profesor, informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar: D-1 a D-4, E-1 (`--paginas <n>`, opción E-1a) y E-2 (la compuerta sigue antes de la caché), OR-19 a OR-21. Aplicada en SPEC-B2 v0.4 |
| Enmienda a | `docs/spec-ocr-prueba-real.md` (SPEC-B2) v0.3 (queda en v0.4): §1, §2, §5, §6, §12, §12b y §14 |
| Origen | Protocolo de validación de `docs/spec-revision-ocr-real.md` §7, aprobado (decisión 6 del 10/11) |
| Regla de datos | Ni este documento ni ningún archivo versionado escriben el hash, el nombre de archivo, el texto, los códigos ni las medidas de los PDF reales |

## 1. Qué permite

| Id | Regla vigente (SPEC-B2) | Enmienda |
|---|---|---|
| D-1 | §1: "**un único PDF real**"; cualquier otro PDF real queda fuera del alcance | Se admite un **segundo** PDF real: el Blanco 18 del segundo fixture, para la validación 1 de spec-revision-ocr-real §7. Cualquier otro PDF real (incluido el primer fixture) sigue fuera del alcance y necesita su propia enmienda |
| D-2 | §5: la lista blanca admite **una sola entrada** (`lista-blanca-multiple`) | **Se mantiene.** Para correr un PDF, la persona **reemplaza a mano el hash** de su lista local por el del PDF que va a correr, antes de la corrida. Nunca hay dos hashes en la lista |
| D-3 | §12: registro de la lista blanca | Cada reemplazo de hash se registra en §12 (fecha, quién, qué PDF se habilita **por descripción**, por ejemplo "Blanco 18 del segundo fixture", y cuál se quita). Sin hash |
| D-4 | §12b: registro de corridas | La corrida de validación se registra con "Para qué cuenta: validación 1" y con la versión del parser congelada (§3) |

**Autorización:** Casa Mueble autorizó el envío de los PDF de OpenCutList del segundo fixture (SPEC-B2 §3; reconfirmado el 10/11). **P-04 sigue sin archivar.** Esta enmienda no cambia eso: la lista blanca decide qué PDF sale.

## 2. Consecuencias del hash único

- **La compuerta va antes que la caché** (SPEC-B2 §4: paso 4 antes del paso 5). Con el hash del Blanco 18 en la lista, el script **no puede releer** la respuesta guardada del Cedro 18, aunque no use la red: la compuerta lo rechaza (`compuerta`).
- Para volver a una corrida de desarrollo con el Cedro 18 hay que volver a poner su hash, y registrar el cambio (D-3).
- **Decisión (E-2, aprobada el 11/11/2026):** dejar este orden como está. Es la regla de §4 y la que prueba OR-13. Saltear la compuerta para leer la caché sería una excepción nueva a fail-closed.

## 3. Condiciones para correr la validación

1. **Reglas congeladas:** las reglas de spec-revision-ocr-real §4 están implementadas y commiteadas. La corrida usa ese commit, sin cambios locales, y su `readerVersion` identifica la versión del parser.
2. **Transcripción hecha antes de la corrida:** el `CutListPdf` manual del Blanco 18 vive en `Sabrina/ocr-real/` (local, ignorado) y se termina **antes** de ver la salida del OCR, para no transcribir lo que leyó la máquina.
3. **Una sola corrida, sin ajustes posteriores:** si la corrida muestra un problema, no se cambia ninguna regla para que "pase". El hallazgo va a una revisión nueva, esta corrida pasa a contar como desarrollo y la validación siguiente es el primer fixture (otra enmienda).
4. **Sin `--reenviar`:** una sola salida del PDF a Vision por validación.

## 4. Aceptación

| Resultado | Cuenta como |
|---|---|
| `lectura: leído` y, con transcripción, `distintos-sin-pending = 0` | **Pasa** la validación 1 |
| `lectura: leído` y `distintos-sin-pending > 0` | **No pasa**: un valor mal leído llegó sin aviso |
| `lectura: rechazado (...)`, con `regla` y `página` | **No generaliza**: es un resultado válido de la prueba, pero no una medición; no equivale a `distintos-sin-pending = 0` |
| `comparación: comparacion-desalineada` | **No pasa** como medición; se registra |

Toda fila sigue `dudosa` por `origen-ocr`. Esta validación no cambia ningún nivel.

## 5. Páginas: cambio necesario en el script (E-1, aprobada: E-1a)

- El Blanco 18 tiene **3 páginas** (spec-esquema §2). El script pide siempre `pages: [1, 2, 3, 4, 5]` (`REQUESTED_PAGES`, `scripts/ocr-real/run.ts`).
- **No está verificado** qué hace `files:annotate` cuando se piden páginas que el PDF no tiene: puede ignorarlas, devolver error por página o rechazar el pedido. Si rechaza, el PDF ya habría salido (SPEC-B2 §6, límite conocido) y el script daría `proveedor-error`.

| Opción | Cómo | Riesgo |
|---|---|---|
| E-1a (**aprobada**) | Argumento obligatorio `--paginas <n>`, con 1 ≤ n ≤ 5. El pedido lleva `pages: [1..n]` y el script se niega si `totalPages ≠ n` (`paginas-no-confirmadas`) o si n > 5 (`paginas-excedidas`). La persona declara cuántas páginas tiene el PDF, y Vision lo confirma después | Cambia `scripts/ocr-real/` (no `src/`) y sus pruebas (OR-06, OR-07): implementado después de la aprobación. El valor de n lo declara una persona, pero un error ahí da rechazo, no lectura |
| E-1b (descartada) | Dejar `[1..5]` y ver qué responde Vision | Una corrida de validación gastada en averiguar el comportamiento del proveedor; posible `proveedor-error` con el PDF ya enviado |

## 6. Pruebas a agregar a SPEC-B2 (aprobadas, con E-1a)

| Id | Caso | Esperado |
|---|---|---|
| OR-19 | `--paginas` ausente, 0, 6 o no entero | Rechazo antes de la red (`entrada-invalida` o `paginas-excedidas`); 0 llamadas al cliente. **Precisión de redacción, sin cambio de criterio (informadas al equipo por Santiago el 11/11/2026):** `entrada-invalida` para ausente, repetida, no entero o menor que 1; `paginas-excedidas` para mayor que 5 |
| OR-20 | `--paginas 3` con respuesta simulada de 3 páginas; y con `totalPages` 5 | El pedido lleva `pages: [1, 2, 3]`; con 5, `paginas-no-confirmadas` y ningún archivo escrito. **Precisión de redacción, sin cambio de criterio (informadas al equipo por Santiago el 11/11/2026):** un `totalPages` mayor que 5 sigue dando `paginas-excedidas` (SPEC-B2 §6 v0.3) aunque no coincida con n |
| OR-21 | Lista blanca con el hash de otro PDF y respuesta guardada del primero | `compuerta`; la caché no se lee (documenta §2) |

## 7. Qué no cambia

- Un hash por vez en la lista blanca, fuera del repo; `lista-blanca-multiple` se mantiene.
- Salidas solo en `.ocr-data/real/`; consola solo con conteos, `regla` y `página`.
- La corre una persona con su clave, nunca Claude Code ni CI.
- Sin dependencias nuevas; sin cambios en `src/`.

## 8. Recomendación de Santiago (10/11/2026) y aprobación (11/11/2026)

Santiago recomienda **aceptar E-1 (`--paginas`, E-1a) y E-2 (la compuerta va antes de la caché)**. Era una recomendación; **el 11/11/2026 el equipo y el profesor aprobaron la enmienda con E-1 (E-1a) y E-2** (informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar). Consecuencia práctica de E-2: para releer la respuesta guardada del Cedro 18 hay que **restituir su hash en la lista blanca** (y registrar el cambio, D-3), porque con el hash del Blanco 18 la compuerta rechaza.

## 9. Qué se aprobó (11/11/2026)

1. D-1 a D-4.
2. E-1: `--paginas` (E-1a, recomendada) o dejar el pedido fijo (E-1b).
3. E-2: mantener la compuerta antes de la caché.
4. OR-19 a OR-21 (con E-1a).
5. Cuándo se corre: después de implementar y congelar las reglas de spec-revision-ocr-real §4 (§3, condición 1). La corrida de validación **no** la hace Claude Code: la hace Santiago en su consola, con el hash del Blanco 18 reemplazado a mano en su lista (D-2) y registrado (D-3).

## Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 10/11/2026 | Borrador: segundo PDF (Blanco 18), reemplazo del hash único, registro, condiciones, aceptación, páginas (E-1) y orden compuerta-caché (E-2) |
| 0.1 | 10/11/2026 | Se anota (§8) la recomendación de Santiago de aceptar E-1 y E-2. Sigue sin aprobar |
| 0.2 | 11/11/2026 | **APROBADA**, aprobada por el equipo y el profesor, informado por Santiago el 11/11/2026; evidencia: respuestas al mensaje de aprobación, a archivar: D-1 a D-4, E-1 (E-1a, `--paginas <n>`), E-2 y OR-19 a OR-21. Dos precisiones de redacción en §6 (códigos de rechazo de OR-19 y de OR-20), informadas al equipo por Santiago el 11/11/2026, sin cambio de criterio. Aplicada en SPEC-B2 v0.4 |
