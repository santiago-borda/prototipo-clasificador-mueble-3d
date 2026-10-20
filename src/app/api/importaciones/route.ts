import { importApiFromEnv } from "@/importer/config";

// GET: lista las importaciones. POST: registra una importación ya subida. Ambas exigen la clave (x-import-key).
// La lógica y la comprobación de la clave están en `importer/api.ts`.
export function GET(request: Request) {
  return importApiFromEnv(process.env).list(request);
}

export function POST(request: Request) {
  return importApiFromEnv(process.env).register(request);
}
