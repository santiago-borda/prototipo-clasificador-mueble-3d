// IC-10 (docs/spec-importador-csv-envio.md): una línea arriba de la ficha del visor embebido con el resultado del
// cruce del listado del CSV con el modelo 3D. Sin listado (trabajo anterior al importador), no muestra nada.

import type { CruceErp } from "@/lib/erp/defErp";

export function CruceListado({ cruce }: { cruce: CruceErp | null | undefined }) {
  if (!cruce) return null;
  if (cruce.coincide) {
    return <p className="px-4 pt-2 text-xs text-emerald-800">El listado del CSV coincide con el modelo 3D.</p>;
  }
  const n = cruce.diferencias.length;
  return (
    <details className="mx-4 mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <summary className="cursor-pointer font-medium">
        ⚠ El listado del CSV y el modelo 3D no coinciden en {n} {n === 1 ? "punto" : "puntos"}
      </summary>
      <ul className="mt-2 list-disc pl-4">
        {cruce.diferencias.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </details>
  );
}
