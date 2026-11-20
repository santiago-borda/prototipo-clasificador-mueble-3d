import { postRenovar } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// IE-2 / TIE-8: renueva la sesión con el contenido de `erp:token` (mismo sub y tenant_id; si no, revoca).
export function POST(request: Request) {
  return conDeps((deps) => postRenovar(request, deps));
}
