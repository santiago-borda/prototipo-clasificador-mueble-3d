"use client";

// /backoffice/csv (spike, docs/spec-proto-csv-ocl.md §4.1): subir el Listado de piezas (CSV) + .dae + texturas y,
// opcional, el SVG de la placa. Se analiza en el navegador antes de subir; un CSV que no se puede leer se rechaza con
// lo que hay que exportar o corregir. Abajo, la lista de cargas (también las incompletas) con el botón de borrar.

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { newImportId } from "@/importer/paths";
import { analyze, type Analysis } from "@/proto-csv/browser";
import { parseOclCsv } from "@/proto-csv/parse";
import { useUploadKey } from "@/proto-csv/keyStore";
import { MAX_BYTES, MAX_CARGAS, isSafeFileName, materialSlug, protoPath } from "@/proto-csv/paths";
import { approveBlockers, summarizeReview } from "@/proto-csv/review";
import { ESTADO_TEXT, REJECTION_TEXT } from "@/proto-csv/texts";
import { FileDrop } from "./FileDrop";
import { KeyField } from "./KeyField";

interface CargaItem {
  id: string;
  registrada: boolean;
  estado: string | null;
  fecha: string | null;
}

function Rejection({ title, message, fix }: { title: string; message: string; fix?: string }) {
  return (
    <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{message}</p>
      {fix && <p className="mt-2 text-red-800">Qué hacer: {fix}</p>}
    </div>
  );
}

function AnalysisBox({ analysis }: { analysis: Analysis }) {
  if (!analysis.ok && analysis.stage === "csv") {
    const text = REJECTION_TEXT[analysis.rejection.reason];
    return <Rejection title={`Carga rechazada: ${text.title}`} message={analysis.rejection.message} fix={text.fix} />;
  }
  if (!analysis.ok) return <Rejection title="Carga rechazada: no se pudo leer el .dae" message={analysis.message} />;
  const { review, parse } = analysis;
  const blockers = approveBlockers(review, parse.listing.status);
  const segura = review.types.filter((t) => t.level === "segura").length;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <p className="font-semibold text-slate-900">Análisis antes de subir</p>
      <p className="mt-1 text-slate-700">
        {review.types.length} tipos de pieza · {segura} seguras · {review.dudosas} dudosas · {review.orphanInstances.length} instancias del .dae sin fila ·{" "}
        {parse.edgeTotalMm} mm de canto
      </p>
      {blockers.length > 0 ? (
        <p className="mt-2 text-amber-800">Se puede subir, pero en la revisión solo se podrá rechazar: {blockers.join(" ")}</p>
      ) : (
        <p className="mt-2 text-teal-800">Sin dudosas: en la revisión se podrá aprobar.</p>
      )}
    </div>
  );
}

