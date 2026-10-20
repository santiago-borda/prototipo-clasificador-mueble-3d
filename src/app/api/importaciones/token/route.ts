import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ImportError } from "@/importer/api";
import { importApiFromEnv } from "@/importer/config";

// Token de subida directa del navegador al Blob. Exige la clave (x-import-key); el path y el tamaño se validan
// en `api.authorizeUpload`. No usa `onUploadCompleted`: el registro lo hace el navegador con POST /api/importaciones.
export async function POST(request: Request) {
  const api = importApiFromEnv(process.env);
  const denied = await api.guard(request);
  if (denied) return denied;

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "El cuerpo no es JSON.", code: "cuerpo" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: (pathname) => api.authorizeUpload(pathname),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ImportError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "No se pudo generar el token de subida.", code: "token" }, { status: 400 });
  }
}
