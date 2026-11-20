import { postSesion } from "@/server/embebido/api";
import { conDeps } from "@/server/embebido/deps";

// IE-3: intercambio de token. El iframe manda el token que le pasó el ERP; se valida con whoami y se crea la sesión.
export async function POST(request: Request) {
  return conDeps((deps) => postSesion(request, deps));
}
