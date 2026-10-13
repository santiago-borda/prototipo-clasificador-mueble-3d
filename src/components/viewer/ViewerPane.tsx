"use client";

import dynamic from "next/dynamic";
import { LinkedToggle } from "../LinkedToggle";
import { PieceMenu } from "../PieceMenu";
import { ViewModeControl } from "../ViewModeControl";

// WebGL solo existe en el navegador: el Canvas se carga sin SSR.
const FurnitureCanvas = dynamic(() => import("./FurnitureCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando visor 3D…</div>
  ),
});

export function ViewerPane() {
  return (
    <div className="relative h-full w-full bg-[#f4f5f7]">
      <FurnitureCanvas />
      <div className="pointer-events-none absolute inset-x-0 top-3 flex items-start justify-between gap-2 px-3">
        <PieceMenu />
        <LinkedToggle />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
        <ViewModeControl />
      </div>
    </div>
  );
}
