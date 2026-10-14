import { ViewerPane } from "@/components/viewer/ViewerPane";

// El visor 3D vive en este layout: al pasar de una ficha a otra no se remonta,
// el resaltado hace crossfade y la cámara conserva su posición.
export default function PieceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:h-[calc(100dvh-2.75rem)] lg:grid-cols-[minmax(0,1.25fr)_minmax(380px,1fr)]">
      <section
        aria-label="Visor 3D del mueble"
        className="sticky top-11 z-10 h-[46svh] border-b border-slate-200 lg:h-full lg:border-b-0 lg:border-r"
      >
        <ViewerPane />
      </section>
      <main className="bg-white lg:overflow-y-auto">{children}</main>
    </div>
  );
}
