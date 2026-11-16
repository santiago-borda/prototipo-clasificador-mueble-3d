"use client";

// /backoffice/csv/<id> "En revisión" (spike, docs/spec-proto-csv-ocl.md §4.2). Recalcula el cruce en el navegador
// desde los archivos guardados y lo compara con el registrado. Por pieza: certeza, razones, CSV contra .dae y esquema
// de canteado. Aprobar solo con 0 dudosas, 0 huérfanas y 0 filas sin código (si no, deshabilitado con el motivo);
// rechazar pide motivo. Con dudosas solo se puede rechazar: resolverlas queda fuera del spike.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EdgeBandingDiagram } from "@/components/EdgeBandingDiagram";
import type { EdgeId } from "@/data/types";
import { loadCarga, type LoadedCarga } from "@/proto-csv/browser";
import { useUploadKey } from "@/proto-csv/keyStore";
import { approveBlockers, type TypeReview } from "@/proto-csv/review";
import { ESTADO_TEXT, SOURCE_TEXT, reasonText } from "@/proto-csv/texts";
import { KeyField } from "./KeyField";

const ReviewViewer = dynamic(() => import("./ReviewViewer"), { ssr: false, loading: () => <div className="h-80 rounded-lg bg-slate-100" /> });

const mm = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const SIDE: Record<string, string> = { s1: "inferior", s2: "superior", s3: "izquierdo", s4: "derecho" };

export function Badge({ level }: { level: "segura" | "dudosa" }) {
  return level === "segura" ? (
    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">segura</span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">dudosa</span>
  );
}

