# Registros de decisión de arquitectura (ADR)

Un ADR por decisión, con: contexto, criterios, opciones, decisión propuesta, consecuencias y cómo revertir.

Estados: **Propuesto** (lo escribió una sesión; no habilita código), **Aceptado** (lo aprobó el equipo), **Reemplazado** (por otro ADR, que se nombra). Un ADR aceptado no se edita: si la decisión cambia, se escribe uno nuevo que lo reemplaza. Las reglas de «Despliegue» de `CLAUDE.md` rigen hasta que un ADR aceptado y su spec las cambien.

| ADR | Decisión propuesta | Estado |
|---|---|---|
| [ADR-001](ADR-001-stack.md) | Seguir con Next.js y TypeScript; dominio puro; nada fuera de los adaptadores depende de Vercel | Propuesto (17/11/2026) |
| [ADR-002](ADR-002-base-de-datos.md) | PostgreSQL; repositorios sobre Kysely, que soporta PostgreSQL y SQL Server | Aceptado (20/11/2026) |
| [ADR-003](ADR-003-almacenamiento-de-archivos.md) | Interfaz `FileStore`; Vercel Blob hoy, S3 o Azure Blob cuando se sepa el alojamiento | Propuesto (17/11/2026) |
| [ADR-004](ADR-004-autenticacion.md) | Sesión del ERP verificada con `whoami` y sesión propia corta; operario sin login, por QR opaco | Propuesto (17/11/2026) |
| [ADR-005](ADR-005-integracion-erp.md) | Enlace desde el ERP, sesión por `postMessage`, lectura por `ErpClient`, contrato OpenAPI propio | Propuesto (17/11/2026) |

Contexto común: `docs/diagnostico-2026-11.md`. Datos pendientes de Casa Mueble: `docs/consultas-casa-mueble-arquitectura.md`.
