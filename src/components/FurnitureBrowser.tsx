"use client";

import { useState } from "react";
import Link from "next/link";
import type { FurnitureDef } from "@/data/types";
import { edgeSummary } from "@/lib/edgeText";
import { listFurniture, qrHref } from "@/lib/lookup";
import { shortCode } from "@/model/ids";

function FurnitureSection({ def }: { def: FurnitureDef }) {
  const { furniture, modules, pieceTypes } = def;

  return (
    <section className="mt-8 first:mt-6">
      <h2 className="text-2xl font-bold text-slate-900">{furniture.name}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {furniture.dimsMm.x} x {furniture.dimsMm.y} x {furniture.dimsMm.z} mm ·
        versión {furniture.designVersion}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={qrHref(furniture.qrId)}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Ver mueble completo
        </Link>
      </div>

      {modules.map((mod) => {
        const modPieces = pieceTypes.filter((p) => p.moduleId === mod.id);
        if (modPieces.length === 0) return null;
        return (
          <details
            key={mod.id}
            className="group mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-3 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold text-slate-800">
                {mod.name}
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {modPieces.length} tipos de pieza
                <span
                  aria-hidden
                  className="transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </span>
            </summary>
            <div className="px-3 pb-3">
              <Link
                href={qrHref(mod.qrId)}
                className="inline-block text-sm font-medium text-orange-600 underline underline-offset-2 hover:text-orange-700"
              >
                Ver módulo
              </Link>
              <ul className="mt-2 flex flex-col gap-2">
                {modPieces.map((piece) => (
                  <li key={piece.qrId}>
                    <Link
                      href={qrHref(piece.qrId)}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-400"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-orange-600">
                          {shortCode(piece.code)}
                        </span>
                        <span className="block font-medium text-slate-900">
                          {piece.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {piece.lengthMm} x {piece.widthMm} mm ·{" "}
                          {edgeSummary(piece.edgeBanding)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        x{piece.quantity}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        );
      })}
    </section>
  );
}

/** Selector de mueble: al elegir uno se despliegan sus módulos y piezas. */
export function FurnitureBrowser() {
  const furniture = listFurniture();
  const [selectedId, setSelectedId] = useState<string>(
    furniture[0].furniture.id,
  );
  const selected = furniture.find((def) => def.furniture.id === selectedId);

  return (
    <>
      <div
        role="tablist"
        aria-label="Mueble"
        className="mt-6 flex flex-wrap gap-2"
      >
        {furniture.map((def) => {
          const active = def.furniture.id === selectedId;
          return (
            <button
              key={def.furniture.id}
              type="button"
              role="tab"
              id={`tab-${def.furniture.id}`}
              aria-selected={active}
              aria-controls={`panel-${def.furniture.id}`}
              onClick={() => setSelectedId(def.furniture.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium shadow-sm ring-1 transition ${
                active
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-800 ring-slate-200 hover:ring-orange-400"
              }`}
            >
              {def.furniture.name}
              <span
                className={`ml-2 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}
              >
                {def.pieceTypes.length} piezas
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          role="tabpanel"
          id={`panel-${selected.furniture.id}`}
          aria-labelledby={`tab-${selected.furniture.id}`}
        >
          <FurnitureSection def={selected} />
        </div>
      )}
    </>
  );
}
