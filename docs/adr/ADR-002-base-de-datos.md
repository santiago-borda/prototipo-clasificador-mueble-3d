# ADR-002: Base de datos y capa de acceso

**Estado:** Aceptado el 20/11/2026 (a pedido de Santiago Borda; propuesto el 17/11/2026) · **Fecha:** 17/11/2026 · **Deciden:** Santiago Borda y Lautaro Salina

## Contexto
Hoy no hay base de datos. Las fichas salen de un archivo del código y las importaciones son archivos JSON en Vercel Blob. El producto necesita guardar, por carpintería, lo que describe `docs/modelo-de-datos.md`.

- Hay que elegir entre PostgreSQL y SQL Server.
- **No se sabe qué motor usa el ERP ni dónde se aloja** (consulta CA-2). Si la API es .NET, SQL Server es probable, pero no está confirmado.
- El sistema tiene su propia base; no escribe en la del ERP (ASUMIDO).
- El equipo necesita una base local en un contenedor y pruebas que corran sin red.

## Criterios
1. Motor que usa el ERP (dato pendiente).
2. Dónde se aloja y quién lo opera.
3. Costo.
4. Experiencia del equipo.
5. Soporte de la capa de acceso para los dos motores.

## Motor: opciones

| Opción | 1 ERP | 2 Alojamiento | 3 Costo | 4 Equipo |
|---|---|---|---|---|
| **A. PostgreSQL** (ASUMIDO) | Sin dato | Contenedor oficial; servicios administrados en cualquier proveedor | Sin licencia | Media |
| B. SQL Server | Probable, sin confirmar | Contenedor oficial; natural si se aloja junto al ERP | La edición gratuita limita el tamaño de la base; las demás se licencian | Baja |
| C. Sin base (archivos JSON) | No aplica | El de los archivos | Ninguno | Alta |

La opción C se descarta: sin consultas, unicidad ni transacciones no hay QR únicos ni progreso de armado.

## Capa de acceso: opciones
Requisito de esta sesión: que la capa soporte los dos motores, justificado con documentación oficial (consultada el 17/11/2026).

| Opción | PostgreSQL | SQL Server | Fuente | Observaciones |
|---|---|---|---|---|
| **Kysely** (elegida) | Dialecto del núcleo, con el controlador `pg` | Dialecto del núcleo (`MssqlDialect`), con `tedious` y `tarn` | kysely.dev/docs/dialects y /docs/getting-started | Constructor de consultas tipado. Pide TypeScript 5.4 o superior (el repo usa 5.9.3) y modo estricto. Migraciones propias en TypeScript, con bloqueo en la base para que no corran dos veces. |
| Prisma | Versión 8: «release candidate» | Versión 8: «coming soon»; la 7 sí lo soporta | prisma.io/docs/orm/reference/supported-databases | Hoy la versión vigente no cubre los dos motores. Suma un generador de código y un formato propio de esquema. |
| Drizzle | Sí | Figura MSSQL en la documentación | orm.drizzle.team/docs/get-started | La página anuncia la versión 1.0 en beta y no dice el estado del soporte de MSSQL. |
| SQL a mano con `pg` | Sí | No (habría que reescribir todo con otro controlador) | — | La menor cantidad de dependencias, pero no cumple el requisito de los dos motores. |

## Decisión
1. **Motor: PostgreSQL.** Casa Mueble respondió el 20/11/2026 que permite PostgreSQL (consulta 5 de `docs/casa-mueble/respuestas-20-11-contrato-ucp.md`); el «SQL Server» del contrato UCP v1 fue un error del documento, que generó una IA. Si más adelante Casa Mueble quiere operar una sola base con el ERP en SQL Server, se cambia con el procedimiento de «Cómo revertir». **Alojamiento: Neon, temporal para la demo** (decisión de Santiago del 21/11/2026; Neon ya está conectada a su proyecto de Vercel). Cómo se migra y se siembra: `docs/spec-s2b-base-remota-neon.md` (`db:migrate:remota` y `db:seed:remota`, con el host confirmado y TLS). Dónde se aloja la base definitiva sigue abierto.
2. **Capa de acceso en dos niveles:**
   - **Repositorios:** interfaces de TypeScript que usan los casos de uso. No exponen SQL ni tipos de Kysely. Cada una tiene una implementación en memoria (para las pruebas) y una en SQL.
   - **Kysely** dentro de la implementación en SQL, con el dialecto elegido por configuración (`PostgresDialect` o `MssqlDialect`).
