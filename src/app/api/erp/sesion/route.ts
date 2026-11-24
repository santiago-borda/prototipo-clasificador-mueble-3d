import { getSesion, postSesion } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// IE-2: POST crea la sesión con el contenido de `erp:sesion`; GET dice si la cookie tiene sesión vigente.
export function POST(request: Request) {
  return conDeps((deps) => postSesion(request, deps));
}

export function GET(request: Request) {
  return conDeps((deps) => getSesion(request, deps));
}
