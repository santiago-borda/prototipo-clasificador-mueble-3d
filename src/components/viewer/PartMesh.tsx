"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import { Color, MathUtils, MeshBasicMaterial, MeshStandardMaterial, type Mesh } from "three";
import type { EdgeId, ViewMode } from "@/data/types";
import type { FurniturePart } from "@/model/types";
import { EdgeMarkers } from "./EdgeMarkers";
import { ACCENT_HEX, LINKED_HEX, LINKED_HOVER_HEX, NEUTRAL_HEX } from "./palette";

export const NEUTRAL_COLOR = new Color(NEUTRAL_HEX);
export const ACCENT_COLOR = new Color(ACCENT_HEX);
const LINKED_COLOR = new Color(LINKED_HEX);
const LINKED_HOVER_COLOR = new Color(LINKED_HOVER_HEX);

// Hover solo con mouse. En pantallas táctiles cada movimiento del dedo dispararía un raycast contra las
// piezas con handlers de hover (y re-renders de React) en pleno gesto de rotación.
const CAN_HOVER = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const HOT_EMISSIVE = 0.3;
const DIM_OPACITY = 0.2;
// Silueta "rayos X" de la pieza resaltada: se ve aunque la tape otra (ej. fondos dentro de los cajones).
const GHOST_OPACITY = 0.35;
const DAMP_LAMBDA = 7;
const EPS = 0.002;

interface PartMeshProps {
  part: FurniturePart;
  /** Material base compartido; cada mesh lo clona UNA vez al montar. */
  baseMaterial: MeshStandardMaterial;
  hot: boolean;
  /** La pieza tiene ficha propia: se puede tocar para abrirla. */
  linked: boolean;
  /** Es la pieza cuya ficha se está viendo ahora (tocarla no hace nada). */
  current: boolean;
  /** Tiñe las piezas con ficha (interruptor del visor). */
  showLinked: boolean;
  /** Bordes con canto del tipo de pieza seleccionado; solo se marcan en las piezas resaltadas. */
  edgeBanding: readonly EdgeId[];
  /** Medidas del listado del tipo seleccionado (mm), para orientar largo/corto en el 3D. */
  lengthMm?: number;
  widthMm?: number;
  viewMode: ViewMode;
  onPick: (instanceId: string) => void;
  onHover: (instanceId: string | null) => void;
}

function colorDistance(a: Color, b: Color): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

export function PartMesh({
  part,
  baseMaterial,
  hot,
  linked,
  current,
  showLinked,
  edgeBanding,
  lengthMm,
  widthMm,
  viewMode,
  onPick,
  onHover,
}: PartMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const ghostRef = useRef<Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const [hovered, setHovered] = useState(false);

  // Solo es "tocable" si tiene ficha y no es la pieza que ya se está viendo.
  const clickable = linked && !current;
  useCursor(hovered && clickable);

  // Un clon por pieza, creado una sola vez. Nunca se recrea en render ni en useFrame.
  const material = useMemo(() => baseMaterial.clone(), [baseMaterial]);
  useEffect(() => () => material.dispose(), [material]);

  const ghostMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: ACCENT_COLOR,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => ghostMaterial.dispose(), [ghostMaterial]);

  // Despierta el loop (frameloop="demand") cuando cambia el objetivo.
  useEffect(() => {
    invalidate();
  }, [hot, linked, showLinked, hovered, viewMode, invalidate]);

  useFrame((state, delta) => {
    // Se muta el material a través del ref del mesh (el clon creado arriba), no de la variable.
    const mesh = meshRef.current;
    const mat = mesh?.material;
    const ghost = ghostRef.current;
    const ghostMat = ghost?.material;
    if (!mesh || !(mat instanceof MeshStandardMaterial)) return;
    if (!ghost || !(ghostMat instanceof MeshBasicMaterial)) return;
    const dt = Math.min(delta, 0.1);
    const targetColor = hot
      ? ACCENT_COLOR
      : clickable && (showLinked || hovered)
        ? hovered
          ? LINKED_HOVER_COLOR
          : LINKED_COLOR
        : NEUTRAL_COLOR;
    const targetEmissive = hot ? HOT_EMISSIVE : 0;
    const targetOpacity = hot ? 1 : viewMode === "isolate" ? 0 : viewMode === "dim" ? DIM_OPACITY : 1;

    const targetGhost = hot && viewMode === "highlight" ? GHOST_OPACITY : 0;

    mat.opacity = MathUtils.damp(mat.opacity, targetOpacity, DAMP_LAMBDA, dt);
    ghostMat.opacity = MathUtils.damp(ghostMat.opacity, targetGhost, DAMP_LAMBDA, dt);
    mat.emissiveIntensity = MathUtils.damp(mat.emissiveIntensity, targetEmissive, DAMP_LAMBDA, dt);
    mat.color.lerp(targetColor, 1 - Math.exp(-DAMP_LAMBDA * dt));

    const settled =
      Math.abs(mat.opacity - targetOpacity) < EPS &&
      Math.abs(mat.emissiveIntensity - targetEmissive) < EPS &&
      Math.abs(ghostMat.opacity - targetGhost) < EPS &&
      colorDistance(mat.color, targetColor) < EPS;

    if (settled) {
      mat.opacity = targetOpacity;
      mat.emissiveIntensity = targetEmissive;
      mat.color.copy(targetColor);
      ghostMat.opacity = targetGhost;
    } else {
      state.invalidate();
    }

    // Opaco cuando está al 100% (mejor orden de dibujo); invisible cuando desaparece del todo.
    mat.depthWrite = mat.opacity > 0.99;
    mesh.visible = mat.opacity > 0.01;
    ghost.visible = ghostMat.opacity > 0.01;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    // Una pieza oculta (modo Aislar) no debe capturar el click.
    if (!meshRef.current?.visible) return;
    event.stopPropagation();
    onPick(part.instanceId);
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (!meshRef.current?.visible) return;
    event.stopPropagation();
    setHovered(true);
    onHover(part.instanceId);
  };

  const handlePointerOut = () => {
    setHovered(false);
    onHover(null);
  };

  return (
    <>
      <mesh
        ref={meshRef}
        name={part.instanceId}
        geometry={part.geometry}
        material={material}
        onClick={handleClick}
        onPointerOver={linked && CAN_HOVER ? handlePointerOver : undefined}
        onPointerOut={linked && CAN_HOVER ? handlePointerOut : undefined}
      />
      {/* Silueta superpuesta sin test de profundidad; no recibe eventos. */}
      <mesh
        ref={ghostRef}
        name={`${part.instanceId}:ghost`}
        geometry={part.geometry}
        material={ghostMaterial}
        renderOrder={10}
        visible={false}
        raycast={() => null}
      />
      {hot && edgeBanding.length > 0 && <EdgeMarkers geometry={part.geometry} edges={edgeBanding} lengthMm={lengthMm} widthMm={widthMm} />}
    </>
  );
}
