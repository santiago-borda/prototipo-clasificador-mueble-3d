import Link from "next/link";
import { FurnitureBrowser } from "@/components/FurnitureBrowser";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl p-4 pb-10 lg:p-8">
      <h1 className="sr-only">Muebles, piezas y QR</h1>
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Prototipo — vista previa</p>
      <p className="mt-3 text-sm text-slate-600">
        Escaneá la etiqueta de una pieza desde la pestaña «Escanear QR», o tocá una de la lista para abrir su ficha.
      </p>
      <div className="mt-4">
        <Link
          href="/qr"
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:ring-orange-400"
        >
          QR para escanear / imprimir
        </Link>
      </div>

      <FurnitureBrowser />
    </main>
  );
}
