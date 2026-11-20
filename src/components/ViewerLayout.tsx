import { ViewerPane } from "@/components/viewer/ViewerPane";

// El visor 3D vive en el layout: al pasar de una ficha a otra no se remonta,
// el resaltado hace crossfade y la cámara conserva su posición. Lo usan /p/* y /prueba/*.
// `sinPestanas`: dentro del iframe del ERP (/embebido) no está la barra de pestañas de 2,75rem.
export function ViewerLayout({ children, sinPestanas = false }: { children: React.ReactNode; sinPestanas?: boolean }) {
  const alto = sinPestanas ? "lg:h-[100dvh]" : "lg:h-[calc(100dvh-2.75rem)]";
  const arriba = sinPestanas ? "top-0" : "top-11";
  return (
    <div className={`lg:grid ${alto} lg:grid-cols-[minmax(0,1.25fr)_minmax(380px,1fr)]`}>
      <section
        aria-label="Visor 3D del mueble"
        className={`sticky ${arriba} z-10 h-[46svh] border-b border-slate-200 lg:h-full lg:border-b-0 lg:border-r`}
      >
        <ViewerPane />
      </section>
      <main className="bg-white lg:overflow-y-auto">{children}</main>
    </div>
  );
}
