# ADR-005: Integración con el ERP de Casa Mueble

**Estado:** Propuesto · **Fecha:** 17/11/2026 · **Deciden:** Santiago Borda y Lautaro Salina

## Contexto
Hallazgos del ERP en QA (relevados el 16/11/2026 sin leer código del servidor):
- Front en React 19, Vite, Tailwind, shadcn/Radix y three.js. API aparte, sin descripción pública (OpenAPI).
- Jerarquía Proyecto → Mueble → Piezas, **sin módulos**.
- Documentos por proyecto: presupuesto (PDF), optimización de cortes (PDF) y modelo 3D (zip con el .dae de SketchUp y texturas), que el ERP convierte a GLB.
- Al leer el .dae del primer fixture toma solo los objetos de primer nivel: 22 «piezas» (4 grupos sin nombre y 18 instancias). Pierde 9 códigos que están dentro de grupos. Su nombre sugerido corta el número de corte.
- No tiene guía de armado, QR, ficha de pieza, canteado ni check de cortes. Eso aporta este sistema.

Restricciones: no se escribe en el ERP sin aprobación del equipo; la API puede cambiar sin aviso; el sistema tiene que funcionar si el ERP no responde; la sesión no viaja en la URL.

Este ADR decide cuatro cosas: cómo se abre el sistema desde el ERP, cómo pasa la sesión, cómo se leen los documentos y qué contrato ofrece el sistema al ERP.

## Criterios
1. Trabajo que le pide al equipo del ERP.
2. Acoplamiento entre los dos sistemas (versiones, despliegues).
3. Seguridad de la sesión.
4. Experiencia del usuario del backoffice.

## 1. Cómo se abre el sistema desde el ERP

| Opción | 1 Trabajo en el ERP | 2 Acoplamiento | 3 Sesión | 4 Experiencia |
|---|---|---|---|---|
| **A. Enlace que abre una pestaña** (primera etapa) | Un botón | Ninguno | Cookie propia, sin restricciones | Cambia de pestaña |
| **B. iframe** (segunda etapa) | Un contenedor y permitir el origen | Bajo: solo el protocolo de mensajes | Las cookies de otro dominio pueden bloquearse dentro del iframe | Una sola pantalla |
| C. Web Component | Cargar un script de este sistema | Medio: el componente corre dentro de la página del ERP, con su CSS y su ciclo de vida | El componente tendría acceso al token del ERP | Una sola pantalla |
| D. Module Federation | Cambiar la configuración de compilación del ERP | Alto: ata las versiones de React y three, y los despliegues | Igual que C | Una sola pantalla |

Module Federation se descarta: une las compilaciones de un front en Vite y otro en Next (compatibilidad con el App Router de Next sin verificar en esta sesión) y obliga a coordinar cada despliegue. El Web Component queda como opción solo para una pieza chica y sin estado, si Casa Mueble la pide (por ejemplo, un indicador de avance del armado).

## 2. Cómo pasa la sesión sin ponerla en la URL

| Opción | Qué necesita del ERP | Observaciones |
|---|---|---|
| **A. `postMessage` con origen comprobado** (elegida) | Solo cambios en su front | Sirve igual para la pestaña (`window.opener`) y para el iframe (`window.parent`) |
| B. Código de un solo uso en la URL, canjeado entre servidores | Un endpoint nuevo en su API | En la URL viaja un código que vence en segundos, no la sesión |
| C. Token en el fragmento (`#`) de la URL | Solo cambios en su front | No llega al servidor, pero queda en el historial del navegador. Descartada |

Protocolo propuesto (versión 1):
1. El ERP abre `…/erp/abrir` en una pestaña o en un iframe.
2. La página del sistema avisa que está lista: `{ type: "cm-armado/lista", v: 1 }`, dirigido solo a los orígenes permitidos.
3. El ERP responde `{ type: "cm-armado/sesion", v: 1, token, contexto: { erpProjectId, erpFurnitureId } }`, dirigido solo al origen del sistema.
4. La página comprueba el origen del mensaje contra una lista cerrada (`ERP_ALLOWED_ORIGINS`), envía el token a su servidor en el cuerpo de un `POST` y lo descarta.
5. El servidor verifica el token (ADR-004), emite la sesión propia y la página navega al mueble pedido.

