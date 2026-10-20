// Muebles opcionales: viven en carpetas ignoradas por git y solo se registran si están presentes.
//
// Hoy: Sabrina (`Sabrina/data/sabrina.def.ts`, `NEXT_PUBLIC_ENABLE_SABRINA=1`). Su titularidad y uso están
// pendientes, así que ni el modelo ni la tabla de piezas se suben al repo. Sin la variable (Vercel) o sin la
// carpeta (clon limpio), el registro queda solo con Olmo y todo sigue funcionando.
//
// El módulo se importa por el alias `optional-sabrina-def` (`next.config.ts`): apunta a `Sabrina/data/sabrina.def.ts`
// si existe y a un stub vacío si no. Un `require` directo a una carpeta ausente rompe el build de Turbopack.

import type { FurnitureDef } from "./types";

export function loadOptionalFurniture(): FurnitureDef[] {
  const defs: FurnitureDef[] = [];

  if (process.env.NEXT_PUBLIC_ENABLE_SABRINA === "1") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga opcional, ver arriba
      const mod = require("optional-sabrina-def") as { sabrinaDef?: FurnitureDef };
      if (mod.sabrinaDef) defs.push(mod.sabrinaDef);
    } catch {
      // La carpeta Sabrina/ no está: se sigue sin ese mueble.
    }
  }

  return defs;
}
