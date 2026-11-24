"use client";

// IE-5: /erp/proyectos/{uuid}. Código y nombre del proyecto, estado del último trabajo (con la causa si falló) y el
// enlace al visor del modelo guardado. Los datos salen de GET /api/erp/proyectos/{uuid} con la cookie de la sesión:
// un proyecto de otra carpintería da 404, igual que uno que nunca se envió, y la pantalla dice lo mismo para los dos
// («Este proyecto todavía no se envió»): así no se revela si existe en otra carpintería.

import Link from "next/link";
import { useEffect, useState } from "react";
import { pedirListado, type PedidoListado } from "./pedirListado";
import { ETIQUETA_ESTADO, type EstadoTrabajo } from "@/lib/erp/estados";
import { AvisoErp } from "./AvisoErp";
import { useMarcoErp } from "./MarcoErp";

interface DatosProyecto {
  proyecto: { uuid: string; codigo: string; nombre: string; fechaEntrega: string | null };
  trabajo: { uuid: string; estado: EstadoTrabajo; mensaje: string | null; actualizadoEn: string } | null;
  modelo: { trabajoUuid: string; nombre: string; version: number } | null;
}

type Estado = { tipo: "cargando" } | { tipo: "listo"; datos: DatosProyecto; listado: PedidoListado | null } | { tipo: "sin-enviar" } | { tipo: "sin-sesion" } | { tipo: "error" };

const COLOR_ESTADO: Record<EstadoTrabajo, string> = {
  pending: "bg-slate-200 text-slate-800",
  inProgress: "bg-sky-100 text-sky-900",
  success: "bg-emerald-100 text-emerald-900",
  failed: "bg-red-100 text-red-900",
};

export function ProyectoErp({ proyectoUuid }: { proyectoUuid: string }) {
  const { proyectoDelErp, tema } = useMarcoErp();
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await fetch(`/api/erp/proyectos/${encodeURIComponent(proyectoUuid)}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      if (cancelado) return;
      if (!r) setEstado({ tipo: "error" });
      else if (r.status === 404) setEstado({ tipo: "sin-enviar" });
      else if (r.status === 401) setEstado({ tipo: "sin-sesion" });
      else if (!r.ok) setEstado({ tipo: "error" });
      else {
        const datos = (await r.json()) as DatosProyecto;
        // IC-10: resumen del listado del CSV del trabajo del modelo (null: no hay modelo).
        const listado = datos.modelo ? await pedirListado(proyectoUuid, datos.modelo.trabajoUuid) : null;
        if (!cancelado) setEstado({ tipo: "listo", datos, listado });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [proyectoUuid, recarga]);

  const encabezado = (codigo: string, nombre: string) => (
    <>
      <p className="text-xs uppercase tracking-wide opacity-60">Proyecto {codigo}</p>
      <h1 className="text-xl font-semibold">{nombre}</h1>
    </>
  );
  const actualizar = (
    <button type="button" onClick={() => setRecarga((n) => n + 1)} className="mt-4 rounded border border-current px-3 py-1 text-xs opacity-80 hover:opacity-100">
      Actualizar
    </button>
  );

  if (estado.tipo === "cargando") return <AvisoErp titulo="Cargando el proyecto…" />;
  if (estado.tipo === "sin-sesion") return <AvisoErp titulo="La sesión no es válida o venció" texto="Volvé a abrir desde el ERP." />;
  if (estado.tipo === "error") return <AvisoErp titulo="No se pudo cargar el proyecto" texto="Probá de nuevo en un rato.">{actualizar}</AvisoErp>;
  if (estado.tipo === "sin-enviar") {
    return (
      <main className="mx-auto w-full max-w-3xl p-4 text-sm sm:p-6">
        {proyectoDelErp && encabezado(proyectoDelErp.codigo, proyectoDelErp.nombre)}
        <p className="mt-4 font-medium">Este proyecto todavía no se envió.</p>
        <p className="mt-1 opacity-70">Usá «Enviar a UCP» en el ERP para mandar el modelo y el CSV de piezas.</p>
        {actualizar}
      </main>
    );
  }

  const { proyecto, trabajo, modelo } = estado.datos;
  const { listado } = estado;
  return (
    <main className="mx-auto w-full max-w-3xl p-4 text-sm sm:p-6">
      {encabezado(proyecto.codigo, proyecto.nombre)}
      {proyecto.fechaEntrega && <p className="mt-1 opacity-70">Entrega: {proyecto.fechaEntrega}</p>}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Último envío</h2>
        {trabajo ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[trabajo.estado]}`}>{ETIQUETA_ESTADO[trabajo.estado]}</span>
            <span className="text-xs opacity-60">{new Date(trabajo.actualizadoEn).toLocaleString("es-AR")}</span>
            {trabajo.mensaje && <p className="w-full opacity-80">{trabajo.mensaje}</p>}
          </div>
        ) : (
          <p className="mt-2 opacity-70">Sin envíos.</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Modelo 3D</h2>
        {modelo ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="break-all">
              {modelo.nombre} · versión {modelo.version}
            </span>
            <Link
              href={`/erp/proyectos/${encodeURIComponent(proyecto.uuid)}/visor`}
              className={`rounded px-3 py-1 font-medium text-white ${tema === "oscuro" ? "bg-orange-600 hover:bg-orange-500" : "bg-orange-500 hover:bg-orange-600"}`}
            >
              Ver en 3D
            </Link>
          </div>
        ) : (
          <p className="mt-2 opacity-70">Todavía no hay un modelo verificado.</p>
        )}
        {modelo && listado?.tipo === "listado" && (
          <p className="mt-2 text-xs opacity-70">
            Listado de piezas: {listado.listado.tipos} {listado.listado.tipos === 1 ? "tipo" : "tipos"}, {listado.listado.piezasTotales} {listado.listado.piezasTotales === 1 ? "pieza" : "piezas"} · {listado.listado.metrosCanto.toLocaleString("es-AR")} m de canto
          </p>
        )}
        {modelo && listado?.tipo === "sin-listado" && <p className="mt-2 text-xs opacity-60">Este envío no tiene un listado de piezas leído: las fichas salen del modelo 3D.</p>}
        {modelo && listado?.tipo === "error" && <p className="mt-2 text-xs opacity-80">No se pudo leer el listado de piezas. Probá «Actualizar».</p>}
      </section>
      {actualizar}
    </main>
  );
}
