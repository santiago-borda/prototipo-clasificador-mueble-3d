"use client";

import { useViewStore } from "@/store/viewStore";
import { LINKED_HEX } from "./viewer/palette";

/** Interruptor: marca en el 3D las piezas que tienen ficha (las que se pueden tocar). */
export function LinkedToggle() {
  const showLinked = useViewStore((s) => s.showLinked);
  const setShowLinked = useViewStore((s) => s.setShowLinked);

  return (
    <button
      type="button"
      aria-pressed={showLinked}
      onClick={() => setShowLinked(!showLinked)}
      title="Marca las piezas que tienen ficha: tocalas para abrirla"
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-sm font-medium text-slate-800 shadow-md ring-1 ring-slate-200"
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full ring-1 ring-slate-300"
        style={{ backgroundColor: showLinked ? LINKED_HEX : "transparent" }}
      />
      <span>Con ficha</span>
    </button>
  );
}
