import { conDeps } from "@/server/integracion/deps";
import { postTrabajo } from "@/server/integracion/trabajos";

// IE-7: el ERP envía un trabajo (Authorization: Bearer <token del usuario>). Ver src/server/integracion/trabajos.ts.
export function POST(request: Request) {
  return conDeps((deps) => postTrabajo(request, deps));
}
