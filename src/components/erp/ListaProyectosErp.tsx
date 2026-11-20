"use client";

// Lista de proyectos de la carpintería de la sesión (GET /api/erp/proyectos). Para el login de desarrollo (IE-11).

import Link from "next/link";
import { useEffect, useState } from "react";
import { ETIQUETA_ESTADO, type EstadoTrabajo } from "@/lib/erp/estados";
import { AvisoErp } from "./AvisoErp";

interface Fila {
  uuid: string;
  codigo: string;
  nombre: string;
  estado: EstadoTrabajo | null;
}

export function ListaProyectosErp() {
  const [filas, setFilas] = useState<Fila[] | "sin-sesion" | "error" | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await fetch("/api/erp/proyectos", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (cancelado) return;
      if (r?.status === 401) setFilas("sin-sesion");
      else if (!r?.ok) setFilas("error");
      else setFilas(((await r.json()) as { proyectos: Fila[] }).proyectos);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (filas === null) return <AvisoErp titulo="Cargando proyectos…" />;
  if (filas === "sin-sesion") return <AvisoErp titulo="Abrí esta pantalla desde el ERP" texto="No hay una sesión abierta." />;
  if (filas === "error") return <AvisoErp titulo="No se pudieron cargar los proyectos" texto="Probá de nuevo en un rato." />;
  return (
    <main className="mx-auto w-full max-w-3xl p-4 text-sm text-slate-700 sm:p-6">
      <h1 className="text-xl font-semibold text-slate-900">Proyectos enviados por el ERP</h1>
      {filas.length === 0 ? (
        <p className="mt-4 text-slate-500">Todavía no se envió ningún proyecto a esta carpintería.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded border border-slate-200">
          {filas.map((f) => (
            <li key={f.uuid} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <Link href={`/erp/proyectos/${encodeURIComponent(f.uuid)}`} className="font-medium text-slate-900 underline">
                {f.codigo} · {f.nombre}
              </Link>
              <span className="text-xs text-slate-500">{f.estado ? ETIQUETA_ESTADO[f.estado] : "sin envíos"}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
