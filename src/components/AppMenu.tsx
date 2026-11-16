"use client";

// Menú de secciones de la app: un botón a la izquierda de la barra (con el nombre de la sección actual) que despliega
// Piezas y Escanear QR. Reemplaza a las pestañas fijas. Mobile first: igual en celular y en escritorio.
// La barra mide 44 px (h-11): ViewerLayout descuenta esa altura (2.75rem, top-11); no cambiarla sin ajustar el visor.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

interface Section {
  href: string;
  label: string;
  detail: string;
  active: (path: string) => boolean;
  icon: React.ReactNode;
}

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const SECTIONS: readonly Section[] = [
  {
    href: "/",
    label: "Piezas",
    detail: "Muebles y la ficha de cada pieza",
    active: (path) => path === "/" || path.startsWith("/p/") || path.startsWith("/prueba/"),
    icon: (
      <svg {...iconProps} className="h-5 w-5">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/escanear",
    label: "Escanear QR",
    detail: "Abrí una ficha con la cámara",
    active: (path) => path.startsWith("/escanear"),
    icon: (
      <svg {...iconProps} className="h-5 w-5">
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M8 12h8" />
      </svg>
    ),
  },
];

/** Nombre de la sección actual, para el botón (las páginas fuera del menú, como el backoffice, dicen la suya). */
function currentLabel(path: string): string {
  if (path.startsWith("/backoffice")) return "Carga por CSV";
  if (path.startsWith("/importar")) return "Importar";
  if (path.startsWith("/qr")) return "Códigos QR";
  return SECTIONS.find((s) => s.active(path))?.label ?? "Menú";
}

export function AppMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav aria-label="Secciones" className="sticky top-0 z-30 flex h-11 shrink-0 items-center border-b border-slate-200 bg-white px-2 print:hidden">
      <div ref={rootRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          <svg {...iconProps} className="h-5 w-5">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          <span>{currentLabel(pathname)}</span>
          <svg {...iconProps} className={`h-4 w-4 text-slate-500 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <ul
            id={panelId}
            className="absolute left-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {SECTIONS.map((section) => {
              const active = section.active(pathname);
              return (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 border-l-[3px] px-3 py-2.5 focus-visible:bg-slate-100 focus-visible:outline-none ${
                      active ? "border-orange-500 bg-orange-50 text-orange-700" : "border-transparent text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span className={active ? "text-orange-600" : "text-slate-500"}>{section.icon}</span>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{section.label}</span>
                      <span className="text-xs text-slate-500">{section.detail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
