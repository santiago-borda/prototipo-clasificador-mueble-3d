# Spec S2 — Enmienda A: la ficha y el visor leen de la base

Versión 0.1 · 18/11/2026 · Estado: **Aprobada por Santiago el 18/11/2026**
Enmienda a: `docs/spec-s2-base-de-datos.md` v0.2 (aprobada el 17/11).
Motivo: decisión del 18/11 (`claude/decisiones-18-11-integracion-erp.md`, decisiones 2 a 4).
Rama sugerida: `s2a-app-lee-base`, desde `fable/s2-base-de-datos`.

> Escrita sin acceso al repositorio. Los nombres de archivos y funciones salen del reporte de S2. Si no coinciden con el código, la sesión los corrige en esta spec antes de implementar y lo informa.

## 1. Objetivo
Que la resolución de un QR (`/p/<qrId>`) y los datos que muestran la ficha y el visor salgan de los repositorios de `src/persistence/`, sin cambio visible para el operario.

## 2. Fuera de alcance
- El importador (`/importar` → `/prueba/<id>`): lo reemplaza el importador CSV, con su propia spec.
- Rediseño de la ficha o del visor.
- `src/engine/` y `src/pdf/`.
- Base no local y despliegue.
- Archivos (.dae, texturas): siguen donde están. Van a S3.

## 3. Requisitos
- **S2A-1. Raíz de composición única.** Un módulo de servidor (propuesto: `src/server/datos.ts`, con `import "server-only"`) elige la implementación del repositorio:
  - con `DATABASE_URL` definida, la de SQL;
  - sin ella, la de memoria, cargada con la misma semilla del Olmo que `db:seed`.

  Es el único lugar fuera de `src/persistence/` y `db/` que importa `src/persistence/sql/`.
- **S2A-2. `lookup.ts` usa el contrato.** La resolución de `qrId` y la carga del tipo de pieza pasan por la función del repositorio que resuelve un QR, la única sin `tenantId`. Las firmas que hoy usan las páginas no cambian, o cambian solo de síncronas a `async`.
- **S2A-3. Sin datos estáticos en la ruta de la ficha.** La ficha y el visor no leen de `src/data/` en tiempo de ejecución. `src/data/` queda solo como fuente de la semilla.
- **S2A-4. QR inexistente o no publicado.** Se comporta igual que hoy (misma página y mismo código HTTP). Si la base no responde, sale un error con nombre (`PersistenciaNoDisponible`), se registra y la página muestra el estado de error existente. Nunca se cae a los datos estáticos en silencio.
- **S2A-5. Frontera de imports actualizada (enmienda a PB-13):**
  - `src/components/`, `src/engine/` y `src/pdf/` siguen sin importar `src/persistence/`.
  - Solo `src/server/` (o el módulo de S2A-1) importa el contrato de `src/persistence/`.
  - Solo S2A-1, `src/persistence/sql/` y `db/` importan la implementación SQL.
  - Ningún módulo de cliente (`"use client"`) importa `src/server/`.

## 4. Pruebas
| Id | Qué verifica | Contra |
|---|---|---|
| PB-14 | Para los 21 tipos del Olmo, los datos que recibe la ficha (el objeto que se pasa al componente) son iguales a los de antes de la enmienda. Se capturan antes de cambiar `lookup.ts` y se comparan después. | memoria y PostgreSQL |
| PB-15 | Los 24 qrId devuelven el mismo destino y el mismo HTTP en `/p/<qrId>`. Un qrId inexistente devuelve lo mismo que hoy. | memoria y PostgreSQL |
| PB-16 | Con la base caída, `/p/<qrId>` muestra el estado de error y no datos estáticos. | PostgreSQL (contenedor detenido o URL inválida) |
| PB-13 (enmendada) | Frontera de imports de S2A-5. | estática |

La captura de PB-14 se hace en un commit propio, antes de tocar `lookup.ts`, para que el diff demuestre que no se ajustó a posteriori.

## 5. Criterio de cierre
- `typecheck`, `lint` y `npm test` en verde en un worktree limpio, con y sin `TEST_DATABASE_URL`. Se informan los dos conteos.
- PB-14 a PB-16 pasan.
- `CLAUDE.md` explica que sin `DATABASE_URL` la app usa la semilla en memoria.
- Prueba manual: `/p/<qrId>` de 3 tipos del Olmo en el celular con la base local, sin diferencias visibles.

## 6. Paradas
- **U-captura:** después del commit de captura de PB-14, informar el conteo y seguir.
- Sin dependencias nuevas. Si hiciera falta una, se para y se pide aprobación.