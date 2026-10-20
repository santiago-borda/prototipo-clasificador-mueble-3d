import { importApiFromEnv } from "@/importer/config";

// GET: mueble.json e informe.json (lectura abierta, por link). DELETE: borra la importación (con clave).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return importApiFromEnv(process.env).read(id);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return importApiFromEnv(process.env).remove(request, id);
}
