import { postRenovar } from "@/server/embebido/api";
import { conDeps } from "@/server/embebido/deps";

// IE-5: renovación del token del ERP en una sesión vigente (mismo usuario; si no, se revoca).
export async function POST(request: Request) {
  return conDeps((deps) => postRenovar(request, deps));
}
