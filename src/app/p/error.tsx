"use client";

// S2A-4: la ficha no se pudo cargar (p. ej. la base no respondió, PersistenciaNoDisponibleError). El error ya se
// registró en el servidor; acá no se muestra su detalle. Estilos de p/[qrId]/not-found.tsx. El visor (p/layout) queda.
export default function FichaError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-8">
      <p className="text-slate-600">No se pudo cargar la ficha. Revisá la conexión e intentá de nuevo</p>
      <button type="button" onClick={() => retry()} className="mt-4 inline-block text-orange-600 underline">
        Reintentar
      </button>
    </div>
  );
}
