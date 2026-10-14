import Link from "next/link";
import type { Furniture } from "@/data/types";
import { edgeSummary } from "@/lib/edgeText";
import type { QrTarget } from "@/lib/lookup";
import { shortCode } from "@/model/ids";
import { NewerVersionBanner } from "./NewerVersionBanner";

type ModuleTarget = Extract<QrTarget, { kind: "module" }>;

/** Ficha de módulo: sus tipos de pieza. */
export function ModuleSheet({ target, furniture }: { target: ModuleTarget; furniture: Furniture }) {
  const totalPieces = target.pieces.reduce((sum, piece) => sum + piece.quantity, 0);

  return (
    <article className="mx-auto flex max-w-xl flex-col gap-5 p-4 pb-10 lg:p-8">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Lista de QR
      </Link>

      {furniture.newerVersionAvailable && <NewerVersionBanner currentVersion={furniture.designVersion} />}

      <header>
        <p className="text-sm font-semibold tracking-wide text-orange-600">Módulo</p>
        <h1 className="text-2xl font-bold text-slate-900">{target.module.name}</h1>
        <p className="text-sm text-slate-500">
          <Link href={`/p/${furniture.qrId}`} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800">
            {furniture.name}
          </Link>
        </p>
      </header>

      <p className="text-sm text-slate-600">
        {target.pieces.length} {target.pieces.length === 1 ? "tipo de pieza" : "tipos de pieza"} ({totalPieces}{" "}
        {totalPieces === 1 ? "pieza" : "piezas"}). En el 3D se resaltan todas las piezas del módulo.
      </p>

      <section aria-labelledby="piezas">
        <h2 id="piezas" className="mb-2 text-base font-semibold text-slate-900">
          Piezas del módulo
        </h2>
        <ul className="flex flex-col gap-2">
          {target.pieces.map((piece) => (
            <li key={piece.qrId}>
              <Link
                href={`/p/${piece.qrId}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-400"
              >
                <span>
                  <span className="block text-sm font-semibold text-orange-600">{shortCode(piece.code)}</span>
                  <span className="block font-medium text-slate-900">{piece.name}</span>
                  <span className="block text-xs text-slate-500">
                    {piece.lengthMm} x {piece.widthMm} mm · {piece.material} · {edgeSummary(piece.edgeBanding)}
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
    </article>
  );
}
