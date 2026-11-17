# Diagnóstico del repositorio — noviembre de 2026

Fecha: 17/11/2026 · Sesión 1 (rama `fable/s1-diagnostico-arquitectura`) · Estado: **propuesta, a aprobar por el equipo**.
Esta sesión no escribe código de producción. Documentos relacionados: `docs/adr/` (ADR-001 a ADR-005), `docs/modelo-de-datos.md`, las specs `docs/spec-s2-…` a `docs/spec-s6-…` y `docs/consultas-casa-mueble-arquitectura.md`.

## 1. Resumen

El repositorio tiene un núcleo sólido y probado (motor de asociación, esquema del PDF, lectura del .dae, visor y ficha) rodeado de andamios de prototipo (datos en el código, clave compartida, almacenamiento sin separación por carpintería). El operario hoy puede ver una ficha y el 3D de **un** mueble cargado a mano. No puede seguir un armado ni marcar cortes, y ningún mueble nuevo llega a su celular sin un commit del equipo. Eso es lo que más lo bloquea, y lo destraban las sesiones S2 a S6.

## 2. Estado real

| Parte | Dónde | Estado |
|---|---|---|
| Ficha de pieza, módulo y mueble | `/p/<qrId>`, `src/components/` | Funciona con datos fijos en `src/data/furniture.mock.ts`. Páginas estáticas. |
| Visor 3D | `src/components/viewer/`, `src/model/` | Funciona con el .dae original. Optimizado para celular (~700 triángulos, dibujo a demanda). |
| Escáner y hoja de QR | `/escanear`, `/qr` | Funcionan. Los QR apuntan a una URL que no es la definitiva (consulta 59). |
| Importador de prueba | `/importar`, `/prueba/<id>`, `src/importer/` | Funciona. Cuatro archivos por importación en Vercel Blob privado. Escritura con clave compartida. |
| Motor de asociación | `src/engine/`, `src/model/{daeIndex,observe}.ts`, `eval/` | Pasada 1 y corrida mínima hechas (T1 a T11). T12 está a medio hacer en archivos locales sin commitear. |
| Esquema del PDF de cortes | `src/pdf/` | Validador, parser, listado y cruce con el .dae hechos. La lectura real por OCR está bloqueada (P-02, P-12). |
| Carga por CSV | `src/proto-csv/`, `/backoffice/csv` | Spike hecho y probado en la preview. No se mergea a `main`. |
| Pruebas | `tests/` | 768 pasan con el árbol commiteado. En esta máquina fallan 4 por archivos locales (ver A8). |

No existe: guía de armado, check de cortes, base de datos, usuarios, separación por carpintería ni vínculo con el ERP. No hay spec de la guía de armado.

## 3. Qué se conserva y qué es descartable

### Se conserva (es el producto)

| Parte | Por qué |
|---|---|
| `src/engine/` (motor) | Código puro, determinista, con contratos versionados y pruebas (M3, H10). Es la diferencia con el ERP, que pierde 9 de 21 códigos del primer fixture. |
| `src/model/daeIndex.ts`, `observe.ts`, `edgeFaces.ts` | Leen el .dae original, incluidos los componentes dentro de grupos. |
| `src/pdf/` (esquema, validador, listado, cruce, nivel) | Código puro y probado. La entrada (PDF por OCR o CSV) todavía se decide, pero el listado y el cruce no cambian. |
| Visor 3D y ficha (`src/components/`, `src/model/` del visor) | Es lo que usa el operario. Las reglas de rendimiento en celular están medidas. |
| `ImportStore` y sus tres implementaciones | Es la base de la interfaz de archivos (ADR-003). |
| Módulos puros del importador (`listing`, `buildDef`, `dims`, `report`) | Validan en el navegador y en el servidor con el mismo código. |
| Las pruebas y la forma de trabajo (spec → código → prueba) | Sostienen todo lo anterior. |

### Descartable (andamio del prototipo)

| Parte | Qué lo reemplaza | Cuándo |
|---|---|---|
| `src/data/furniture.mock.ts` como fuente de datos | Base de datos (queda como fixture de pruebas) | S2 prepara; el cambio visible, después |
| `src/data/mapping.ts` (asociación simulada) | El motor (plan del motor, T14) | Fuera de S2 a S6 |
| Registro en variables de módulo (`src/lib/lookup.ts`) y muebles importados registrados solo en el navegador | Repositorios en el servidor | Después de S2, con spec propia |
| Clave compartida `IMPORT_UPLOAD_KEY` | Sesión del ERP | S4 |
| qrId predecibles (`olmo-c04`) y QR de mueble y de módulo | QR opacos, solo de pieza | Con el dominio definido (consulta 59) |
| Importador de prueba y spike de CSV, como pantallas | Importador real (spec aparte) | Sin fecha: su comportamiento visible no cambia por ahora |
| Carga del segundo fixture por variable de entorno y carpeta ignorada | Carga normal por carpintería | Con S2 y S3 |

## 4. Deuda técnica y atascos, ordenados por cuánto bloquean al operario

