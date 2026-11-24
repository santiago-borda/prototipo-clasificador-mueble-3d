import { postRevocar } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// Revoca la sesión de la cookie (sesión vencida en el iframe, IE-4, o mensaje rechazado).
export function POST(request: Request) {
  return conDeps((deps) => postRevocar(request, deps));
}
