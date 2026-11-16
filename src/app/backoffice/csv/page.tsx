import type { Metadata } from "next";
import { CsvBackoffice } from "@/components/proto-csv/CsvBackoffice";
import { protoApiFromEnv } from "@/proto-csv/config";

export const metadata: Metadata = {
  title: "Backoffice CSV (spike) — Prototipo",
};

// Lee las variables de entorno en cada petición (no en el build). La clave NO se pasa al cliente: solo si hay
// almacenamiento y clave configurados (booleano).
export const dynamic = "force-dynamic";

export default function CsvBackofficePage() {
  return <CsvBackoffice configured={protoApiFromEnv(process.env).configured} />;
}
