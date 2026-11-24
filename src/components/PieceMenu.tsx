"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FurnitureDef } from "@/data/types";
import { listFurniture, qrHref, targetFromDef } from "@/lib/lookup";
import { shortCode } from "@/model/ids";
import { useViewStore } from "@/store/viewStore";
import { isBaseRoute, useActiveFurniture } from "./viewer/useActiveFurniture";

/** Etiqueta corta del QR actual para el botón del menú. */
function currentLabel(def: FurnitureDef | null, qrId: string | null): string {
  const target = def && qrId ? targetFromDef(def, qrId) : undefined;
  if (!target) return "Menú";
  if (target.kind === "piece") return `Pieza ${shortCode(target.piece.code)}`;
  if (target.kind === "module") return target.module.name;
  return target.furniture.name;
}

function rowClass(active: boolean): string {
  return `flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${
    active ? "bg-orange-50 text-orange-900" : "text-slate-700 hover:bg-slate-100"
  }`;
}

/** Lista de QR del mueble (mueble, módulos y piezas) como menú desplegable dentro del visor. */
export function PieceMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedQrId = useViewStore((s) => s.selectedQrId);
  const def = useActiveFurniture();
  const pathname = usePathname();
  // En /erp/* tampoco se listan otros muebles: sus fichas (/p/*) no se pueden abrir dentro del iframe.
  const onBase = isBaseRoute(pathname) || pathname.startsWith("/erp/");

  // Cierra con Escape o al tocar fuera del menú.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // El menú lista los QR del mueble que se está viendo; los demás muebles van al final.
  // En /p/* el mueble sale de la base y no se listan otros muebles del registro estático (S2A-3).
  const otherFurniture = def && !onBase ? listFurniture().filter((other) => other !== def) : [];

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-slate-800 shadow-md ring-1 ring-slate-200"
      >
        <span aria-hidden>☰</span>
        <span>{currentLabel(def, selectedQrId)}</span>
        <span aria-hidden className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && def && (
        <nav
          aria-label="QR del mueble"
          className="absolute left-0 top-full z-30 mt-2 max-h-[min(70dvh,26rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200"
        >
          <Link
            href={qrHref(def.furniture.qrId)}
            aria-current={selectedQrId === def.furniture.qrId ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={rowClass(selectedQrId === def.furniture.qrId)}
          >
            <span className="font-medium">{def.furniture.name}</span>
            <span className="shrink-0 text-xs text-slate-500">Mueble</span>
          </Link>

          {def.modules.map((mod) => {
            const modPieces = def.pieceTypes.filter((piece) => piece.moduleId === mod.id);
            return (
              <div key={mod.id} className="mt-2">
                <Link
                  href={qrHref(mod.qrId)}
                  aria-current={selectedQrId === mod.qrId ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`${rowClass(selectedQrId === mod.qrId)} font-semibold`}
                >
                  <span>{mod.name}</span>
                  <span className="shrink-0 text-xs font-normal text-slate-500">Módulo</span>
                </Link>
                <ul className="ml-3 border-l border-slate-200 pl-1">
                  {modPieces.map((piece) => {
                    const active = piece.qrId === selectedQrId;
                    return (
                      <li key={piece.qrId}>
                        <Link
                          href={qrHref(piece.qrId)}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={rowClass(active)}
                        >
                          <span className="min-w-0">
                            <span className={`mr-2 font-semibold ${active ? "text-orange-600" : "text-teal-700"}`}>
                              {shortCode(piece.code)}
                            </span>
                            <span className="break-words">{piece.name}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            x{piece.quantity}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {otherFurniture.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Otros muebles</p>
              {otherFurniture.map((other) => (
                <Link
                  key={other.furniture.id}
                  href={qrHref(other.furniture.qrId)}
                  onClick={() => setOpen(false)}
                  className={rowClass(false)}
                >
                  <span className="font-medium">{other.furniture.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">Mueble</span>
                </Link>
              ))}
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
