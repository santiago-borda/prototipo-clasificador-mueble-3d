# ADR-004: Autenticación con el ERP

**Estado:** Propuesto · **Fecha:** 17/11/2026 · **Deciden:** Santiago Borda y Lautaro Salina

## Contexto
Hoy la lectura es abierta y la escritura del importador pide una clave compartida. No hay usuarios. El ERP sí los tiene: `/api/session/login`, `/refresh` (con `X-CSRF-Token`), `/logout`, `/whoami`, `/tenants` y `/switch-tenant`; JWT Bearer; un tenant por carpintería.

Dos públicos distintos:
- **Backoffice:** quien carga un diseño, revisa las asociaciones dudosas y publica. Trabaja en una computadora y tiene usuario en el ERP.
- **Operario:** escanea un QR con el celular, con las manos ocupadas. No se sabe si tiene usuario en el ERP (consulta CA-4).

Restricciones: el sistema nunca ve ni guarda contraseñas del ERP; el sistema y el ERP están en dominios distintos, así que las cookies del ERP no le llegan; no se sabe cómo firma el ERP sus tokens (CA-3). La regla de `CLAUDE.md` «sin middleware de auth ni cuentas» rige hasta que este ADR y la spec de S4 se acepten.

## Criterios
1. Qué necesita de Casa Mueble para funcionar.
2. Que el sistema no guarde credenciales ni tokens del ERP.
3. Revocación: cuánto tarda en dejar de valer una sesión cerrada en el ERP.
4. Carga sobre el ERP.
5. Que el operario pueda trabajar con las manos ocupadas.

## Cómo validar una sesión del ERP: opciones

| Opción | 1 Qué necesita | 2 Guarda algo | 3 Revocación | 4 Carga |
|---|---|---|---|---|
| **A. Llamar a `/api/session/whoami` con el token** (elegida para empezar) | Nada nuevo: el endpoint existe | No | Inmediata en cada consulta | Una llamada por ingreso |
| B. Validar la firma del JWT | La clave pública o el secreto del ERP, y el formato de los datos del token | Una clave | Hasta que vence el token | Ninguna |
| C. Intercambio de tokens (el ERP emite un token para este sistema) | Un endpoint nuevo en el ERP | No | Según el diseño | Una llamada por ingreso |

La opción B con un secreto compartido se descarta: el sistema podría fabricar tokens del ERP. Solo vale con clave pública.

## Decisión propuesta
1. **El sistema no tiene usuarios propios.** La identidad del backoffice es la del ERP.
2. **Interfaz `SessionVerifier`:** recibe un token del ERP y devuelve `{ userId, tenantId, roles }` o un rechazo con motivo. Implementaciones: por consulta a `whoami` (opción A), de prueba (tokens fijos) y, si Casa Mueble entrega la clave pública, por firma (opción B) sin cambiar a quien la usa.
3. **Sesión propia y corta después de verificar.** El sistema verifica el token una vez, al ingresar, y emite su propia sesión (cookie `HttpOnly`, firmada con `node:crypto`, sin dependencias nuevas) con `userId`, `tenantId`, roles y vencimiento. **El token del ERP no se guarda.** Al vencer, se vuelve a ingresar desde el ERP. Duración propuesta: 30 minutos (ASUMIDO, a ajustar con el uso).
4. **Tenant:** sale siempre de la sesión verificada, nunca de la URL ni del cuerpo del pedido. Una sesión vale para una sola carpintería; cambiar de carpintería en el ERP exige ingresar de nuevo. Una carpintería del ERP se usa solo si está dada de alta en el sistema (lista cerrada a cargo del equipo, ASUMIDO).
5. **Autorización dentro de cada caso de uso de escritura**, con una función común, no en un middleware global. Los repositorios exigen el `tenantId` (ADR-002).
6. **Operario sin usuario en el ERP (ASUMIDO):**
   - **Lee** la ficha y la guía sin iniciar sesión, por un QR con id opaco y no adivinable (aleatorio, 128 bits). El id no contiene el código de la pieza ni la carpintería.
   - **Escribe** solo progreso (paso de armado hecho, corte marcado). Esos registros llevan un identificador de dispositivo aleatorio guardado en el celular y, si lo escribe, un nombre. No son una identidad verificada y así se muestran.
   - Si Casa Mueble responde que los operarios tienen usuario, el progreso puede exigir sesión por un ajuste de la carpintería.
7. **La clave compartida `IMPORT_UPLOAD_KEY` sigue** protegiendo el importador de prueba.
8. **Las credenciales que envíe Casa Mueble** van solo en variables de entorno o en el gestor de secretos del entorno.

## Consecuencias
- Más fácil: integrar con el ERP sin pedirle cambios; auditar quién publicó.
- Más difícil: probar de punta a punta sin el ERP (para eso está la implementación de prueba).
- Si el ERP no responde, nadie puede ingresar al backoffice. Las fichas se siguen leyendo.
- Una sesión cerrada en el ERP sigue valiendo en el sistema hasta 30 minutos.
- Dentro de un iframe los navegadores pueden bloquear la cookie de otro dominio. En ese modo la sesión propia viajaría como encabezado en memoria (ADR-005). Es una razón para empezar con el enlace y no con el iframe.
- El progreso del operario no tiene identidad verificada: sirve para medir tiempos y avance, no para atribuir responsabilidad.

## Cómo revertir
- **Cambiar de A a B o a C:** otra implementación de `SessionVerifier`. Nada más cambia.
- **Exigir sesión al operario:** un ajuste por carpintería; los QR opacos siguen valiendo.
- **Volver a la clave compartida:** el importador de prueba nunca la deja de usar. Las pantallas nuevas del backoffice no tienen ese camino.

## Acciones
1. [ ] El equipo acepta o corrige este ADR.
2. [ ] Enviar CA-3 y CA-4 a Casa Mueble.
3. [ ] S4 implementa el verificador con la implementación de prueba primero. No se llama al ERP de QA sin aprobación del equipo.