El token nunca está en una URL ni en un registro del servidor.

## 3. Cómo se leen los Documentos del proyecto

1. **Interfaz `ErpClient` de solo lectura:** listar proyectos y muebles de la carpintería, listar los documentos de un proyecto y descargar uno. Implementaciones: HTTP y de prueba (respuestas grabadas, sin datos personales).
2. **Capa de traducción:** lo que devuelve el ERP se valida con aserciones y se convierte a tipos propios. Ningún tipo del ERP sale de esa capa. Una respuesta con otra forma lanza una excepción con nombre; no se adivina.
3. **Con el token del usuario, sin guardarlo.** La importación ocurre mientras el usuario está en el backoffice: su página entrega el token para ese pedido y el servidor lo usa y lo descarta. No hay credenciales de servicio (ASUMIDO). Una cuenta de servicio haría falta solo para sincronizar sin usuario presente, y hoy no se necesita.
4. **Se usa el zip original del modelo 3D**, no el GLB ni la lista de piezas del ERP. El sistema extrae el .dae y las texturas, los guarda (ADR-003) y corre su propio motor.
5. **La carga manual sigue existiendo** como camino que no depende del ERP.

## 4. Contrato OpenAPI de este sistema

El sistema publica una API de lectura para que el ERP la consuma, descrita en un archivo OpenAPI versionado en el repo (`docs/api/openapi.json`, en JSON para leerlo sin dependencias nuevas). Se escribe el contrato primero y una prueba comprueba que cada ruta del contrato existe y responde con la forma declarada.

Primera versión (`/api/v1`, autenticada con el token del ERP en el encabezado `Authorization`):
- Estado de un mueble: si tiene diseño publicado, cuántas piezas son seguras o dudosas y si hay revisiones pendientes.
- Avance del armado de un mueble.
- Enlace para abrir el mueble en el backoffice.

No hay rutas de escritura para el ERP en esta etapa.

## Decisión propuesta (resumen)
1. El ERP es la fuente de identidad de carpinterías, usuarios, proyectos y muebles. Este sistema es la fuente de las piezas, su asociación, los QR, el canteado y el armado.
2. Nunca se usa la lista de piezas del ERP.
3. Se abre con un enlace en una pestaña; el iframe llega en una segunda etapa, con una lista cerrada de orígenes (`frame-ancestors`) solo para las rutas `/erp/…`.
4. La sesión pasa por `postMessage`.
5. Los documentos se leen por `ErpClient`, con el token del usuario.
6. El sistema publica un contrato OpenAPI de lectura.
7. El proyecto y el mueble guardan el identificador del ERP en una columna opcional. El módulo es propio del sistema y opcional (ver `docs/modelo-de-datos.md`). No se interpreta el segmento `M01` del código (consultas 42 y 44 sin tocar).
8. El sistema no escribe en el ERP.

## Consecuencias
- Más fácil: empezar S2 a S4 sin esperar al ERP; probar sin red; un cambio de la API del ERP se arregla en un solo módulo.
- Más difícil: mantener al día las respuestas grabadas sin un OpenAPI del ERP.
- El equipo del ERP tiene que agregar un botón y unas quince líneas de `postMessage`.
- Abrir el zip necesita una dependencia nueva o código propio: se decide en S5.
- En la primera etapa el usuario cambia de pestaña.

## Cómo revertir
- **Enlace ↔ iframe:** la misma página `/erp/abrir` sirve para los dos; cambia solo quién la abre y la cabecera `frame-ancestors`.
- **`postMessage` → código de un solo uso:** cambia la página de entrada; el verificador de sesión no cambia.
- **API del ERP distinta de lo relevado:** se corrige la implementación HTTP de `ErpClient` y sus respuestas grabadas.
- **Sin integración:** la carga manual cubre todo el flujo.

## Acciones
1. [ ] El equipo acepta o corrige este ADR.
2. [ ] Enviar a Casa Mueble CA-5 a CA-8.
3. [ ] S5 implementa (`docs/spec-s5-integracion-erp.md`). La primera lectura real contra QA requiere aprobación del equipo y credenciales en variables de entorno.
