# Guía para embeber la Guía de armado en el ERP

Versión 0.1, 20/11/2026. Para el equipo de desarrollo del frontend del ERP de Casa Mueble.

## Qué se agrega

En la página de un proyecto del ERP se agrega un iframe que muestra la Guía de armado de ese proyecto: los muebles, los Documentos y el visor 3D del modelo. El usuario no vuelve a iniciar sesión. El ERP le pasa al iframe el token de acceso del usuario por `postMessage`. Ese token nunca viaja en la URL.

## 1. El componente (React 19)

```tsx
import { useEffect, useRef } from "react";

// Origen de la Guía de armado en QA. En producción, el que se defina.
const ORIGEN_PFG = "https://taller-test.casamueble.com.ar";

export function GuiaArmadoEmbebida({ proyectoId, obtenerToken }: {
  proyectoId: string;
  obtenerToken: () => Promise<string>; // token de acceso vigente del usuario
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    async function alRecibir(e: MessageEvent) {
      if (e.origin !== ORIGEN_PFG || e.source !== ref.current?.contentWindow) return;
      if (e.data?.tipo === "pfg:listo" || e.data?.tipo === "pfg:token-requerido") {
        const token = await obtenerToken();
        ref.current?.contentWindow?.postMessage({ tipo: "erp:token", v: 1, token }, ORIGEN_PFG);
      }
    }
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, [obtenerToken]);
  return <iframe ref={ref} title="Guía de armado"
    src={`${ORIGEN_PFG}/embebido?proyecto=${encodeURIComponent(proyectoId)}`}
    style={{ width: "100%", height: "80vh", border: 0 }} />;
}
```

- `proyectoId` es el id del proyecto en el ERP, por ejemplo `P-0002`.
- `obtenerToken` devuelve el token de acceso vigente. Si el token está por vencer, conviene que lo renueve antes de devolverlo.
- Cuando el usuario cierra la sesión en el ERP, se puede avisar al iframe: `iframe.contentWindow.postMessage({ tipo: "erp:salir", v: 1 }, ORIGEN_PFG)`.

## 2. Mensajes

Todos los mensajes llevan `v: 1`. Siempre se mandan con un origen explícito, nunca con `"*"`.

| De | A | Mensaje | Cuándo |
|---|---|---|---|
| Guía | ERP | `{ tipo: "pfg:listo", v: 1 }` | Al abrir el iframe |
| Guía | ERP | `{ tipo: "pfg:token-requerido", v: 1 }` | Cuando el token venció |
| ERP | Guía | `{ tipo: "erp:token", v: 1, token }` | Responde a cualquiera de los dos anteriores |
| ERP | Guía | `{ tipo: "erp:salir", v: 1 }` | Opcional, al cerrar la sesión en el ERP |

Si el ERP no responde en 10 segundos, la Guía muestra «Volvé a abrir desde el ERP».

## 3. Qué hay que permitir

- **`frame-src`:** si el frontend del ERP tiene una Content-Security-Policy, hay que agregar `https://taller-test.casamueble.com.ar` a `frame-src`, o a `child-src` si no usan `frame-src`.
- **`Referrer-Policy`:** la Guía reconoce al ERP por el `document.referrer` del iframe. Necesita al menos el origen, que es lo que da el valor por defecto de los navegadores (`strict-origin-when-cross-origin`). Con `no-referrer` el iframe muestra «Abrí esta pantalla desde el ERP».
- **De nuestro lado:** configuramos el origen exacto del frontend del ERP (por ejemplo `https://erp-qa.casamueble.com.ar`). Solo ese origen puede embeber la Guía, y solo la Guía acepta sus mensajes.

## 4. Qué datos lee la Guía

La Guía solo lee: nunca escribe en el ERP. Llama a la API con el token del usuario, desde su servidor:

- `GET /api/session/whoami`: valida el token y obtiene el usuario y el tenant activo.
- Lectura del proyecto, sus muebles y sus Documentos, y descarga del zip con el `.dae`.

Las rutas de lectura que usamos hoy son un supuesto: `/api/proyectos/<id>` y `/api/proyectos/<id>/documentos/<docId>/contenido`. Si nos pasan las rutas reales o el OpenAPI, las ajustamos.

## 5. Lo que necesitamos de Casa Mueble

1. Agregar el componente en la página del proyecto del ERP de QA.
2. El origen exacto del frontend de QA y, más adelante, el de producción.
3. Confirmar que el token de acceso está disponible en JavaScript y cuánto dura.
4. Confirmar que ese token sirve para llamar a la API desde otro servidor, sin restricción de IP, de audiencia ni de origen.
5. Las rutas de lectura de proyectos y Documentos, o el OpenAPI.

Si el ERP no está bajo `casamueble.com.ar`, la cookie de sesión del iframe pasa a ser de terceros y algunos navegadores la bloquean. En ese caso hay que avisarnos.
