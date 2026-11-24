import { getModelo } from "@/server/integracion/api";
import { conDeps } from "@/server/integracion/deps";

// IE-5: el .dae del último trabajo `success` del proyecto, sacado del zip guardado (IE-10).
export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  return conDeps((deps) => getModelo(request, deps, uuid));
}
