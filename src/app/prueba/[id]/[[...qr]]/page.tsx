"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QrSheets } from "@/components/QrSheets";
import { getImportedFurnitureDef, resolveQr } from "@/lib/lookup";

// /prueba/<id> (mueble) y /prueba/<id>/<qrId> (módulo o pieza). El layout ya registró la importación.
export default function ImportedQrPage() {
  const { id, qr } = useParams<{ id: string; qr?: string[] }>();
  const def = getImportedFurnitureDef(id);
  const qrId = qr?.[0] ?? def?.furniture.qrId;
  const target = qrId ? resolveQr(qrId) : undefined;
  // La ficha tiene que ser de ESTE mueble: un qrId de otro mueble no se muestra bajo este link.
  const own = target && target.def === def ? target : undefined;

  if (!own) {
    return (
      <article className="mx-auto max-w-xl p-6 text-sm text-slate-600">
        <h1 className="text-lg font-semibold text-slate-900">No encontramos esa ficha</h1>
        <p className="mt-2">Ese código no pertenece a este mueble.</p>
        <Link href={`/prueba/${id}`} className="mt-4 inline-block underline">
          Volver al mueble
        </Link>
      </article>
    );
  }
  return <QrSheets target={own} />;
}
