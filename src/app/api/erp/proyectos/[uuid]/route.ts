import { getProyecto } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// IE-5: un proyecto de la carpintería de la sesión, con su último trabajo (404 si es de otra carpintería).
export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return conDeps((deps) => getProyecto(request, deps, uuid));
}
