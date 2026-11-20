import { ViewerPane } from "@/components/viewer/ViewerPane";

// El visor 3D vive en el layout: al pasar de una ficha a otra no se remonta,
// el resaltado hace crossfade y la cámara conserva su posición. Lo usan /p/*, /prueba/* y /erp/*.
// `embebido`: dentro del iframe del ERP (/erp/*) no hay barra de pestañas y los altos son fijos en px, no en
// unidades de viewport: el ERP ajusta el alto del iframe con `ucp:alto` y un alto en vh crecería sin fin.
export function ViewerLayout({ children, embebido = false }: { children: React.ReactNode; embebido?: boolean }) {
  const alto = embebido ? "lg:h-[720px]" : "lg:h-[calc(100dvh-2.75rem)]";
  const arriba = embebido ? "top-0" : "top-11";
  const altoVisor = embebido ? "h-[360px]" : "h-[46svh]";
  return (
    <div className={`lg:grid ${alto} lg:grid-cols-[minmax(0,1.25fr)_minmax(380px,1fr)]`}>
      <section
        aria-label="Visor 3D del mueble"
        className={`sticky ${arriba} z-10 ${altoVisor} border-b border-slate-200 lg:h-full lg:border-b-0 lg:border-r`}
      >
        <ViewerPane />
      </section>
      <main className="bg-white lg:overflow-y-auto">{children}</main>
    </div>
  );
}
