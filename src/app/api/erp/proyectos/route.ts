import { getProyectos } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// IE-5: proyectos de la carpintería de la sesión.
export function GET(request: Request) {
  return conDeps((deps) => getProyectos(request, deps));
}
