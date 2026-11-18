import { protoApiFromEnv } from "@/proto-csv/config";

// Spike CSV (docs/spec-proto-csv-ocl.md §4). GET: lista las cargas. POST: registra una carga ya subida.
// Sin clave (v0.5); la lógica está en `proto-csv/api.ts`. Solo toca claves bajo proto-csv/.
export function GET() {
  return protoApiFromEnv(process.env).list();
}

export function POST(request: Request) {
  return protoApiFromEnv(process.env).register(request);
}
