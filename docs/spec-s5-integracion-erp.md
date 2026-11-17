# Especificación — S5: integración con el ERP

Versión: **v0.1 (17/11/2026), borrador a aprobar por el equipo.** No hay código.
Antecedentes: `docs/adr/ADR-005-integracion-erp.md`, `docs/adr/ADR-004-autenticacion.md`, `docs/spec-s4-sesion-erp.md`, `docs/spec-s3-almacenamiento-archivos.md`, `docs/consultas-casa-mueble-arquitectura.md` (CA-5 a CA-8).
Condición: ADR-005 aceptado; S3 y S4 cerradas.

---

## 1. Objetivo y alcance

Que una persona, desde la pantalla de un mueble en el ERP, abra este sistema ya identificada y en ese mueble; que el sistema pueda traer del ERP el modelo 3D original; y que el ERP pueda consultar el estado de un mueble por una API con contrato.

Incluye:
1. Página de entrada `/erp/abrir` con el protocolo `postMessage` (ADR-005 §2).
2. Interfaz `ErpClient` de solo lectura, con implementación de prueba e implementación HTTP.
3. Caso de uso «traer el modelo 3D del ERP»: descarga el zip, extrae el .dae y las texturas, los guarda (S3) y crea una versión de diseño en borrador (S2).
4. Contrato `docs/api/openapi.json` y las rutas de lectura `/api/v1/…`.
5. Cabecera `frame-ancestors` para las rutas `/erp/…`, lista para la etapa del iframe.

**No es objetivo:** escribir en el ERP; Web Component o Module Federation; leer el PDF de cortes (depende de la lectura del PDF, fuera de S2 a S6); la pantalla de revisión del diseño traído (usa lo que exista); sincronizar sin usuario presente.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| S5-D1 | Código en `src/erp/`: `client.ts` (interfaz y tipos propios), `fakeClient.ts`, `httpClient.ts`, `parse.ts` (respuesta del ERP → tipos propios, puro), `handshake.ts` (protocolo de mensajes, puro), `zip.ts`. | Un solo módulo conoce al ERP. |
| S5-D2 | `httpClient` recibe `fetch`, la URL base y el token del usuario para ese pedido. No lee variables de entorno ni guarda el token. | Se prueba sin red (ADR-005 §3). |
| S5-D3 | Las rutas y la forma de las respuestas del ERP son **ASUMIDAS** a partir del relevamiento del 16/11 y viven solo en `parse.ts` y `httpClient.ts`. Una respuesta con otra forma lanza `RespuestaErpInvalidaError`. | Sin OpenAPI del ERP (CA-5). |
| S5-D4 | Protocolo de mensajes versión 1: `cm-armado/lista` y `cm-armado/sesion` (ADR-005 §2). `handshake.ts` exporta funciones puras: `isAllowedOrigin(origin, allowed)`, `parseSessionMessage(data)`. Un mensaje de un origen no permitido o con otra forma se ignora, sin responder. | El protocolo se prueba sin navegador. |
| S5-D5 | Orígenes permitidos en `ERP_ALLOWED_ORIGINS` (lista separada por comas, orígenes exactos, sin comodines). Vacía = la página de entrada responde 503. | Lista cerrada. |
| S5-D6 | `/erp/abrir` no muestra contenido propio: espera el mensaje, canjea la sesión (`POST /api/sesion`, S4) y navega. Si a los 10 segundos no llegó un mensaje válido, muestra «Abrí esta página desde el ERP». | Página mínima. |
| S5-D7 | Del zip se extraen solo archivos `.dae` e imágenes de textura. Exactamente un `.dae`: cero o más de uno es un rechazo con qué hacer. Los nombres del zip se tratan como dato no confiable (sin rutas, sin `..`). Tope de tamaño descomprimido: 100 MB (ASUMIDO). | Un zip puede traer cualquier cosa. |
| S5-D8 | El contrato OpenAPI se escribe a mano en JSON y es la fuente de verdad. Una prueba recorre sus rutas y comprueba que cada una existe y que su respuesta de ejemplo cumple el esquema declarado. | Contrato primero, sin generador. |
| S5-D9 | `/api/v1` se autentica con el token del ERP en `Authorization: Bearer`, verificado con `SessionVerifier` (S4), con un resultado guardado en memoria 60 segundos por token (se guarda un hash del token, no el token). | El ERP llama desde su front con la sesión del usuario; no hay credenciales de servicio. |
| S5-D10 | `/api/v1` permite pedidos de otros orígenes solo para los de `ERP_ALLOWED_ORIGINS`. | El front del ERP está en otro dominio. |

