import { conDeps } from "@/server/integracion/deps";
import { getTrabajo } from "@/server/integracion/trabajos";

// IE-8: estado de un trabajo (mismo Bearer; 404 si es de otra carpintería).
export async function GET(request: Request, { params }: { params: Promise<{ trabajoUuid: string }> }) {
  const { trabajoUuid } = await params;
  return conDeps((deps) => getTrabajo(request, deps, trabajoUuid));
}
