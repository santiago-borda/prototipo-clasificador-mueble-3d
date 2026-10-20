import { importApiFromEnv } from "@/importer/config";

// Sirve el .dae de una importación (el Blob es privado: se transmite desde acá). Lectura abierta, por link.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return importApiFromEnv(process.env).model(id);
}