| # | Problema | Efecto en el operario | Bloqueo | Lo resuelve |
|---|---|---|---|---|
| A1 | No hay guía de armado ni spec. No se sabe de dónde sale el orden de armado. | No tiene la función principal que promete el sistema. | Total | S6 y la consulta CA-9 |
| A2 | Cada mueble se carga con un commit y un despliegue. | Solo ve el primer fixture. Ningún mueble real de la carpintería llega a su celular. | Total | S2, S3 y el importador real |
| A3 | No hay check de cortes; su formato depende de Casa Mueble (R4, consultas 35 a 37). | No puede marcar piezas cortadas. | Total para esa función | Respuestas de Casa Mueble; S6 deja el modelo listo |
| A4 | No se pueden imprimir QR: el dominio de producción no está definido (consulta 59). | No hay etiquetas reales en el taller. | Total para el uso real | Casa Mueble |
| A5 | La lectura real del PDF de cortes está bloqueada (P-02, P-12) y el CSV espera la decisión de Casa Mueble. | El canteado de un mueble nuevo no se puede cargar sin transcribir a mano. | Alto | Decisión CSV o PDF; fuera de S2 a S6 |
| A6 | La ficha muestra el canto 0,45 mm (descartado; el confirmado es 0,22) y profundidad 550 mm (el .dae mide 571). | Lee un dato equivocado. | Medio (un dato) | Propuesta P1 (§6) |
| A7 | Sin conexión no hay ficha. El taller tiene wifi o datos móviles irregulares. | La pantalla no carga en zonas sin señal. | Medio | Propuesta P4 (§6) |
| A8 | En esta máquina `npm test` da 4 fallas: R4 y R6 de `tests/eval/runner.test.ts`, T12-2 y T12-3 de `tests/eval/t12.pendiente.test.ts`. Las causan `eval/esperados.json` (sin commitear) y scripts en `eval/out/` (ignorada). | Ninguno directo. Frena al equipo: la suite local no está en verde. | Bajo | Cerrar T12; que R6 ignore `eval/out/` |
| A9 | Tres líneas de trabajo sin integrar: T12 a medio hacer, el spike de CSV (20 commits delante de `main`) y el PR #12 de dependencias. | Ninguno directo. | Bajo | Decisión del equipo (§7) |
| A10 | `ESTADO.md` es del 5/11 y contradice a `CLAUDE.md` (ubicación de la clave de Google; no menciona el motor ni el spike). | Ninguno. | Bajo | Actualizarlo o reemplazarlo por un puntero |
| A11 | Sin separación por carpintería ni responsables por acción. | Ninguno hoy. Impide abrir el sistema a una segunda carpintería. | Bajo hoy, total para producción | S2, S3 y S4 |
| A12 | `@google-cloud/vision` está en `dependencies` y solo la usa un script manual. | Ninguno. | Mínimo | Evaluar moverla a `devDependencies` |

## 5. Arquitectura objetivo (resumen)

Un solo sistema desplegable, modular por dentro. Todo lo externo entra por una interfaz con una implementación real y otra de prueba.

```
Celular del operario ──▶ Fichas, visor y armado (lectura por QR opaco)
ERP de Casa Mueble ───▶ Backoffice (escritura, con sesión del ERP)
                               │
                 Casos de uso (TypeScript puro)
          ┌────────────┬───────┴──────┬──────────────┐
     Repositorios   Archivos      Sesión         Cliente del ERP
     (PostgreSQL)   (FileStore)   (verificador)  (solo lectura)
```

| Tema | Decisión propuesta | Documento |
|---|---|---|
| Stack | Seguir con Next.js y TypeScript. El dominio queda en módulos puros y nada fuera de los adaptadores depende de Vercel. | ADR-001 |
| Base de datos | PostgreSQL (ASUMIDO hasta saber el motor del ERP). Capa de acceso: repositorios sobre Kysely, que compila para PostgreSQL y SQL Server. | ADR-002 |
| Archivos | Interfaz `FileStore`, claves por carpintería y por sha256. Adaptadores: local, memoria y Vercel Blob; S3 o Azure Blob cuando se sepa el alojamiento. | ADR-003 |
| Autenticación | El backoffice valida la sesión del ERP con `/api/session/whoami` y emite una sesión propia corta. El operario lee por QR opaco, sin login (ASUMIDO). | ADR-004 |
| Integración | El ERP abre el sistema con un enlace y entrega la sesión por `postMessage`. El sistema lee los documentos por una capa propia y publica un contrato OpenAPI. No escribe en el ERP. | ADR-005 |
| Datos | Diecisiete entidades, todas separadas por carpintería; el módulo es propio y opcional; los QR son inmutables y apuntan a una versión de diseño. | `modelo-de-datos.md` |

## 6. Propuestas para más adelante (cambian lo que ve el usuario; no se hacen ahora)

- **P1.** Corregir en la ficha el canto a 0,22 mm y resolver la profundidad 550 contra 571 mm.
- **P2.** Quitar los QR de mueble y de módulo de `/` y `/qr` cuando se resuelva la consulta 44.
- **P3.** Servir las fichas desde la base de datos en lugar de páginas estáticas.
- **P4.** Que la última ficha vista quede guardada en el celular para zonas sin señal.
- **P5.** Enlace «Armar este mueble» en la ficha de la pieza (lo necesita S6; ver su parada).

## 7. Decisiones que necesita el equipo

1. Aceptar o corregir ADR-001 a ADR-005 y el modelo de datos.
2. Aprobar las specs S2 a S6 (cada una tiene sus paradas).
3. **Rama base de S2.** `main` no tiene el spike de CSV ni la hoja de ruta. Esta sesión dejó sus commits sobre la rama del spike para no tocar cambios locales ajenos. Recomendación: llevar los documentos de la Sesión 1 a una rama que salga de `main` (son solo `docs/` y `CLAUDE.md`) y partir de ahí.
4. Qué hacer con T12 a medio hacer y con `ESTADO.md` (A8 a A10).
