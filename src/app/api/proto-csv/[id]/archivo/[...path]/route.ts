import { protoApiFromEnv } from "@/proto-csv/config";

// Archivo subido de una carga registrada (.dae, CSV, texturas, SVG). El Blob es privado: se transmite desde acá.
// Lectura abierta, por link; `protoPath` rechaza toda ruta fuera de proto-csv/<id>/.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params;
  return protoApiFromEnv(process.env).file(id, path.join("/"));
}