## 3. Contrato

```ts
// src/erp/client.ts (tipos propios; ningún tipo del ERP sale de src/erp/)
export interface ErpClient {
  listProjects(): Promise<readonly ErpProject[]>;
  listFurniture(erpProjectId: string): Promise<readonly ErpFurniture[]>;
  listDocuments(erpProjectId: string): Promise<readonly ErpDocument[]>;
  download(document: ErpDocument): Promise<Uint8Array>;
}
export interface ErpDocument { id: string; kind: "modelo-3d" | "cortes" | "presupuesto" | "otro"; name: string; bytes: number | null }
```

Rutas propias, primera versión del contrato:

| Ruta | Devuelve |
|---|---|
| `GET /api/v1/muebles?erpProjectId=…` | Muebles del proyecto conocidos por este sistema, con su estado. |
| `GET /api/v1/muebles/{erpFurnitureId}` | Estado: versión publicada (o ninguna), cantidad de tipos de pieza, instancias seguras, dudosas y sin asociar, revisiones pendientes. |
| `GET /api/v1/muebles/{erpFurnitureId}/armado` | Avance del armado: pasos totales y hechos. Sin datos hasta S6: responde `pasos: 0`. |
| `GET /api/v1/muebles/{erpFurnitureId}/enlace` | URL para abrir el mueble en el backoffice. |

Excepciones con nombre: `RespuestaErpInvalidaError(campo)`, `ErpNoDisponibleError`, `OrigenNoPermitidoError`, `ZipInvalidoError(motivo)` (motivos: `sin-dae`, `varios-dae`, `demasiado-grande`, `nombre-invalido`, `ilegible`), `DocumentoNoEncontradoError`.

## 4. Requisitos

- **E1.** El token del ERP nunca está en una URL, en un registro ni guardado.
- **E2.** La página de entrada solo acepta mensajes de orígenes permitidos y solo envía mensajes a orígenes permitidos (nunca a `*`).
- **E3.** Una respuesta del ERP con otra forma no se adivina: falla con el campo que no cumple.
- **E4.** El modelo traído del ERP es el .dae original: su `modelId` es el sha256 de los bytes extraídos del zip.
- **E5.** Traer el mismo modelo dos veces no duplica archivos (S3) y lo dice.
- **E6.** Un zip inválido no deja nada guardado.
- **E7.** Cada ruta del contrato existe, y cada ruta `/api/v1` está en el contrato.
- **E8.** `/api/v1` solo devuelve datos de la carpintería del token.
- **E9.** Solo las rutas `/erp/…` se pueden embeber, y solo desde orígenes permitidos. El resto de la app no cambia sus cabeceras.
- **E10.** Con el ERP caído, las fichas y la carga manual funcionan.
- **E11.** El sistema no hace ningún pedido de escritura al ERP: `httpClient` solo emite `GET`.

## 5. Criterios de aceptación y pruebas

Automáticas, sin red (`tests/erp/`). El zip de prueba se arma en la prueba con el .dae del primer fixture.