3. **Subconjunto común de SQL.** Para que el cambio de motor sea real y no teórico:
   - Identificadores generados en la aplicación (`crypto.randomUUID()`), guardados como texto. Sin secuencias ni tipos propios de un motor.
   - Documentos (resultado del motor, listado completo) guardados como **texto JSON**, que el repositorio serializa y valida. No se usa `jsonb`: SQL Server no lo tiene. Si más adelante hace falta consultar dentro del documento, se promueve ese dato a columna.
   - Fechas en UTC. Medidas en milímetros como número de doble precisión (el mismo tipo que usa el motor en memoria).
   - Las migraciones usan el constructor de esquema de Kysely. Un fragmento de SQL propio de un motor solo se admite detrás de una función con una rama por dialecto.
4. **Separación por carpintería en cada tabla:** columna `tenant_id` obligatoria, claves foráneas compuestas con `tenant_id` y `tenantId` como primer parámetro de cada función de repositorio. Única excepción: resolver un QR opaco, que es la puerta de entrada y devuelve la carpintería.
5. **Una misma batería de pruebas de contrato** corre contra la implementación en memoria y contra PostgreSQL. Queda preparada para correr contra SQL Server.
6. **Las versiones de diseño y los QR son inmutables.** Una versión nueva es una fila nueva.

## Consecuencias
- Más fácil: cargar un mueble sin commit; unicidad real de QR; consultas por carpintería; cambiar de motor.
- Más difícil: un servicio más para operar y respaldar; las pruebas contra la base necesitan Docker (se saltean si no hay base, como las del segundo fixture).
- Se renuncia a funciones propias de PostgreSQL (`jsonb`, seguridad por fila) mientras el motor no esté confirmado. Se pueden sumar después como refuerzo.
- Dependencias nuevas a aprobar en S2: `kysely`, `pg` y `@types/pg`. Para SQL Server serían `tedious` y `tarn`.
- Cambia una regla de `CLAUDE.md`: «sin base de datos» deja de valer cuando este ADR y la spec de S2 se acepten.

## Cómo revertir
- **De PostgreSQL a SQL Server:** cambiar el dialecto en la configuración, instalar `tedious` y `tarn`, correr las migraciones en una base vacía de SQL Server y pasar la batería de contrato. Si hay datos, se exportan e importan por los repositorios (un script que lee de una implementación y escribe en la otra). El costo crece con cada fragmento de SQL propio de un motor: por eso la regla 3.
- **Sacar Kysely:** los casos de uso no lo conocen. Se reescribe solo la implementación en SQL de los repositorios.
- **Antes de producción** no hay datos que migrar: el cambio es casi gratis hasta entonces. Conviene tener la respuesta de CA-2 antes del primer despliegue con datos reales.

## Acciones
1. [x] El equipo acepta o corrige este ADR. Aceptado el 20/11/2026.
2. [x] Aprobar las dependencias `kysely`, `pg` y `@types/pg` (spec de S2, parada U-dependencias). Aprobadas por Santiago el 17/11/2026; `kysely` en 0.28.x (la 0.29 pide Node 22).
3. [x] CA-2 (motor de la base): respondida por Casa Mueble el 20/11/2026, permite PostgreSQL. Alojamiento de la demo: Neon, temporal (21/11/2026); el definitivo, abierto.
