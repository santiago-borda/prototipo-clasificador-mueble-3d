import type { EdgeId } from "@/data/types";

interface EdgeBandingDiagramProps {
  lengthMm: number;
  widthMm: number;
  edges: readonly EdgeId[];
}

const BANDED_COLOR = "#2563eb";
const PLAIN_COLOR = "#94a3b8";
const REFERENCE_COLOR = "#1e293b"; // igual que la esquina de referencia del visor 3D
const MAX_W = 250;
const MAX_H = 150;
const PAD_X = 52;
const PAD_Y = 34;

/**
 * Esquema de la pieza (largo horizontal, ancho vertical).
 * Convención del prototipo: borde superior = largo A, inferior = largo B, izquierdo = corto A, derecho = corto B.
 * La esquina de referencia es largo A × corto A (arriba a la izquierda).
 */
export function EdgeBandingDiagram({ lengthMm, widthMm, edges }: EdgeBandingDiagramProps) {
  const scale = Math.min(MAX_W / lengthMm, MAX_H / widthMm);
  const w = lengthMm * scale;
  const h = Math.max(widthMm * scale, 14);
  const x0 = PAD_X;
  const y0 = PAD_Y;
  const x1 = x0 + w;
  const y1 = y0 + h;
  const vbW = w + PAD_X * 2;
  const vbH = h + PAD_Y * 2;

  const banded = (id: EdgeId) => edges.includes(id);
  const edgeProps = (id: EdgeId) =>
    banded(id)
      ? { stroke: BANDED_COLOR, strokeWidth: 5, strokeLinecap: "round" as const }
      : { stroke: PLAIN_COLOR, strokeWidth: 1.5, strokeDasharray: "4 4" };

  const label = (id: EdgeId) => `${id.startsWith("largo") ? "Largo" : "Corto"} ${id.slice(-1)}`;
  const description =
    edges.length === 0
      ? "Esquema de la pieza sin canto"
      : `Esquema de la pieza con canto en: ${edges.map(label).join(", ")}`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label={description} className="w-full max-w-sm">
        <rect x={x0} y={y0} width={w} height={h} fill="#eef0f3" />

        {/* bordes */}
        <line x1={x0} y1={y0} x2={x1} y2={y0} {...edgeProps("largo-A")} />
        <line x1={x0} y1={y1} x2={x1} y2={y1} {...edgeProps("largo-B")} />
        <line x1={x0} y1={y0} x2={x0} y2={y1} {...edgeProps("corto-A")} />
        <line x1={x1} y1={y0} x2={x1} y2={y1} {...edgeProps("corto-B")} />

        {/* marca de orientación: esquina de referencia (largo A × corto A) */}
        <polygon points={`${x0},${y0} ${x0 + 16},${y0} ${x0},${y0 + 16}`} fill={REFERENCE_COLOR} />
        <text x={x0 + 20} y={y0 + 14} fontSize="9" fill={REFERENCE_COLOR}>
          ref.
        </text>

        {/* etiquetas de borde */}
        <text x={(x0 + x1) / 2} y={y0 - 10} fontSize="10" textAnchor="middle" fill="#475569">
          {label("largo-A")} · {lengthMm}
        </text>
        <text x={(x0 + x1) / 2} y={y1 + 18} fontSize="10" textAnchor="middle" fill="#475569">
          {label("largo-B")}
        </text>
        <text x={x0 - 8} y={(y0 + y1) / 2 - 6} fontSize="10" textAnchor="end" dominantBaseline="middle" fill="#475569">
          {label("corto-A")}
        </text>
        <text x={x0 - 8} y={(y0 + y1) / 2 + 7} fontSize="10" textAnchor="end" dominantBaseline="middle" fill="#475569">
          {widthMm}
        </text>
        <text x={x1 + 8} y={(y0 + y1) / 2} fontSize="10" textAnchor="start" dominantBaseline="middle" fill="#475569">
          {label("corto-B")}
        </text>

        {edges.length === 0 && (
          <text x={(x0 + x1) / 2} y={(y0 + y1) / 2} fontSize="12" textAnchor="middle" dominantBaseline="middle" fill="#64748b">
            Sin canto
          </text>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-5 rounded bg-blue-600" /> con canto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 border-t border-dashed border-slate-400" /> sin canto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-0 border-l-[8px] border-t-[8px] border-l-transparent border-t-slate-800 [transform:rotate(90deg)]" />
          esquina de referencia
        </span>
      </figcaption>
    </figure>
  );
}