| Id | Requisito | Qué | Esperado |
|---|---|---|---|
| PE-1 | E2 | `isAllowedOrigin` con el origen exacto, con otro puerto, con un subdominio, con `null`, con la lista vacía | solo el exacto pasa |
| PE-2 | E2 | `parseSessionMessage` con el mensaje correcto, sin token, con `v: 2`, con otro `type`, con un texto | solo el primero se acepta |
| PE-3 | E1, E2 | página de entrada en jsdom: mensaje de origen no permitido; después uno permitido | el primero se ignora sin respuesta; el segundo hace un `POST /api/sesion` con el token en el cuerpo; `location.href` nunca contiene el token |
| PE-4 | E2 | `postMessage` de la página | el destino es siempre un origen de la lista, nunca `*` |
| PE-5 | S5-D6 | no llega ningún mensaje en 10 s (reloj falso) | se muestra «Abrí esta página desde el ERP» |
| PE-6 | E3 | `parse.ts` con cada campo faltante o de otro tipo, por cada tipo de respuesta | `RespuestaErpInvalidaError` con el campo |
| PE-7 | E11 | `httpClient` con un `fetch` falso que registra los pedidos, en todas sus funciones | todos son `GET`, con `Authorization` y sin cuerpo |
| PE-8 | E4 | traer el modelo con el cliente de prueba | la versión en borrador tiene el `modelId` del .dae del primer fixture (el mismo que `observeDae`) |
| PE-9 | E5 | traer dos veces | un solo objeto por archivo; la segunda respuesta dice `ya-existia` |
| PE-10 | E6 | zip sin .dae; con dos; con un nombre `../x.dae`; ilegible; que supera el tope | `ZipInvalidoError` con su motivo; almacenamiento y base sin cambios |
| PE-11 | E7 | recorrer `docs/api/openapi.json` y el árbol `src/app/api/v1/` | las dos listas de rutas coinciden |
| PE-12 | E7 | cada respuesta real de las rutas (con datos del primer fixture) contra su esquema del contrato | cumple |
| PE-13 | E8 | `/api/v1/muebles/{id}` con un token de la carpintería B para un mueble de A | 404 |
| PE-14 | E9 | cabeceras de `/erp/abrir`, de `/p/<qrId>` y de `/importar` | solo la primera lleva `frame-ancestors` con la lista; las otras, las de hoy |
| PE-15 | E10 | cliente de prueba que siempre falla; se piden una ficha y una carga manual | funcionan; «traer del ERP» responde `erp-no-disponible` |
| PE-16 | S5-D9 | dos pedidos seguidos con el mismo token; un tercero a los 61 s | una verificación para los dos primeros; otra para el tercero; el token no está en la memoria (solo su hash) |

**Prueba manual M-S5 (requiere aprobación del equipo; solo lectura; proyecto de prueba P-0002 de QA):** listar los documentos, descargar el zip del modelo 3D y comprobar que trae el .dae original con los 21 códigos. Se graba la forma de cada respuesta, sin datos reales, como fixture. Si alguna ruta o forma difiere de lo asumido, se corrige `parse.ts` y se anota.

**Prueba manual M-S5b (requiere que Casa Mueble agregue el botón en QA):** abrir el sistema desde el ERP de punta a punta.

Al cerrar: `typecheck`, `lint`, `npm test` y `build` en verde.

## 6. Paradas obligatorias

| Parada | Antes de | Qué aprueba el equipo |
|---|---|---|
| U-zip | leer un zip | cómo se abre: una dependencia para leer zip (candidata: `fflate`; tamaño, dependencias propias y mantenimiento a verificar en su documentación al pedir la aprobación) o un lector propio mínimo. Recomendación: la dependencia; un lector propio de zip es código de riesgo sin valor para el producto. |
| U-contrato | escribir las rutas `/api/v1` | el archivo `docs/api/openapi.json` |
| U-qa | M-S5 | la lectura real contra QA: qué endpoints, con qué usuario, dónde van las credenciales |

## 7. Supuestos (ASUMIDO)

- Rutas y formas de la API del ERP (S5-D3, CA-5).
- El zip trae el .dae original y la API permite descargarlo (CA-7).
- Entrada por pestaña (CA-6).
- Identificadores del ERP estables y un mueble del ERP = un mueble (CA-8).
- Tope de 100 MB descomprimidos (S5-D7).

## 8. Orden de trabajo

1. `handshake.ts` y sus pruebas (PE-1, PE-2).
2. `client.ts`, `fakeClient.ts`, `parse.ts` (PE-6); `httpClient.ts` con `fetch` falso (PE-7).
3. Parada U-zip; `zip.ts` y el caso de uso (PE-8 a PE-10).
4. Parada U-contrato; rutas `/api/v1` (PE-11 a PE-13, PE-16).
5. Página `/erp/abrir` y cabeceras (PE-3 a PE-5, PE-14, PE-15).
6. Parada U-qa y M-S5, si el equipo la aprueba.
7. Enviar a Casa Mueble el protocolo de mensajes y el contrato. Actualizar `CLAUDE.md`.
