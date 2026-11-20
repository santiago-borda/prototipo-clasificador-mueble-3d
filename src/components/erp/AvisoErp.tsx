// Mensaje de estado de la pantalla embebida (abrir desde el ERP, sesión vencida, proyecto sin enviar…). Sirve en
// servidor y en cliente. Los colores siguen el tema del ERP (IE-5) a través de las clases de MarcoErp.
export function AvisoErp({ titulo, texto, children }: { titulo: string; texto?: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl p-6 text-sm" role="status">
      <h1 className="text-lg font-semibold">{titulo}</h1>
      {texto && <p className="mt-2 opacity-80">{texto}</p>}
      {children}
    </main>
  );
}
