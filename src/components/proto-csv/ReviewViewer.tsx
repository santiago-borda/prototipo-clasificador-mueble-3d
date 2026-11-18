"use client";

// Visor 3D chico de la revisión (spike): el .dae guardado, con el mismo cargador del visor principal, sin texturas
// y sin el registro global de muebles. La pieza elegida en la tabla se resalta; los tipos dudosos van en rojo y los de advertencia en ámbar (`viewerColors.ts`).

import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { buildFurnitureModel } from "@/model/colladaModel";
import { NamedColladaLoader, skipTextures } from "@/model/namedColladaLoader";
import { pieceColor } from "@/proto-csv/viewerColors";

interface Sets {
  dudosas: ReadonlySet<string>;
  advertencias: ReadonlySet<string>;
}

function Model({ url, selected, dudosas, advertencias }: { url: string; selected: string | null } & Sets) {
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
        const color = pieceColor(code, selected, dudosas, advertencias);
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

export default function ReviewViewer({ url, selected, dudosas, advertencias }: { url: string; selected: string | null } & Sets) {
  return (
    <div className="h-80 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <Canvas frameloop="demand" camera={{ position: [1.6, 1.1, 2], fov: 36, near: 0.01, far: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.4} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            <Model url={url} selected={selected} dudosas={dudosas} advertencias={advertencias} />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
