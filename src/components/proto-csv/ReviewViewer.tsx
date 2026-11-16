"use client";

// Visor 3D chico de la revisión (spike): el .dae guardado, con el mismo cargador del visor principal, sin texturas
// y sin el registro global de muebles. La pieza elegida en la tabla se resalta; las dudosas van en ámbar.

import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { buildFurnitureModel } from "@/model/colladaModel";
import { NamedColladaLoader, skipTextures } from "@/model/namedColladaLoader";

const COLORS = { selected: "#0d9488", dudosa: "#f59e0b", neutral: "#cbd5e1" };

function Model({ url, selected, dudosas }: { url: string; selected: string | null; dudosas: ReadonlySet<string> }) {
  const collada = useLoader(NamedColladaLoader, url, skipTextures);
  const model = useMemo(() => {
    if (!collada) throw new Error(`No se pudo leer ${url}`);
    return buildFurnitureModel(collada.scene);
  }, [collada, url]);
  return (
    <>
      {model.parts.map((part) => {
        const code = part.instanceId.split("#")[0];
        const isSelected = code === selected;
        const color = isSelected ? COLORS.selected : dudosas.has(code) ? COLORS.dudosa : COLORS.neutral;
        const faded = selected !== null && !isSelected;
        return (
          <mesh key={part.instanceId} geometry={part.geometry}>
            <meshStandardMaterial color={color} transparent={faded} opacity={faded ? 0.3 : 1} depthWrite={!faded} />
          </mesh>
        );
      })}
    </>
  );
}

export default function ReviewViewer({ url, selected, dudosas }: { url: string; selected: string | null; dudosas: ReadonlySet<string> }) {
  return (
    <div className="h-80 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <Canvas frameloop="demand" camera={{ position: [1.6, 1.1, 2], fov: 36, near: 0.01, far: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.4} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            <Model url={url} selected={selected} dudosas={dudosas} />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
