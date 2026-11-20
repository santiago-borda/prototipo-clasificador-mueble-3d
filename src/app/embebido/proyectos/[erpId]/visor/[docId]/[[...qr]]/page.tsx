"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QrSheets } from "@/components/QrSheets";
import { claveErp } from "@/lib/embebido/defErp";
import { getErpFurnitureDef, resolveQr } from "@/lib/lookup";

// /embebido/proyectos/<erpId>/visor/<docId> (mueble) y …/<qrId> (módulo o pieza). La compuerta ya registró el modelo.
export default function FichaErp() {
  const { erpId, docId, qr } = useParams<{ erpId: string; docId: string; qr?: string[] }>();
  const def = getErpFurnitureDef(claveErp(decodeURIComponent(erpId), decodeURIComponent(docId)));
  const qrId = qr?.[0] ?? def?.furniture.qrId;
  const target = qrId ? resolveQr(qrId) : undefined;
  // La ficha tiene que ser de ESTE modelo: un qrId de otro mueble no se muestra acá.
  const propio = target && target.def === def ? target : undefined;
  if (!propio) {
    return (
      <article className="mx-auto max-w-xl p-6 text-sm text-slate-600">
        <h1 className="text-lg font-semibold text-slate-900">No encontramos esa ficha</h1>
        <p className="mt-2">Ese código no pertenece a este modelo.</p>
        <Link href={`/embebido/proyectos/${erpId}`} className="mt-4 inline-block underline">
          Volver al proyecto
        </Link>
      </article>
    );
  }
  return (
    <>
      <Link href={`/embebido/proyectos/${erpId}`} className="block px-4 pt-3 text-xs text-slate-500 underline">
        ← Volver al proyecto
      </Link>
      <QrSheets target={propio} />
    </>
  );
}
