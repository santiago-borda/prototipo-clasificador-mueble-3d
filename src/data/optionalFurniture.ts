// Muebles opcionales: viven en carpetas ignoradas por git y solo se registran si están presentes.
//
// Hoy: Sabrina (`Sabrina/data/sabrina.def.ts`, `NEXT_PUBLIC_ENABLE_SABRINA=1`). Su titularidad y uso están
// pendientes, así que ni el modelo ni la tabla de piezas se suben al repo. Sin la variable (Vercel) o sin la
// carpeta (clon limpio), el registro queda solo con Olmo y todo sigue funcionando.
//
// `require` dentro de try/catch (y bajo un `if` sobre una variable NEXT_PUBLIC_, que el build reemplaza por
// su valor) hace que el bundler trate el módulo como opcional: si no existe, no rompe el build.

import type { FurnitureDef } from "./types";

export function loadOptionalFurniture(): FurnitureDef[] {
  const defs: FurnitureDef[] = [];

  if (process.env.NEXT_PUBLIC_ENABLE_SABRINA === "1") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga opcional, ver arriba
      const mod = require("../../Sabrina/data/sabrina.def") as { sabrinaDef?: FurnitureDef };
      if (mod.sabrinaDef) defs.push(mod.sabrinaDef);
    } catch {
      // La carpeta Sabrina/ no está: se sigue sin ese mueble.
    }
  }

  return defs;
}