export function CsvBackoffice({ configured }: { configured: boolean }) {
  const router = useRouter();
  const key = useUploadKey();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [daeFile, setDaeFile] = useState<File | null>(null);
  const [textures, setTextures] = useState<File[]>([]);
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [svgMaterial, setSvgMaterial] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CargaItem[] | null>(null);

  useEffect(() => {
    if (!csvFile) return;
    let cancelled = false;
    (async () => {
      const csvText = await csvFile.text();
      // Sin .dae todavía: si el CSV ya se rechaza, se avisa enseguida (no hace falta esperar al modelo).
      if (!daeFile) {
        const parse = parseOclCsv(csvText);
        if (!cancelled && !parse.ok) setAnalysis({ ok: false, stage: "csv", rejection: parse });
        return;
      }
      const result = await analyze(csvText, new Uint8Array(await daeFile.arrayBuffer()));
      if (!cancelled) setAnalysis(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [csvFile, daeFile]);

  const materials = useMemo(
    () => (analysis?.ok ? [...new Set(analysis.parse.listing.pieces.map((p) => p.material))].sort() : []),
    [analysis],
  );

  const fileProblems: string[] = [];
  if (csvFile && csvFile.size > MAX_BYTES.csv) fileProblems.push("El CSV supera 1 MB.");
  if (daeFile && daeFile.size > MAX_BYTES.dae) fileProblems.push("El .dae supera 10 MB.");
  for (const t of textures) {
    if (!isSafeFileName(t.name) || !/\.(jpe?g|png)$/i.test(t.name)) fileProblems.push(`Textura «${t.name}»: renombrala con letras, números, «.», «_» o «-» y extensión .jpg o .png.`);
    else if (t.size > MAX_BYTES.textura) fileProblems.push(`Textura «${t.name}»: supera 5 MB.`);
  }
  if (svgFile && !svgMaterial) fileProblems.push("Elegí a qué material corresponde el SVG (el SVG no lo dice).");
  if (svgFile && svgFile.size > MAX_BYTES.svg) fileProblems.push("El SVG supera 1 MB.");

  const headers = { "x-import-key": key };
  const canUpload = Boolean(configured && key && analysis?.ok && csvFile && daeFile && fileProblems.length === 0 && !busy);

  async function refreshList() {
    setError(null);
    const res = await fetch("/api/proto-csv", { headers, cache: "no-store" });
    if (res.status === 401) return setError("La clave es incorrecta.");
    if (!res.ok) return setError(`No se pudo listar las cargas (error ${res.status}).`);
    setItems(((await res.json()) as { cargas: CargaItem[] }).cargas);
  }

  async function remove(id: string, registrada: boolean) {
    const what = registrada ? "la carga" : "la carga incompleta";
    if (!window.confirm(`¿Borrar ${what} ${id}? No se puede deshacer.`)) return;
    const res = await fetch(`/api/proto-csv/${id}`, { method: "DELETE", headers });
    if (!res.ok) return setError(`No se pudo borrar (error ${res.status}).`);
    await refreshList();
  }

  async function handleUpload() {
    if (!analysis?.ok || !csvFile || !daeFile) return;
    setError(null);
    const id = newImportId();
    const options = { access: "private", handleUploadUrl: "/api/proto-csv/token", headers } as const;
    try {
      setBusy("Subiendo el .dae…");
      await upload(protoPath(id, "modelo.dae"), daeFile, { ...options, contentType: "model/vnd.collada+xml" });
      setBusy("Subiendo el CSV…");
      await upload(protoPath(id, "listado.csv"), csvFile, { ...options, contentType: "text/csv" });
      for (const t of textures) {
        setBusy(`Subiendo la textura ${t.name}…`);
        await upload(protoPath(id, `texturas/${t.name}`), t, { ...options, contentType: t.type || "image/jpeg" });
      }
      if (svgFile) {
        setBusy("Subiendo el SVG…");
        await upload(protoPath(id, `diagrama-${materialSlug(svgMaterial)}.svg`), svgFile, { ...options, contentType: "image/svg+xml" });
      }
      setBusy("Registrando…");
      const res = await fetch("/api/proto-csv", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          id,
          modelId: analysis.modelId,
          cruce: summarizeReview(analysis.review),
          svgMaterial: svgFile ? svgMaterial : null,
          nombres: { csv: csvFile.name, dae: daeFile.name },
        }),
      });
      const body = (await res.json()) as { error?: string; code?: string; limpieza?: string };
      if (!res.ok) {
        const text = body.code && body.code in REJECTION_TEXT ? REJECTION_TEXT[body.code as keyof typeof REJECTION_TEXT].fix : "";
        const cleanup = body.limpieza === "fallida" ? " No se pudo borrar lo subido: borrala desde la lista." : "";
        throw new Error(`${body.error ?? `Error ${res.status}`}${text ? ` Qué hacer: ${text}` : ""}${cleanup}`);
      }
      router.push(`/backoffice/csv/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refreshList().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4 lg:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Prototipo descartable · carga por CSV de OpenCutList</p>
      <h1 className="mt-1 text-xl font-bold text-slate-900">Backoffice: nueva carga</h1>
      {!configured && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Carga por CSV no configurada en este entorno.</p>}

      <p className="mt-2 text-sm text-slate-600">
        Subí los archivos exportados del mueble. Los dos primeros son obligatorios. Antes de subir se revisan en tu navegador y se te avisa si falta algo.
      </p>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <FileDrop
          step={1}
          title="Listado de piezas"
          formats={[".csv"]}
          accept=".csv,text/csv"
          required
          hint="OpenCutList → pestaña Piezas → Exportar → fuente «Listado de piezas», formato CSV, separador punto y coma."
          files={csvFile ? [csvFile] : []}
          onFiles={(f) => (setAnalysis(null), setCsvFile(f[0] ?? null))}
        />
        <FileDrop
          step={2}
          title="Modelo 3D"
          formats={[".dae"]}
          accept=".dae"
          required
          hint="SketchUp → Archivo → Exportar → Modelo 3D → formato COLLADA (.dae)."
          files={daeFile ? [daeFile] : []}
          onFiles={(f) => (setAnalysis(null), setDaeFile(f[0] ?? null))}
        />
        <FileDrop
          step={3}
          title="Texturas"
          formats={[".jpg", ".png"]}
          accept=".jpg,.jpeg,.png"
          required={false}
          multiple
          hint="Las imágenes de las placas que usa el modelo. Podés elegir varias a la vez."
          files={textures}
          onFiles={setTextures}
        />
        <div>
          <FileDrop
            step={4}
            title="Diagrama de la placa"
            formats={[".svg"]}
            accept=".svg,image/svg+xml"
            required={false}
            hint="OpenCutList → Diagrama de corte → mostrar los cortes → exportar en SVG."
            files={svgFile ? [svgFile] : []}
            onFiles={(f) => setSvgFile(f[0] ?? null)}
          />
          {svgFile && (
            <label className="mt-2 block text-sm">
              <span className="font-medium text-slate-700">¿De qué material es este diagrama?</span>
              <select value={svgMaterial} onChange={(e) => setSvgMaterial(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5">
                <option value="">Elegí el material…</option>
                {materials.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {materials.length === 0 && <span className="mt-1 block text-xs text-slate-500">Primero elegí el listado de piezas y el modelo 3D.</span>}
            </label>
          )}
        </div>
      </section>

      {analysis && <AnalysisBox analysis={analysis} />}
      {fileProblems.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-sm text-red-800">
          {fileProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <KeyField />
        <button type="button" disabled={!canUpload} onClick={handleUpload} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy ?? "Subir y pasar a revisión"}
        </button>
      </section>
      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Cargas guardadas</h2>
          <button type="button" disabled={!key} onClick={refreshList} className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">
            {items ? "Actualizar" : "Ver cargas"}
          </button>
        </div>
        {items && (
          <>
            <p className="mt-1 text-xs text-slate-500">
              {items.length} de {MAX_CARGAS} (el tope cuenta también las incompletas hasta borrarlas).
            </p>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {items.length === 0 && <li className="py-2 text-slate-500">No hay cargas.</li>}
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {item.registrada ? (
                      <Link href={`/backoffice/csv/${item.id}`} className="font-mono underline">
                        {item.id}
                      </Link>
                    ) : (
                      <span className="font-mono">{item.id}</span>
                    )}{" "}
                    <span className={item.registrada ? "text-slate-600" : "text-amber-700"}>
                      · {item.registrada ? (ESTADO_TEXT[item.estado ?? ""] ?? item.estado) : "incompleta (sin registrar)"}
                    </span>
                  </span>
                  <button type="button" onClick={() => remove(item.id, item.registrada)} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">
                    Borrar
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
