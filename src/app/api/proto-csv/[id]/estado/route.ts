import { protoApiFromEnv } from "@/proto-csv/config";

// POST { estado, motivo? }: aprobar, rechazar o publicar (simulado). Con clave; transiciones inválidas → 409.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return protoApiFromEnv(process.env).changeState(request, id);
}
