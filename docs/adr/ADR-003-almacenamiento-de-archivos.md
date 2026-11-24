# ADR-003: Almacenamiento de archivos

**Estado:** Propuesto · **Fecha:** 17/11/2026 · **Deciden:** Santiago Borda y Lautaro Salina

## Contexto
El sistema guarda archivos que no son filas. Principalmente **imágenes** (texturas de las placas, y fotos o capturas de los pasos de armado), además del .dae original, el zip del modelo que entrega el ERP y los PDF.

Hoy el importador de prueba guarda en **Vercel Blob privado**, detrás de la interfaz `ImportStore` (`src/importer/store.ts`), con tres implementaciones: Blob, disco local y memoria. El spike de CSV usa el mismo almacenamiento con otro prefijo.

- El comportamiento visible de `/importar` y `/prueba/<id>` no cambia.
- Los archivos son de clientes de una carpintería: privados y separados por carpintería.
- `modelId` ya es el sha256 del .dae.
- No se sabe dónde se aloja producción (consulta CA-1).
- El ERP convierte el .dae a GLB y pierde códigos en el camino: el sistema necesita el .dae original.

## Criterios
1. Sin cambio visible en el importador de prueba.
2. Portabilidad entre proveedores.
3. Adaptador local para desarrollo y pruebas sin red.
4. Costo y dependencias nuevas.
5. Privacidad y separación por carpintería.

## Opciones consideradas

| Opción | 1 Sin cambio | 2 Portabilidad | 3 Local | 4 Costo y dependencias | Observaciones |
|---|---|---|---|---|---|
| **A. Interfaz `FileStore` con Vercel Blob hoy** (elegida) | Sí | Por interfaz | Disco y memoria, ya existen | Ninguna dependencia nueva. Plan gratuito (cifras sin verificar en la documentación) | Natural mientras el despliegue sea Vercel |
| B. Compatible con S3 desde ahora | Hay que rehacer la subida directa | Alta: muchos proveedores | Requiere un servicio extra en local | Dependencia nueva | Resuelve un problema que todavía no existe |
| C. Azure Blob desde ahora | Hay que rehacer la subida directa | Solo Azure | Requiere un emulador | Dependencia nueva | Natural si el ERP (.NET) se aloja en Azure: sin confirmar |
| D. Archivos dentro de la base de datos | Hay que rehacer la subida directa | La de la base | Sí | Ninguna | Agranda la base y sus respaldos; servir imágenes desde la base es lento |

## Decisión propuesta
1. **Una interfaz `FileStore`** que generaliza `ImportStore` (guardar sin sobrescribir, leer, listar, borrar). Adaptadores: **disco local** para desarrollo, **memoria** para las pruebas y **Vercel Blob** mientras el despliegue sea Vercel.
2. **El adaptador de S3 o de Azure Blob se escribe cuando se conozca el alojamiento** (CA-1). La interfaz se diseña para que los tres proveedores la cumplan: solo usa operaciones que todos tienen (objeto por clave, listado por prefijo, borrado, subida directa con permiso temporal).
3. **Clave por carpintería y por contenido:** `t/<tenantId>/archivos/<sha256>`. El mismo archivo subido dos veces ocupa una vez. Nunca se sobrescribe.
4. **Los metadatos van a la base** (entidad `archivo` de `docs/modelo-de-datos.md`): nombre original, tipo, tamaño, sha256, quién lo subió y cuándo. El almacenamiento solo guarda bytes.
5. **Siempre privado.** Un archivo se sirve por una ruta del servidor que comprueba el permiso, comprueba el sha256 y fija el tipo de contenido y las cabeceras seguras (como hoy en el spike de CSV).
6. **Se guarda el original** (.dae, zip, imagen). Un derivado (imagen reducida, modelo más liviano para el visor) se guarda aparte, con referencia al original.
7. **Los prefijos `importaciones/` y `proto-csv/` no se tocan.** Lo nuevo vive bajo `t/`.

## Consecuencias
- Más fácil: deduplicar; verificar integridad; cambiar de proveedor.
- Más difícil: borrar un archivo exige comprobar que ninguna versión de diseño lo usa.
- La subida directa del navegador es la parte menos portable: cada proveedor la resuelve distinto (token de cliente en Vercel, URL prefirmada en S3, firma de acceso compartido en Azure). Queda como operación opcional de la interfaz; el importador de prueba sigue usando la de Vercel sin cambios.
- Reducir imágenes en el servidor necesitaría una dependencia nueva. Mientras tanto, se fija un tamaño máximo por imagen.
- A revisar: límites del plan de Vercel con más de una carpintería; retención y borrado de archivos de clientes (consulta CA-11).

## Cómo revertir
- **Cambiar de proveedor:** escribir el adaptador nuevo, pasar la batería de contrato de `FileStore` y copiar los objetos con un script que lee de un adaptador y escribe en el otro. Las claves no cambian, así que la base no se toca.
- **Volver atrás en S3:** `ImportStore` no se borra hasta que el importador real lo reemplace; el importador de prueba sigue funcionando sobre él.

## Acciones
1. [ ] El equipo acepta o corrige este ADR.
2. [ ] S3 implementa `FileStore` (`docs/spec-s3-almacenamiento-archivos.md`).
3. [ ] Enviar CA-1 y CA-11 a Casa Mueble.
