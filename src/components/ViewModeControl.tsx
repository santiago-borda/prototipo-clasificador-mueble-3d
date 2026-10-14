"use client";

import type { ViewMode } from "@/data/types";
import { resolveQr } from "@/lib/lookup";
import { useViewStore } from "@/store/viewStore";

const OPTIONS: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: "highlight", label: "Resaltar" },
  { value: "isolate", label: "Aislar" },
  { value: "dim", label: "Atenuar" },
];

export function ViewModeControl() {
  const viewMode = useViewStore((s) => s.viewMode);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const selectedQrId = useViewStore((s) => s.selectedQrId);
  // En la ficha del mueble completo no hay nada que resaltar: los modos no aplican.
  const disabled = selectedQrId !== null && resolveQr(selectedQrId)?.kind === "furniture";

  return (
    <div
      role="radiogroup"
      aria-label="Modo de vista"
      aria-disabled={disabled}
      title={disabled ? "Elegí un módulo o una pieza para usar los modos de vista" : undefined}
      className={`pointer-events-auto inline-flex rounded-full bg-white/95 p-1 shadow-md ring-1 ring-slate-200 ${disabled ? "opacity-50" : ""}`}
    >
      {OPTIONS.map((option) => {
        const active = option.value === viewMode;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => setViewMode(option.value)}
            className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${
              active ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
