import Link from "next/link";
import type { QrTarget } from "@/lib/lookup";
import { shortCode } from "@/model/ids";
import { NewerVersionBanner } from "./NewerVersionBanner";

type FurnitureTarget = Extract<QrTarget, { kind: "furniture" }>;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

/** Ficha de mueble: medidas generales, versión y sus módulos. */
export function FurnitureSheet({ target }: { target: FurnitureTarget }) {
  const { furniture, modules } = target;
  const spec = furniture.edgeBandSpec;
  const pieces = target.def.pieceTypes;

  return (
    <article className="mx-auto flex max-w-xl flex-col gap-5 p-4 pb-10 lg:p-8">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Lista de QR
      </Link>

      {furniture.newerVersionAvailable && <NewerVersionBanner currentVersion={furniture.designVersion} />}

      <header>
        <p className="text-sm font-semibold tracking-wide text-orange-600">Mueble</p>
        <h1 className="text-2xl font-bold text-slate-900">{furniture.name}</h1>
      </header>

      <dl>
        <Row label="Medidas generales (ancho x alto x prof.)" value={`${furniture.dimsMm.x} x ${furniture.dimsMm.y} x ${furniture.dimsMm.z} mm`} />
        <Row label="Versión del diseño" value={furniture.designVersion} />
        <Row label="Canto" value={`${spec.type} ${spec.widthMm} x ${String(spec.thicknessMm).replace(".", ",")} mm (${spec.status}${spec.note ? `; ${spec.note}` : ""})`} />
        <Row label="Módulos" value={String(modules.length)} />
      </dl>

      <section aria-labelledby="modulos">
        <h2 id="modulos" className="mb-2 text-base font-semibold text-slate-900">
          Módulos
        </h2>
        <ul className="flex flex-col gap-2">
          {modules.map((mod) => {
            const modPieces = pieces.filter((piece) => piece.moduleId === mod.id);
            return (
              <li key={mod.id}>
                <Link
                  href={`/p/${mod.qrId}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-400"
                >
                  <span>
                    <span className="block font-medium text-slate-900">{mod.name}</span>
                    <span className="block text-xs text-slate-500">{modPieces.map((piece) => shortCode(piece.code)).join(", ")}</span>
                  </span>
                  <span className="shrink-0 text-sm text-slate-500">{modPieces.length} tipos de pieza →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-slate-500">
        Tocá una pieza del 3D con ficha (en verde azulado) o elegí un módulo para ver su detalle.
      </p>
    </article>
  );
}
