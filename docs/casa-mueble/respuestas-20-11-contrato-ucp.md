# Respuestas de Casa Mueble del 20/11/2026 a las consultas sobre el contrato UCP v1 (satélite del Estado)

Informadas por Santiago el 20/11/2026. A archivar: la captura del mensaje. Son datos del dominio, no autorizaciones. Pendiente: volcarlas a `Consultas y respuestas Casa Mueble y cátedra.md`.

## Respuestas
| Consulta | Respuesta de Casa Mueble | Qué cambia |
|---|---|---|
| 1. URLs de QA (parcial) | Este sistema se espera en `taller-qa.casamueble.com.ar` (el frontend del ERP de QA ya se conocía: `https://erp-qa.casamueble.com.ar`). El host de las URLs firmadas del modelo y del CSV sigue sin respuesta | `ERP_BLOB_ORIGENES` queda sin valor. Ver contradicción de dominio abajo |
| 2. Qué significa `trabajo.listo` | El estado refleja el proceso de los archivos: `pending`, `inProgress`, `success`, `failed` (pueden ir en inglés). Siempre hay que indicar la causa cuando falla | El ejemplo "Corte terminado" del contrato no es un evento del taller. `trabajo.listo` equivale a `success` y `trabajo.error` a `failed` |
| 3. Qué es `piezas.csv` | Son los mismos archivos que necesita este sistema; el ERP solo los pasa | La entrada del importador CSV es el CSV de OpenCutList tal cual. Sigue abierta la consulta 58 (exportación con canto definido) |
| 4. `host-erp.html` | Casa Mueble no lo consideró necesario: el contrato y la guía los generó una IA. Pregunta si lo necesitamos | No hace falta: el anfitrión simulado (IE-13) ya cubre esa función. Ver el aviso sobre el contrato abajo |
| 5 (base de datos) | Casa Mueble permite PostgreSQL | Resuelta; ver `claude/decisiones-20-11-contrato-ucp.md` |

## Cambios a la spec v0.3 (para la v0.4)
- **Estados del trabajo (IE-7, IE-8, IE-9):** `pending | inProgress | success | failed`, en lugar de `recibido`. `mensaje` es obligatorio cuando el estado es `failed` y debe decir la causa.
- **ASUMIDO, reversible:** en la pre-entrega, `success` significa que los archivos se recibieron, se verificaron (sha256 y zip válido) y se guardaron. La importación del CSV queda fuera hasta que exista el importador; cuando exista, el trabajo pasa por `inProgress` hasta terminarla.
- **Webhook (IE-14):** `trabajo.listo` se emite al llegar a `success` y `trabajo.error` al llegar a `failed`, con la causa en `mensaje`.
- **Consultas:** quedan resueltas la 2, la 3 y la 4, y la 1 queda parcial. Se suma la consulta nueva del anfitrión (abajo).

## Contradicciones y avisos
- **Dominio:** las instrucciones del proyecto dicen que el equipo monta testing en `taller-test.casamueble.com.ar`. Casa Mueble ahora espera el sistema en `taller-qa.casamueble.com.ar`. No se cambia nada hasta confirmar si son dos entornos (el nuestro de pruebas y el de QA del ERP) o uno solo, y quién lo aprovisiona. El código no depende de este dominio: solo de `ERP_WEB_ORIGEN`.
- **El contrato lo generó una IA** (dato de Casa Mueble). Ya se encontró un error (SQL Server). Hasta que respondan si el lado del ERP está implementado, todo lo que el contrato afirma sobre el ERP real (botón "Enviar a UCP", mensajes del iframe, webhook, URLs firmadas, `tenant.ucp.usar`) se trata como ASUMIDO y se valida en U-erp-real y U-erp-front.
- **SVG:** el contrato solo trae `modelo` y `csv`. La decisión del 17/11 hablaba de CSV con el SVG de cada placa. A consultar si el SVG llega o si hay que generarlo.