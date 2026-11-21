import { getListado } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// IC-6: el listado de piezas del CSV del último trabajo `success` del proyecto (el mismo trabajo que sirve /modelo).
export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return conDeps((deps) => getListado(request, deps, uuid));
}
