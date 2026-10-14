"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Piezas", active: (path: string) => path === "/" || path.startsWith("/p/") },
  { href: "/escanear", label: "Escanear QR", active: (path: string) => path.startsWith("/escanear") },
] as const;

/** Pestañas de la app. Fijas arriba para pasar de una ficha al escáner sin volver al inicio. */
export function AppTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="sticky top-0 z-20 flex h-11 shrink-0 border-b border-slate-200 bg-white print:hidden">
      {TABS.map((tab) => {
        const active = tab.active(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center border-b-2 text-sm font-medium ${
              active ? "border-orange-500 text-orange-600" : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
