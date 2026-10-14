import type { Metadata } from "next";
import { QrSheet } from "@/components/QrSheet";
import { listQrEntries } from "@/lib/lookup";

export const metadata: Metadata = {
  title: "QR para escanear — Prototipo",
};

export default function QrPage() {
  return <QrSheet entries={listQrEntries()} />;
}
