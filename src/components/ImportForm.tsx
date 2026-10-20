"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportListItem } from "@/importer/api";
import { parseDaeFile } from "@/importer/browserModel";
import { MAX_CSV_BYTES, MAX_DAE_BYTES, importPaths, newImportId } from "@/importer/paths";
import { buildImportReport, type ImportReport, type ImportStatus } from "@/importer/report";

const STATUS_STYLE: Record<ImportStatus, { label: string; className: string }> = {
  correcto: { label: "Correcto", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  "con-advertencias": { label: "Con advertencias (se puede subir)", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  bloqueado: { label: "Bloqueado: corregí el CSV para poder subir", className: "bg-red-50 text-red-800 ring-red-200" },
};

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

function linkFor(importId: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim() || window.location.origin;
  return `${base}/prueba/${importId}`;
}

function Warnings({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-slate-800">
        {title} ({items.length})
      </h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
        {items.slice(0, 30).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
        {items.length > 30 && <li>… y {items.length - 30} más</li>}
      </ul>
    </div>
  );
}

function ReportView({ report }: { report: ImportReport }) {
  const style = STATUS_STYLE[report.status];
  const { verification: v, association: a } = report;
  return (
    <section aria-label="Informe de validación" className="mt-4">
      <p className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ${style.className}`}>{style.label}</p>

      {report.issues.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Fila</th>
                <th className="py-1 pr-3">Columna</th>
                <th className="py-1">Problema</th>
              </tr>
            </thead>
            <tbody>
              {report.issues.map((issue, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="py-1 pr-3 tabular-nums">{issue.row}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{issue.column}</td>
                  <td className={`py-1 ${issue.severity === "error" ? "text-red-700" : "text-amber-700"}`}>
                    {issue.severity === "error" ? "Error: " : "Aviso: "}
                    {issue.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {v && a && report.def && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Tipos de pieza en el CSV</dt>
            <dd className="text-right font-medium">{v.types}</dd>
            <dt className="text-slate-500">Instancias en el .dae</dt>
            <dd className="text-right font-medium">{v.instances}</dd>
            <dt className="text-slate-500">Medidas generales (del .dae)</dt>
            <dd className="text-right font-medium">
              {report.def.furniture.dimsMm.x} x {report.def.furniture.dimsMm.y} x {report.def.furniture.dimsMm.z} mm
            </dd>
            <dt className="text-slate-500">Mayor desvío de medidas</dt>
            <dd className="text-right font-medium">{v.maxDeviationMm.toFixed(2)} mm</dd>
          </dl>
          <Warnings title="Tipos o medidas que no coinciden con el .dae" items={v.warnings} />
          <Warnings title="Instancias del .dae sin tipo de pieza en el CSV" items={a.orphans} />
          <Warnings title="Instancias reclamadas por más de un tipo" items={a.ambiguous} />
          <Warnings title="Rarezas del .dae (informativas)" items={v.anomalies} />
        </>
      )}
    </section>
  );
}

interface Parsed {
  report: ImportReport;
}

export function ImportForm({ configured }: { configured: boolean }) {
  const [daeFile, setDaeFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [key, setKey] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; estado: ImportStatus } | null>(null);
  const [items, setItems] = useState<ImportListItem[] | null>(null);
  // Solo para armar el informe (el id real se genera al subir).
  const previewId = useMemo(() => newImportId(), []);
  const runRef = useRef(0);

  // Al cambiar un archivo se descarta el informe anterior (el efecto de abajo arma el nuevo).
  function pick(setFile: (file: File | null) => void, file: File | null) {
    setFile(file);
    setParsed(null);
    setParseError(null);
    setDone(null);
  }

  // Valida en el navegador apenas hay .dae y CSV (el servidor revalida el CSV al registrar).
  useEffect(() => {
    const run = ++runRef.current;
    if (!daeFile || !csvFile) return;
    const tooBig = daeFile.size > MAX_DAE_BYTES ? `El .dae pesa más de ${mb(MAX_DAE_BYTES)}.` : csvFile.size > MAX_CSV_BYTES ? "El CSV pesa más de 1 MB." : null;
    (async () => {
      try {
        if (tooBig) throw new Error(tooBig);
        const [model, csvText] = await Promise.all([parseDaeFile(daeFile), csvFile.text()]);
        const report = buildImportReport({ csvText, parts: model.parts, importId: previewId });
        if (run === runRef.current) setParsed({ report });
      } catch (error) {
        if (run === runRef.current) setParseError(error instanceof Error ? error.message : "No se pudieron leer los archivos.");
      }
    })();
  }, [daeFile, csvFile, previewId]);

  if (!configured) {
    return (
      <main className="mx-auto w-full max-w-xl p-4 lg:p-8">
        <h1 className="text-xl font-bold text-slate-900">Importar mueble</h1>
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Importación no configurada.</p>
      </main>
    );
  }

  const headers = { "x-import-key": key };
  const canUpload = Boolean(parsed && parsed.report.status !== "bloqueado" && daeFile && csvFile && key && !busy);

  async function refreshList(): Promise<boolean> {
    const res = await fetch("/api/importaciones", { headers });
    if (res.status === 401) {
      setUploadError("La clave es incorrecta.");
      return false;
    }
    if (!res.ok) {
      setUploadError(`No se pudo listar las importaciones (error ${res.status}).`);
      return false;
    }
    setItems((await res.json()) as ImportListItem[]);
    return true;
  }

  async function handleUpload() {
    const def = parsed?.report.def;
    if (!parsed || !daeFile || !csvFile || !def) return;
    const { report } = parsed;
    setUploadError(null);
    setDone(null);
    const importId = newImportId();
    const paths = importPaths(importId);
    try {
      setBusy("Comprobando la clave…");
      if (!(await refreshList())) return;

      setBusy("Subiendo el .dae…");
      const options = { access: "private", handleUploadUrl: "/api/importaciones/token", headers } as const;
      await upload(paths.dae, daeFile, { ...options, contentType: "model/vnd.collada+xml" });
      setBusy("Subiendo el CSV…");
      await upload(paths.csv, csvFile, { ...options, contentType: "text/csv" });

      setBusy("Registrando…");
      const res = await fetch("/api/importaciones", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          importId,
          dimsMm: def.furniture.dimsMm,
          nombres: { dae: daeFile.name, csv: csvFile.name },
          cruce: { verification: report.verification, association: report.association },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        await fetch(`/api/importaciones/${importId}`, { method: "DELETE", headers }).catch(() => undefined);
        setUploadError(body.error ?? `No se pudo registrar (error ${res.status}).`);
        return;
      }
      setDone({ id: body.id, estado: body.estado });
      await refreshList();
    } catch (error) {
      await fetch(`/api/importaciones/${importId}`, { method: "DELETE", headers }).catch(() => undefined);
      setUploadError(error instanceof Error ? error.message : "Falló la subida.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(item: ImportListItem) {
    if (!window.confirm(`¿Borrar "${item.mueble}"? El link deja de funcionar.`)) return;
    const res = await fetch(`/api/importaciones/${item.id}`, { method: "DELETE", headers });
    if (!res.ok) setUploadError(`No se pudo borrar (error ${res.status}).`);
    await refreshList();
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pb-10 lg:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Prototipo — prueba</p>
      <h1 className="text-xl font-bold text-slate-900">Importar mueble</h1>
      <p className="mt-2 text-sm text-slate-600">
        Subí el .dae del modelo y el CSV con el listado de piezas. Se valida acá antes de subir y se obtiene un link para ver el mueble en 3D.
        Es una prueba: el formato definitivo del CSV se decide después.
      </p>

      <div className="mt-4 grid gap-3 text-sm">
        <label className="grid gap-1">
          <span className="font-medium text-slate-800">Modelo 3D (.dae, hasta {mb(MAX_DAE_BYTES)})</span>
          <input type="file" accept=".dae" onChange={(e) => pick(setDaeFile, e.target.files?.[0] ?? null)} />
        </label>
        <label className="grid gap-1">
          <span className="font-medium text-slate-800">Listado de piezas (.csv, hasta 1 MB)</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => pick(setCsvFile, e.target.files?.[0] ?? null)} />
        </label>
        <label className="grid gap-1">
          <span className="font-medium text-slate-800">Clave de importación</span>
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      {parseError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{parseError}</p>}
      {daeFile && csvFile && !parsed && !parseError && <p className="mt-4 text-sm text-slate-500">Validando…</p>}
      {parsed && <ReportView report={parsed.report} />}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canUpload}
          onClick={handleUpload}
          className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Subir
        </button>
        <button
          type="button"
          disabled={!key || Boolean(busy)}
          onClick={() => void refreshList()}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 disabled:opacity-50"
        >
          Ver importaciones
        </button>
        {busy && <span className="text-sm text-slate-500">{busy}</span>}
      </div>

      {uploadError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{uploadError}</p>}

      {done && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Listo. Link para compartir:{" "}
          <Link href={`/prueba/${done.id}`} className="break-all font-medium underline">
            {linkFor(done.id)}
          </Link>
        </p>
      )}

      {items && (
        <section aria-label="Importaciones guardadas" className="mt-6">
          <h2 className="text-sm font-semibold text-slate-800">Importaciones guardadas ({items.length})</h2>
          {items.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Todavía no hay ninguna.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/prueba/${item.id}`} className="block truncate font-medium text-slate-900 underline">
                      {item.mueble}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {STATUS_STYLE[item.estado].label.split(" (")[0]} · {new Date(item.fecha).toLocaleString("es-AR")}
                    </span>
                  </div>
                  <button type="button" onClick={() => void handleDelete(item)} className="shrink-0 text-xs text-red-700 underline">
                    Borrar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
