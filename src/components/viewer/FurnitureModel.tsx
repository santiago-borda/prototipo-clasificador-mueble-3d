"use client";

import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRouter } from "next/navigation";
import { MeshStandardMaterial } from "three";
import type { EdgeId } from "@/data/types";
import { getPieceByInstanceId, isInstanceHot, resolveQr } from "@/lib/lookup";
import { pieceMatchesInstance } from "@/data/mapping";
import type { FurnitureDef } from "@/data/types";
import { shortCode } from "@/model/ids";
import { useFurnitureModel } from "@/model/useFurnitureModel";
import { useViewStore } from "@/store/viewStore";
import { ACCENT_COLOR, NEUTRAL_COLOR, PartMesh } from "./PartMesh";

const NO_EDGES: readonly EdgeId[] = [];

export function FurnitureModel({ def }: { def: FurnitureDef }) {
  const router = useRouter();
  const model = useFurnitureModel(def);
  const invalidate = useThree((state) => state.invalidate);
  const selectedQrId = useViewStore((s) => s.selectedQrId);
  const viewMode = useViewStore((s) => s.viewMode);
  const showLinked = useViewStore((s) => s.showLinked);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Material base único; PartMesh lo clona una vez por pieza.
  const baseMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: NEUTRAL_COLOR,
        emissive: ACCENT_COLOR,
        emissiveIntensity: 0,
        roughness: 0.75,
        metalness: 0,
        transparent: true,
      }),
    [],
  );
  useEffect(() => () => baseMaterial.dispose(), [baseMaterial]);

  // frameloop="demand": el modelo llega tras suspender (carga del .dae); hay que pedir un frame.
  useEffect(() => {
    invalidate();
  }, [model, hoveredId, invalidate]);

  // Derivado de los datos: qué es el QR seleccionado (pieza, módulo o mueble).
  // Solo cuenta si es de ESTE mueble: durante el cambio de mueble el store ya apunta al nuevo.
  const target = useMemo(() => {
    const resolved = selectedQrId ? resolveQr(selectedQrId) : undefined;
    return resolved?.def === def ? resolved : undefined;
  }, [selectedQrId, def]);
  const currentPiece = target?.kind === "piece" ? target.piece : undefined;
  const edgeBanding = currentPiece?.edgeBanding ?? NO_EDGES;
  // El mueble completo no resalta nada, así que Aislar/Atenuar no tienen sentido: se ve siempre normal.
  const effectiveMode = target?.kind === "furniture" ? "highlight" : viewMode;

  const handlePick = (instanceId: string) => {
    const piece = getPieceByInstanceId(def, instanceId);
    if (piece && piece.qrId !== currentPiece?.qrId) router.push(`/p/${piece.qrId}`);
  };

  // Cartel sobre la pieza bajo el cursor (solo si tiene ficha y no es la que ya se está viendo).
  const hoveredPiece = hoveredId ? getPieceByInstanceId(def, hoveredId) : undefined;
  const hoveredPart =
    hoveredPiece && hoveredPiece.qrId !== currentPiece?.qrId ? model.parts.find((p) => p.instanceId === hoveredId) : undefined;
  const tooltipPosition = useMemo<[number, number, number] | null>(() => {
    const box = hoveredPart?.geometry.boundingBox;
    return box ? [(box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2] : null;
  }, [hoveredPart]);

  return (
    <group name={def.furniture.id}>
      {model.parts.map((part) => (
        <PartMesh
          key={part.instanceId}
          part={part}
          baseMaterial={baseMaterial}
          hot={isInstanceHot(target, part.instanceId)}
          linked={getPieceByInstanceId(def, part.instanceId) !== undefined}
          current={currentPiece ? pieceMatchesInstance(currentPiece, part.instanceId) : false}
          showLinked={showLinked}
          edgeBanding={edgeBanding}
          lengthMm={currentPiece?.lengthMm}
          widthMm={currentPiece?.widthMm}
          viewMode={effectiveMode}
          onPick={handlePick}
          onHover={setHoveredId}
        />
      ))}
      {hoveredPiece && tooltipPosition && (
        <Html position={tooltipPosition} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="-translate-y-6 whitespace-nowrap rounded-full bg-slate-900/90 px-3 py-1 text-xs font-medium text-white shadow">
            <span className="text-teal-300">{shortCode(hoveredPiece.code)}</span> {hoveredPiece.name}
          </div>
        </Html>
      )}
    </group>
  );
}
