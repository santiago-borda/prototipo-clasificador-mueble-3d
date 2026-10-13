"use client";

import { useMemo } from "react";
import type { BufferGeometry } from "three";
import type { EdgeId } from "@/data/types";
import { computeEdgeLayout } from "@/model/edgeLayout";

// Mismos colores que el esquema 2D (EdgeBandingDiagram): azul = con canto, oscuro = esquina de referencia.
export const BAND_COLOR = "#2563eb";
export const REFERENCE_COLOR = "#1e293b";
const REFERENCE_RADIUS = 0.014;

interface EdgeMarkersProps {
  geometry: BufferGeometry;
  edges: readonly EdgeId[];
}

/** Marca sobre la pieza 3D los bordes que llevan canto y la esquina de referencia. */
export function EdgeMarkers({ geometry, edges }: EdgeMarkersProps) {
  const layout = useMemo(() => computeEdgeLayout(geometry, edges), [geometry, edges]);

  return (
    <group name="edge-markers">
      {layout.bands.map((band) => (
        <mesh key={band.id} position={band.center} raycast={() => null}>
          <boxGeometry args={band.size} />
          <meshBasicMaterial color={BAND_COLOR} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={layout.referenceCorner} raycast={() => null}>
        <sphereGeometry args={[REFERENCE_RADIUS, 16, 12]} />
        <meshBasicMaterial color={REFERENCE_COLOR} toneMapped={false} />
      </mesh>
    </group>
  );
}
