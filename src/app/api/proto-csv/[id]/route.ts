import { protoApiFromEnv } from "@/proto-csv/config";

// GET: informe, eventos y estado de una carga (lectura abierta, por link). DELETE: borra la carga (con clave).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return protoApiFromEnv(process.env).read(id);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return protoApiFromEnv(process.env).remove(request, id);
}
