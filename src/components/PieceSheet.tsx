import Link from "next/link";
import type { Furniture, PieceType } from "@/data/types";
import { edgeSummary } from "@/lib/edgeText";
import { getModule } from "@/lib/lookup";
import { shortCode } from "@/model/ids";
import { EdgeBandingDiagram } from "./EdgeBandingDiagram";
import { NewerVersionBanner } from "./NewerVersionBanner";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function PieceSheet({ piece, furniture }: { piece: PieceType; furniture: Furniture }) {
  const mod = getModule(piece.moduleId);
  const spec = furniture.edgeBandSpec;
  const specText = `${spec.type} ${spec.widthMm} x ${String(spec.thicknessMm).replace(".", ",")} mm (${spec.status}${spec.note ? `; ${spec.note}` : ""})`;

  return (
    <article className="mx-auto flex max-w-xl flex-col gap-5 p-4 pb-10 lg:p-8">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Lista de QR
      </Link>

      {furniture.newerVersionAvailable && <NewerVersionBanner currentVersion={furniture.designVersion} />}

      <header>
        <p className="text-sm font-semibold tracking-wide text-orange-600">{shortCode(piece.code)}</p>
        <h1 className="text-2xl font-bold text-slate-900">{piece.name}</h1>
        <p className="text-sm text-slate-500">
          <Link href={`/p/${furniture.qrId}`} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800">
            {furniture.name}
          </Link>
          {" · "}
          {mod ? (
            <Link href={`/p/${mod.qrId}`} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800">
              {mod.name}
            </Link>
          ) : (
            "—"
          )}
        </p>
      </header>

      <section aria-labelledby="datos">
        <h2 id="datos" className="sr-only">
          Datos de la pieza
        </h2>
        <dl>
          <Row label="N° de pieza" value={piece.code} />
          <Row label="Medidas (largo x ancho)" value={`${piece.lengthMm} x ${piece.widthMm} mm`} />
          <Row label="Espesor" value={`${piece.thicknessMm} mm`} />
          <Row label="Material" value={piece.material} />
          <Row label="Piezas equivalentes" value={String(piece.quantity)} />
        </dl>
      </section>

      <section aria-labelledby="canteado" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 id="canteado" className="text-base font-semibold text-slate-900">
          Canteado
        </h2>
        <p className="mb-3 text-lg text-slate-800">{edgeSummary(piece.edgeBanding)}</p>
        <EdgeBandingDiagram lengthMm={piece.lengthMm} widthMm={piece.widthMm} edges={piece.edgeBanding} />
        {piece.edgeBanding.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Canto {specText}. En el 3D, los bordes con canto se marcan en azul y la esquina de referencia con un punto oscuro.
          </p>
        )}
      </section>

      <section aria-labelledby="obs">
        <h2 id="obs" className="text-base font-semibold text-slate-900">
          Observaciones
        </h2>
        <p className="text-sm text-slate-700">{piece.notes ?? "—"}</p>
      </section>
    </article>
  );
}
