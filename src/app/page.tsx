import Link from "next/link";
import { edgeSummary } from "@/lib/edgeText";
import { getFurniture, listModules, listPieces } from "@/lib/lookup";

export default function Home() {
  const furniture = getFurniture();
  const pieces = listPieces();

  return (
    <main className="mx-auto w-full max-w-xl p-4 pb-10 lg:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Prototipo descartable</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{furniture.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {furniture.dimsMm.x} x {furniture.dimsMm.y} x {furniture.dimsMm.z} mm · versión {furniture.designVersion}
      </p>
      <p className="mt-3 text-sm text-slate-600">
        El escaneo se simula: tocá un QR para abrir la ficha de esa pieza, como si lo hubieras escaneado.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/p/${furniture.qrId}`}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Ver mueble completo
        </Link>
        <Link
          href="/qr"
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:ring-orange-400"
        >
          QR para escanear / imprimir
        </Link>
      </div>

      {listModules().map((mod) => {
        const modPieces = pieces.filter((p) => p.moduleId === mod.id);
        if (modPieces.length === 0) return null;
        return (
          <section key={mod.id} className="mt-6">
            <h2 className="text-sm font-semibold text-slate-500">
              <Link href={`/p/${mod.qrId}`} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800">
                {mod.name}
              </Link>{" "}
              <span className="font-normal">(ver módulo)</span>
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {modPieces.map((piece) => (
                <li key={piece.qrId}>
                  <Link
                    href={`/p/${piece.qrId}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-400"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-orange-600">{piece.code}</span>
                      <span className="block font-medium text-slate-900">{piece.name}</span>
                      <span className="block text-xs text-slate-500">
                        {piece.lengthMm} x {piece.widthMm} mm · {edgeSummary(piece.edgeBanding)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      x{piece.quantity}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
