"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QrSheets } from "@/components/QrSheets";
import { CruceListado } from "@/components/erp/CruceListado";
import { claveDelProyecto, cruceDelProyecto } from "@/components/erp/ModeloErpGate";
import { getErpFurnitureDef, resolveQr } from "@/lib/lookup";

// /erp/proyectos/{uuid}/visor (mueble) y …/visor/<qrId> (módulo o pieza). La compuerta ya registró el modelo.
export default function FichaErp() {
  const { uuid, qr } = useParams<{ uuid: string; qr?: string[] }>();
  const proyecto = decodeURIComponent(uuid);
  const clave = claveDelProyecto(proyecto);
  const def = clave ? getErpFurnitureDef(clave) : undefined;
  const qrId = qr?.[0] ?? def?.furniture.qrId;
  const target = qrId ? resolveQr(qrId) : undefined;
  const volver = `/erp/proyectos/${encodeURIComponent(proyecto)}`;
  // La ficha tiene que ser de ESTE modelo: un qrId de otro mueble no se muestra acá.
  const propio = def && target && target.def === def ? target : undefined;
  if (!propio) {
    return (
      <article className="mx-auto max-w-xl p-6 text-sm text-slate-600">
        <h1 className="text-lg font-semibold text-slate-900">No encontramos esa ficha</h1>
        <p className="mt-2">Ese código no pertenece a este modelo.</p>
        <Link href={volver} className="mt-4 inline-block underline">
          Volver al proyecto
        </Link>
      </article>
    );
  }
  return (
    <>
      <Link href={volver} className="block px-4 pt-3 text-xs text-slate-500 underline">
        ← Volver al proyecto
      </Link>
      <CruceListado cruce={cruceDelProyecto(proyecto)} />
      <QrSheets target={propio} />
    </>
  );
}
