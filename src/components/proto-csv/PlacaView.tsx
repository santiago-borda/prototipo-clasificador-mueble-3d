"use client";

// Vista de la placa (spike, docs/spec-proto-csv-ocl.md §4.4, paso 7 opcional). Se DIBUJA desde los datos leídos del
// SVG (`parsePlacaSvg`): placa, piezas y cortes como elementos propios. El SVG crudo nunca se incrusta en la página.
// Los niveles de corte son una lectura geométrica no confirmada con Casa Mueble y no se presentan como orden de corte.
// Nada de esto cambia la certeza de ninguna pieza: el SVG es solo para esta vista.

import { useEffect, useState } from "react";
import { shortCode } from "@/model/ids";
import type { CsvPiece } from "@/proto-csv/parse";
import { comparePlaca, parsePlacaSvg, type PartMatch, type PlacaParse } from "@/proto-csv/svg";

export const CUTS_DISCLAIMER = "Líneas de corte: lectura geométrica, no confirmada con Casa Mueble. No es un orden de corte.";

const FILL: Record<PartMatch, string> = { coincide: "#ccfbf1", rotada: "#ccfbf1", "no-coincide": "#fee2e2", "sin-pieza": "#e2e8f0", "sin-letra": "#e2e8f0" };
const STROKE: Record<PartMatch, string> = { coincide: "#0f766e", rotada: "#0f766e", "no-coincide": "#b91c1c", "sin-pieza": "#64748b", "sin-letra": "#64748b" };
const LEVEL_COLOR: Record<number, string> = { 1: "#7c3aed", 2: "#c026d3", 3: "#db2777" };
const mm = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

export function PlacaView({ id, svgPath, material, pieces }: { id: string; svgPath: string; material: string; pieces: readonly CsvPiece[] }) {
  const [placa, setPlaca] = useState<PlacaParse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/proto-csv/${id}/archivo/${svgPath}`);
      if (!res.ok) {
        if (!cancelled) setError(`No se pudo leer el SVG de la placa (error ${res.status}).`);
        return;
      }
      const parsed = parsePlacaSvg(await res.text());
      if (!cancelled) setPlaca(parsed);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, svgPath]);

  if (error) return <p className="text-sm text-red-800">{error}</p>;
  if (!placa) return <p className="text-sm text-slate-500">Leyendo el SVG de la placa…</p>;
  if (!placa.ok) return <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">No se puede mostrar la placa: {placa.message}</p>;

  const comparison = comparePlaca(placa.parts, pieces, material);
  const font = Math.max(placa.widthMm, placa.heightMm) / 45;
  const levels = [...new Set((placa.cuts ?? []).map((c) => c.level))].sort();

  return (
    <div>
      <p className="text-sm text-slate-700">
        Material <span className="font-medium">{material}</span> (elegido al subir) · placa {mm(placa.widthMm)} × {mm(placa.heightMm)} mm · {placa.parts.length} piezas
        {placa.cuts && ` · ${placa.cuts.length} líneas de corte, ${mm(placa.totalCutM ?? 0)} m en total`}
      </p>

      <svg
        viewBox={`0 0 ${placa.widthMm} ${placa.heightMm}`}
        role="img"
        aria-label={`Placa de ${material} con ${placa.parts.length} piezas`}
        className="mt-2 w-full max-w-3xl rounded border border-slate-200 bg-white"
      >
        <rect x={0} y={0} width={placa.widthMm} height={placa.heightMm} fill="#f8fafc" stroke="#94a3b8" strokeWidth={font / 6} />
        {comparison.parts.map((p) => (
          <g key={p.index}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={FILL[p.match]} stroke={STROKE[p.match]} strokeWidth={font / 8} />
            <text x={p.x + p.w / 2} y={p.y + p.h / 2} fontSize={font} textAnchor="middle" dominantBaseline="middle" fill="#0f172a">
              {p.letter ?? "?"}
              {p.code ? ` · ${shortCode(p.code)}` : ""}
              {p.match === "rotada" ? " ↻" : ""}
            </text>
          </g>
        ))}
        {(placa.cuts ?? []).map((c) => (
          <line
            key={c.index}
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            stroke={c.level === null ? "#94a3b8" : (LEVEL_COLOR[c.level] ?? "#be185d")}
            strokeWidth={font / 7}
            strokeDasharray={`${font / 2} ${font / 3}`}
          />
        ))}
      </svg>

      <div className="mt-2 space-y-1 text-xs text-slate-600">
        <p>
          <span className="inline-block h-3 w-3 border border-teal-700 bg-teal-100 align-middle" /> coincide con las medidas crudas del CSV (±0,1 mm; ↻ = rotada) ·{" "}
          <span className="inline-block h-3 w-3 border border-red-700 bg-red-100 align-middle" /> no coincide ·{" "}
          <span className="inline-block h-3 w-3 border border-slate-500 bg-slate-200 align-middle" /> sin pieza o sin letra
        </p>
        {placa.cuts && (
          <>
            <p className="font-semibold text-slate-800">{CUTS_DISCLAIMER}</p>
            <p>
              Colores por nivel (lectura geométrica: el nivel 1 cruza la placa; un corte que nace y termina sobre cortes de nivel N es N+1):{" "}
              {levels.map((level) => (
                <span key={String(level)} className="mr-2 whitespace-nowrap">
                  <span className="inline-block h-0.5 w-4 align-middle" style={{ backgroundColor: level === null ? "#94a3b8" : (LEVEL_COLOR[level] ?? "#be185d") }} />{" "}
                  {level === null ? "sin leer" : `nivel ${level}`} ({(placa.cuts ?? []).filter((c) => c.level === level).length})
                </span>
              ))}
            </p>
          </>
        )}
        {!placa.cuts && <p>El SVG no trae líneas de corte (en OpenCutList, mostrá los cortes antes de exportar el SVG).</p>}
        {placa.unreadableParts > 0 && <p className="text-amber-800">{placa.unreadableParts} piezas del SVG con una forma que el spike no lee (no se dibujan).</p>}
      </div>

      {comparison.warnings.length > 0 && (
        <ul className="mt-2 list-disc rounded-md bg-amber-50 p-3 pl-6 text-sm text-amber-900">
          {comparison.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {comparison.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-6 text-xs text-slate-500">
          {comparison.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">El SVG solo alimenta esta vista: no cambia la certeza de ninguna pieza ni entra al listado.</p>
    </div>
  );
}
