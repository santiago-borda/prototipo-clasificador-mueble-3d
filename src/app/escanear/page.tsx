import type { Metadata } from "next";
import { QrScanner } from "@/components/QrScanner";

export const metadata: Metadata = {
  title: "Escanear QR — Prototipo",
};

export default function ScanPage() {
  return (
    <main className="mx-auto w-full max-w-xl p-4 pb-10 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Escanear QR</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">Al leer la etiqueta se abre la ficha de la pieza.</p>
      <QrScanner />
    </main>
  );
}
