"use client";

// /backoffice/csv/<id>/publicar (spike, docs/spec-proto-csv-ocl.md §4.3): "Publicar" simulado. Desde `aprobado`
// pasa a `publicado-simulado` y muestra la vista previa: la URL de cada QR SOLO como texto (sin imagen escaneable:
// dominio de producción sin definir, consulta 59) y una etiqueta por pieza física. Nada se imprime.

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadCarga, type LoadedCarga } from "@/proto-csv/browser";
import { PREVIEW_MARK, qrPreview } from "@/proto-csv/labels";
import { EstadoBadge } from "./CsvReviewScreen";

export function CsvPublishScreen({ id }: { id: string }) {
  const [carga, setCarga] = useState<LoadedCarga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Sube tras publicar para volver a leer la carga del servidor. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadCarga(id);
        if (!cancelled) setCarga(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (error) return <main className="mx-auto max-w-3xl p-6 text-sm text-red-800">{error}</main>;
  if (!carga) return <main className="mx-auto max-w-3xl p-6 text-sm text-slate-500">Cargando…</main>;
  const { estado, analysis } = carga;

  async function publish() {
    setBusy(true);
    const res = await fetch(`/api/proto-csv/${id}/estado`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: "publicado-simulado" }),
    });
    setBusy(false);
    if (!res.ok) return setError(((await res.json()) as { error?: string }).error ?? `Error ${res.status}`);
    setVersion((v) => v + 1);
  }

  const previews = analysis.ok ? qrPreview(id.slice(0, 8), analysis.parse.listing.pieces) : [];
  const labels = previews.flatMap((p) => p.labels);

  return (
    <main className="mx-auto w-full max-w-5xl p-4 lg:p-8">
      <Link href={`/backoffice/csv/${id}`} className="text-sm text-slate-500 underline">
        ← Revisión
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">Publicar (simulado) · carga {id}</h1>
        <EstadoBadge estado={estado} />
      </div>

      {estado === "aprobado" && (
        <section className="mt-4 rounded-lg border border-slate-200 p-4">
          <button type="button" disabled={busy} onClick={publish} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Publicar (simulado)
          </button>
          <p className="text-xs text-slate-500 sm:col-span-2">No se publica nada de verdad: solo cambia el estado y se genera la vista previa.</p>
        </section>
      )}
      {estado !== "aprobado" && estado !== "publicado-simulado" && (
        <p className="mt-4 text-sm text-slate-700">Solo se puede publicar una carga aprobada.</p>
      )}

      {estado === "publicado-simulado" && (
        <>
          <p className="mt-4 rounded-md border-2 border-dashed border-red-400 bg-red-50 px-3 py-2 text-center text-sm font-bold tracking-wide text-red-800">{PREVIEW_MARK}</p>
          <p className="mt-2 text-xs text-slate-500">
            Los QR van solo como texto de URL: no se genera ninguna imagen escaneable hasta definir el dominio de producción (consulta 59). El dominio de
            prueba no resuelve.
          </p>

          <h2 className="mt-6 text-base font-semibold text-slate-900">Un QR por tipo de pieza ({previews.length})</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {previews.map((p) => (
              <li key={p.qrId} className="py-2">
                <span className="font-mono">{p.code}</span> → <span className="break-all font-mono text-slate-600">{p.qrUrlText}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 text-base font-semibold text-slate-900">Etiquetas, una por pieza física ({labels.length})</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {labels.map((l) => (
              <article key={l.title + l.code} className="relative rounded-md border border-slate-300 p-3 text-sm">
                <p className="text-[10px] font-bold tracking-wide text-red-700">{l.mark}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{l.title}</p>
                <p className="font-mono text-xs text-slate-600">{l.code}</p>
                <p className="mt-1">{l.dims}</p>
                <p className="text-slate-600">{l.material}</p>
                <p className="text-slate-600">{l.edges}</p>
                <p className="mt-2 break-all font-mono text-[11px] text-slate-500">QR (texto): {l.qrUrlText}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
