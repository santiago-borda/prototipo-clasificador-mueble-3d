import { postRevocar } from "@/server/embebido/api";
import { conDeps } from "@/server/embebido/deps";

// Revoca la sesión de la cookie (erp:salir, renovación fallida o sin respuesta del ERP en 10 s).
export async function POST(request: Request) {
  return conDeps((deps) => postRevocar(request, deps));
}
