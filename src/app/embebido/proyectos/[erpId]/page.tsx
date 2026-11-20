import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvisoEmbebido } from "@/components/embebido/AvisoEmbebido";
import { Reintentar, RenovarSesion, SesionVigente } from "@/components/embebido/RenovarSesion";
import { conDepsDePagina } from "@/server/embebido/deps";
import { NOMBRE_COOKIE } from "@/server/embebido/http";
import { cargarProyecto } from "@/server/embebido/proyecto";
import { esZip } from "@/server/erp/esquemas";

// IE-7: /embebido/proyectos/<erpId>. Lee del ERP en el servidor con el token de la sesión (el navegador no lo ve):
// muebles y Documentos del proyecto, y un enlace al visor por cada zip. Proyecto que no es del tenant de la sesión: 404.
export default async function ProyectoEmbebido({ params }: { params: Promise<{ erpId: string }> }) {
  const { erpId } = await params;
  const deps = await conDepsDePagina();
  if (!deps) notFound();
  const cookie = (await cookies()).get(NOMBRE_COOKIE)?.value;
  const r = await cargarProyecto(deps, cookie, erpId);

  if (r.estado === "no-autenticada") {
    return <AvisoEmbebido titulo="La sesión no es válida o venció" texto="Volvé a abrir desde el ERP." />;
  }
  if (r.estado === "token-vencido") {
    // La clave cambia en cada render del servidor: después de recargar, el componente arranca de nuevo.
    return <RenovarSesion key={randomUUID()} />;
  }
  if (r.estado === "no-encontrado") notFound();
  if (r.estado === "erp-no-disponible" || r.estado === "respuesta-invalida") {
    return (
      <AvisoEmbebido titulo={r.estado === "erp-no-disponible" ? "El ERP no respondió" : "El ERP respondió algo inesperado"} texto="Probá de nuevo en un rato.">
        <Reintentar />
      </AvisoEmbebido>
    );
  }

  const { proyecto } = r;
  const base = `/embebido/proyectos/${encodeURIComponent(proyecto.id)}`;
  return (
    <main className="mx-auto w-full max-w-3xl p-4 text-sm text-slate-700 sm:p-6">
      <SesionVigente />
      <p className="text-xs uppercase tracking-wide text-slate-400">Proyecto {proyecto.id}</p>
      <h1 className="text-xl font-semibold text-slate-900">{proyecto.nombre}</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Muebles</h2>
        {proyecto.muebles.length === 0 ? (
          <p className="mt-2 text-slate-500">El proyecto no tiene muebles cargados en el ERP.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
            {proyecto.muebles.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="font-medium text-slate-900">{m.nombre}</span>
                {m.cantidadPiezas !== null && <span className="shrink-0 text-xs text-slate-500">{m.cantidadPiezas} piezas según el ERP</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Documentos</h2>
        {proyecto.documentos.length === 0 ? (
          <p className="mt-2 text-slate-500">El proyecto no tiene Documentos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
            {proyecto.documentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 break-all">{d.nombre}</span>
                {esZip(d) ? (
                  <Link
                    href={`${base}/visor/${encodeURIComponent(d.id)}`}
                    className="shrink-0 rounded bg-orange-500 px-3 py-1 font-medium text-white hover:bg-orange-600"
                  >
                    Ver en 3D
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">sin modelo 3D</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
