import { getModelo } from "@/server/embebido/api";
import { conDeps } from "@/server/embebido/deps";

// IE-8: el .dae del zip de un Documento del ERP, validado y sin guardarlo. Lo pide el visor embebido.
export async function GET(request: Request, { params }: { params: Promise<{ erpId: string; docId: string }> }) {
  const { erpId, docId } = await params;
  return conDeps((deps) => getModelo(request, deps, erpId, docId));
}
