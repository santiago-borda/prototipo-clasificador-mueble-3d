# ADR-001: Stack del producto

**Estado:** Propuesto · **Fecha:** 17/11/2026 · **Deciden:** Santiago Borda y Lautaro Salina

## Contexto
El prototipo se hizo en Next.js 16, TypeScript, React Three Fiber, Zustand y Tailwind, desplegado en Vercel, con la aclaración de que eso no fijaba el stack. Para pasar a producto hay que fijarlo.

- El motor de asociación, el esquema del PDF y la lectura del .dae son TypeScript puro, con 768 pruebas. El motor corre en el servidor (necesita `ColladaLoader` y `DOMParser`).
- El ERP de Casa Mueble tiene el front en React 19 y Vite, y una API aparte en .NET (inferido, sin confirmar).
- **No se sabe dónde va a publicar Casa Mueble.** Sus credenciales de publicación llegan después.
- El equipo son dos personas con plazo de PFG.
- El operario usa el celular en el taller: la ficha tiene que cargar rápido.

## Criterios
1. Conservar el motor y sus pruebas sin reescribir.
2. Poder publicar donde diga Casa Mueble sin rehacer el sistema.
3. Costo de cambio para un equipo de dos personas.
4. Carga rápida de la ficha en el celular.
5. Que un tercero pueda mantenerlo.

## Opciones consideradas

| Opción | 1 Motor | 2 Alojamiento | 3 Costo | 4 Celular | 5 Terceros |
|---|---|---|---|---|---|
| **A. Next.js y TypeScript, portable** (elegida) | Sí | Vercel, servidor Node o contenedor | Ninguno | Páginas generadas en el servidor | TypeScript y React, como el front del ERP |
| B. Front React + Vite y API .NET, como el ERP | Reescribir en C# o correr un servicio Node aparte | El del ERP | Meses | Depende de la API | Mismo stack que el ERP |
| C. Front React + Vite y API Node (Fastify o similar) | Sí | Dos despliegues | Semanas, sin beneficio para el operario | Aplicación de una página: primera carga más lenta | Parecido a A |
| D. Next.js atado a Vercel (usar sus servicios sin interfaz) | Sí | Solo Vercel | Ninguno hoy, alto si hay que mudarse | Igual que A | Igual que A |

## Decisión propuesta
**Opción A.** Seguir con Next.js y TypeScript como un solo sistema desplegable, con cuatro reglas:

1. **El dominio no conoce a Next.** Los casos de uso y las reglas viven en módulos puros. No importan `next/*`, React ni clientes de red. Una prueba estática lo verifica (como hoy M3 y H10).
2. **Todo lo externo entra por una interfaz** con una implementación real y otra de prueba: repositorios, `FileStore`, verificador de sesión, cliente del ERP.
3. **Las rutas y las páginas son delgadas:** leen la entrada, llaman a un caso de uso y responden. El patrón ya existe en `src/importer/api.ts`.
4. **Nada fuera de los adaptadores depende de Vercel.** El despliegue sigue en Vercel mientras Casa Mueble no diga otra cosa (ASUMIDO). La documentación de Next incluida en el repo (`node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md`) indica que un servidor Node (`next build` y `next start`) y un contenedor Docker soportan todas las funciones de Next.

Hoy dependen de Vercel dos cosas, las dos en el importador de prueba: `src/importer/blobStore.ts` (ya detrás de una interfaz) y la subida directa del navegador al Blob en `ImportForm.tsx`. La segunda no se toca (su comportamiento visible queda como está) y se trata en ADR-003.

El visor y las fichas siguen con React Three Fiber, Zustand y Tailwind.

## Consecuencias
- Más fácil: seguir entregando sin reescribir; reusar el motor en el servidor; probar sin red.
- Más difícil: embeber pantallas dentro del ERP, porque el ERP usa Vite y este sistema Next (ADR-005).
- El backend no coincide con el del ERP. Si Casa Mueble mantiene el sistema en el futuro, mantiene dos tecnologías de servidor.
- Next cambia entre versiones mayores: se sigue leyendo su documentación antes de usar una API (`AGENTS.md`).

## Cómo revertir
- **Mudarse de Vercel:** se publica como servidor Node o contenedor y se cambia el adaptador de archivos (ADR-003). No se toca el dominio.
- **Cambiar la capa web** (opciones B o C): por la regla 1, el dominio y sus pruebas se mueven sin cambios; se reescriben solo rutas y páginas. Si el servidor fuera .NET, el motor quedaría como un servicio Node al que la API llama.
- La decisión se reabre si Casa Mueble exige alojar en una infraestructura sin Node (consulta CA-1).

## Acciones
1. [ ] El equipo acepta o corrige este ADR.
2. [ ] Al aceptarlo, cambiar en `CLAUDE.md` la frase «no fija el stack del proyecto».
3. [ ] S2 agrega la prueba estática de que los módulos nuevos del dominio no importan `next/*`.
