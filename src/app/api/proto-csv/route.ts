import { protoApiFromEnv } from "@/proto-csv/config";

// Spike CSV (docs/spec-proto-csv-ocl.md §4). GET: lista las cargas. POST: registra una carga ya subida.
// Las dos exigen la clave (x-import-key); la lógica está en `proto-csv/api.ts`. Solo toca claves bajo proto-csv/.
export function GET(request: Request) {
  return protoApiFromEnv(process.env).list(request);
}

export function POST(request: Request) {
  return protoApiFromEnv(process.env).register(request);
}
