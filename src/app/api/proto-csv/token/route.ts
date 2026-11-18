import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ProtoHttpError } from "@/proto-csv/api";
import { protoApiFromEnv } from "@/proto-csv/config";
import { ProtoPathError } from "@/proto-csv/paths";

// Token de subida directa del navegador al Blob, solo para claves proto-csv/<id>/ que sube el navegador (spike).
// Sin clave (v0.5): solo exige que haya store. El registro lo hace el navegador después, con POST /api/proto-csv.
export async function POST(request: Request) {
  const api = protoApiFromEnv(process.env);
  if (!api.configured) return Response.json({ error: "Carga por CSV no configurada.", code: "sin-configurar" }, { status: 503 });

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "El cuerpo no es JSON.", code: "cuerpo" }, { status: 400 });
  }

  try {
    const result = await handleUpload({ request, body, onBeforeGenerateToken: (pathname) => api.authorizeUpload(pathname) });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ProtoHttpError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof ProtoPathError) return Response.json({ error: error.message, code: "path" }, { status: 400 });
    return Response.json({ error: "No se pudo generar el token de subida.", code: "token" }, { status: 400 });
  }
}
