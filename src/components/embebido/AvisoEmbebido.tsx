// Mensaje de estado del embebido (sin sesión, abrir desde el ERP, ERP caído…). Sirve en servidor y en cliente.
export function AvisoEmbebido({ titulo, texto, children }: { titulo: string; texto?: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl p-6 text-sm text-slate-600" role="status">
      <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
      {texto && <p className="mt-2">{texto}</p>}
      {children}
    </main>
  );
}
