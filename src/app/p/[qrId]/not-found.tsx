import Link from "next/link";

export default function PieceNotFound() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-bold text-slate-900">QR no encontrado</h1>
      <p className="mt-2 text-slate-600">Este código no corresponde a ninguna pieza del mueble de ejemplo.</p>
      <Link href="/" className="mt-4 inline-block text-orange-600 underline">
        Volver a la lista de QR
      </Link>
    </div>
  );
}