export function EstadoBadge({ estado }: { estado: string }) {
  const color = estado === "aprobado" || estado === "publicado-simulado" ? "bg-teal-600" : estado === "rechazado" ? "bg-red-600" : "bg-slate-700";
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold text-white ${color}`}>{ESTADO_TEXT[estado] ?? estado}</span>;
}

function PieceDetail({ type }: { type: TypeReview }) {
  const piece = type.piece;
  const csvSorted = piece ? [piece.thicknessMm, piece.widthMm, piece.lengthMm].sort((a, b) => a - b) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-mono text-sm font-semibold text-slate-900">{type.code}</h3>
        <Badge level={type.level} />
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase text-slate-500">Razones</h4>
        {type.reasons.length === 0 ? (
          <p className="text-sm text-teal-800">Ninguna: código exacto, cantidad y medidas coinciden con el .dae.</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
            {type.reasons.map((r) => (
              <li key={`${r.source}-${r.reason}`}>
                {reasonText(r.reason)} <span className="text-xs text-slate-500">({SOURCE_TEXT[r.source]}: {r.reason})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase text-slate-500">CSV contra .dae</h4>
        <table className="mt-1 w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Fuente</th>
              <th className="py-1 pr-2 font-medium">Medidas ordenadas (mm)</th>
              <th className="py-1 font-medium">Caras de canto</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr className="border-t border-slate-100">
              <td className="py-1 pr-2 font-sans">CSV × {piece ? piece.quantity : "?"}</td>
              <td className="py-1 pr-2">{csvSorted ? csvSorted.map(mm).join(" × ") : "excluido del listado"}</td>
              <td className="py-1 font-sans">
                {piece ? (["s2", "s1", "s3", "s4"] as const).filter((s) => piece.strips[s]).map((s) => SIDE[s]).join(", ") || "sin canto" : "—"}
              </td>
            </tr>
            {type.instances.map((i) => (
              <tr key={i.instanceKey} className="border-t border-slate-100">
                <td className="py-1 pr-2 font-sans">
                  .dae <span className="text-slate-400">{i.instanceKey}</span>
                </td>
                <td className="py-1 pr-2">{i.sizeMm.map(mm).join(" × ")}</td>
                <td className="py-1">{i.edgeRunsMm === "no-disponible" ? "ninguna" : i.edgeRunsMm.map(mm).join(", ")}</td>
              </tr>
            ))}
            {type.instances.length === 0 && (
              <tr className="border-t border-slate-100">
                <td colSpan={3} className="py-1 font-sans text-amber-800">
                  El .dae no tiene ninguna instancia con este código.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">
          Canteado contra el .dae: <span className="font-medium">{type.edgeCheck}</span>. Se cuentan lados L y A; un canto del lado opuesto no se
          detecta (limitación conocida).
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase text-slate-500">Esquema de canteado</h4>
        {piece && Array.isArray(piece.edgeBanding) ? (
          <EdgeBandingDiagram lengthMm={piece.lengthMm} widthMm={piece.widthMm} edges={piece.edgeBanding as readonly EdgeId[]} />
        ) : (
          <p className="text-sm text-slate-500">Sin esquema: el código quedó excluido del listado.</p>
        )}
      </div>
    </div>
  );
}

export function CsvReviewScreen({ id }: { id: string }) {
  const key = useUploadKey();
  const [carga, setCarga] = useState<LoadedCarga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** Sube tras cada acción para volver a leer la carga del servidor. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadCarga(id);
        if (cancelled) return;
        setCarga(loaded);
        setSelected((s) => s ?? (loaded.analysis.ok ? (loaded.analysis.review.types.find((t) => t.level === "dudosa") ?? loaded.analysis.review.types[0])?.code ?? null : null));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const dudosas = useMemo(() => new Set(carga?.analysis.ok ? carga.analysis.review.types.filter((t) => t.level === "dudosa").map((t) => t.code) : []), [carga]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-sm">
        <p className="text-red-800">{error}</p>
        <Link href="/backoffice/csv" className="mt-3 inline-block underline">
          Volver al backoffice
        </Link>
      </main>
    );
  }
  if (!carga) return <main className="mx-auto max-w-3xl p-6 text-sm text-slate-500">Cargando la carga y recalculando el cruce…</main>;

  const { informe, estado, eventos, analysis } = carga;
  if (!analysis.ok) return <main className="mx-auto max-w-3xl p-6 text-sm text-red-800">{carga.mismatch}</main>;
  const { review, parse } = analysis;
  const blockers = [...approveBlockers(review, parse.listing.status), ...(carga.mismatch ? [carga.mismatch] : [])];
  const type = review.types.find((t) => t.code === selected) ?? null;
  const rejected = eventos.find((e) => e.estado === "rechazado");

  async function change(to: "aprobado" | "rechazado") {
    setBusy(true);
    setActionError(null);
    const res = await fetch(`/api/proto-csv/${id}/estado`, {
      method: "POST",
      headers: { "x-import-key": key, "content-type": "application/json" },
      body: JSON.stringify({ estado: to, motivo: to === "rechazado" ? motivo : undefined }),
    });
    setBusy(false);
    if (!res.ok) return setActionError(((await res.json()) as { error?: string }).error ?? `Error ${res.status}`);
    setVersion((v) => v + 1);
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 lg:p-8">
      <Link href="/backoffice/csv" className="text-sm text-slate-500 underline">
        ← Backoffice
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">Carga {id}</h1>
        <EstadoBadge estado={estado} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Registrada {new Date(informe.fecha).toLocaleString("es-AR")} · {informe.csv.tipos} tipos, {informe.csv.piezas} piezas, {informe.csv.edgeTotalMm} mm de canto ·
        modelId <span className="font-mono">{informe.modelId.slice(7, 19)}…</span> · listadoId{" "}
        <span className="font-mono">{informe.listadoId ? `${informe.listadoId.slice(7, 19)}…` : "— (borrador)"}</span> · cruce calculado en el navegador
      </p>
      {carga.mismatch && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">{carga.mismatch}</p>}

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Código</th>
                <th className="py-2 pr-2 font-medium">L × A × e (mm)</th>
                <th className="py-2 pr-2 font-medium">Cant. CSV / .dae</th>
                <th className="py-2 pr-2 font-medium">Material</th>
                <th className="py-2 font-medium">Certeza</th>
              </tr>
            </thead>
            <tbody>
              {review.types.map((t) => (
                <tr
                  key={t.code}
                  onClick={() => setSelected(t.code)}
                  className={`cursor-pointer border-t border-slate-100 ${t.code === selected ? "bg-teal-50" : "hover:bg-slate-50"}`}
                >
                  <td className="py-2 pr-2 font-mono">{t.code}</td>
                  <td className="py-2 pr-2">{t.piece ? `${mm(t.piece.lengthMm)} × ${mm(t.piece.widthMm)} × ${mm(t.piece.thicknessMm)}` : "—"}</td>
                  <td className={`py-2 pr-2 ${t.piece && t.piece.quantity !== t.instances.length ? "font-semibold text-amber-800" : ""}`}>
                    {t.piece ? t.piece.quantity : "?"} / {t.instances.length}
                  </td>
                  <td className="py-2 pr-2">{t.piece?.material ?? "—"}</td>
                  <td className="py-2">
                    <Badge level={t.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {review.orphanInstances.length > 0 && (
            <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Instancias del .dae sin fila en el CSV</p>
              <ul className="mt-1 list-disc pl-5">
                {review.orphanInstances.map((o) => (
                  <li key={o.instanceKey}>
                    <span className="font-mono">{o.rawName ?? o.instanceKey}</span>: {o.reasons.map(reasonText).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {review.unkeyedRows > 0 && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{review.unkeyedRows} filas del CSV sin código válido.</p>}
          {review.looseMeshes > 0 && <p className="mt-2 text-xs text-slate-500">{review.looseMeshes} mallas del .dae sin componente (informativo, no bloquea).</p>}

          <div className="mt-6">
            <ReviewViewer url={`/api/proto-csv/${id}/archivo/modelo.dae`} selected={selected} dudosas={dudosas} />
            <p className="mt-1 text-xs text-slate-500">Verde: pieza elegida · ámbar: dudosas · gris: el resto. Arrastrá para girar.</p>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 p-4">{type ? <PieceDetail type={type} /> : <p className="text-sm text-slate-500">Elegí una pieza.</p>}</aside>
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 p-4">
        <h2 className="text-base font-semibold text-slate-900">Decisión</h2>
        {estado === "en-revision" && (
          <>
            <p className="mt-1 text-xs text-slate-500">La revisión humana se limita a aprobar o rechazar: no se editan datos ni se resuelven dudosas en el spike.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <KeyField />
              <div>
                <button
                  type="button"
                  disabled={blockers.length > 0 || !key || busy}
                  onClick={() => change("aprobado")}
                  className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Aprobar
                </button>
                {blockers.length > 0 && (
                  <p className="mt-2 text-sm text-amber-900">
                    <span className="font-semibold">No se puede aprobar:</span> {blockers.join(" ")} Con dudosas solo se puede rechazar.
                  </p>
                )}
                {blockers.length === 0 && !key && <p className="mt-2 text-xs text-slate-500">Ingresá la clave para aprobar o rechazar.</p>}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Motivo del rechazo (obligatorio)</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <button
                type="button"
                disabled={motivo.trim() === "" || !key || busy}
                onClick={() => change("rechazado")}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
              >
                Rechazar
              </button>
            </div>
          </>
        )}
        {estado === "aprobado" && (
          <p className="mt-2 text-sm text-teal-800">
            Aprobada. <Link href={`/backoffice/csv/${id}/publicar`} className="font-semibold underline">Ir a publicar (simulado)</Link>
          </p>
        )}
        {estado === "publicado-simulado" && (
          <p className="mt-2 text-sm text-teal-800">
            Publicada (simulado). <Link href={`/backoffice/csv/${id}/publicar`} className="font-semibold underline">Ver QR y etiquetas</Link>
          </p>
        )}
        {estado === "rechazado" && <p className="mt-2 text-sm text-red-800">Rechazada: «{rejected?.motivo ?? "sin motivo"}». La carga queda cerrada; para corregir, subí una nueva.</p>}
        {actionError && <p className="mt-3 text-sm text-red-800">{actionError}</p>}
        <ol className="mt-4 text-xs text-slate-500">
          {eventos.map((e) => (
            <li key={e.n}>
              {e.n}. {ESTADO_TEXT[e.estado]} · {new Date(e.fecha).toLocaleString("es-AR")}
              {e.motivo ? ` · «${e.motivo}»` : ""}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
