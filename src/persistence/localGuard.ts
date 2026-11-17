// S2-D5, B10: guarda de base local. `db:migrate` y `db:seed` la llaman antes de conectarse.
// No hay bandera para saltearla: migrar o cargar datos fuera de local requiere aprobación del equipo.

import { BaseNoLocalError } from "./ports";

const LOCAL_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];

/** Lanza `BaseNoLocalError` si el host de la URL no es `localhost` ni `127.0.0.1`. El error nunca lleva la URL (trae la clave). */
export function assertLocalDatabase(databaseUrl: string): void {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new BaseNoLocalError("(URL ilegible)");
  }
  if (!LOCAL_HOSTS.includes(host)) throw new BaseNoLocalError(host === "" ? "(sin host)" : host);
}
