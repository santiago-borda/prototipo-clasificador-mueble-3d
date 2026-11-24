import { postIngresar } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// IE-11: login de desarrollo (solo con ERP_LOGIN_DIRECTO=habilitado; si no, 404).
export function POST(request: Request) {
  return conDeps((deps) => postIngresar(request, deps));
}
