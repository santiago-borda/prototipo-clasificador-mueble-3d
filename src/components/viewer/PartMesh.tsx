"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import { Color, MathUtils, MeshBasicMaterial, MeshStandardMaterial, type Mesh, type Texture } from "three";
import type { EdgeId, ViewMode } from "@/data/types";
import type { FurniturePart } from "@/model/types";
import { EdgeMarkers } from "./EdgeMarkers";
import { ACCENT_HEX, LINKED_HEX, LINKED_HOVER_HEX, NEUTRAL_HEX } from "./palette";

export const NEUTRAL_COLOR = new Color(NEUTRAL_HEX);
export const ACCENT_COLOR = new Color(ACCENT_HEX);
const LINKED_COLOR = new Color(LINKED_HEX);
const LINKED_HOVER_COLOR = new Color(LINKED_HOVER_HEX);
// Con textura, el color del material la multiplica: en reposo va en blanco para que se vea tal cual.
const TEXTURED_COLOR = new Color("#ffffff");
// Sobre una textura, el tinte "con ficha" es un lavado suave para que el color real de la placa se siga leyendo.
const TEXTURED_LINKED_COLOR = TEXTURED_COLOR.clone().lerp(LINKED_COLOR, 0.35);
const TEXTURED_LINKED_HOVER_COLOR = TEXTURED_COLOR.clone().lerp(LINKED_HOVER_COLOR, 0.6);
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
  /** Material base compartido; cada mesh lo clona UNA vez por superficie al montar. */
  baseMaterial: MeshStandardMaterial;
  /** Texturas ya cargadas, por archivo de imagen (`PartSurface.image`). */
  textures: ReadonlyMap<string, Texture>;
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
  textures,
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

  // Un clon por superficie (grupo de la geometría), creado una sola vez. Nunca se recrea en render ni en useFrame.
  const materials = useMemo(() => part.surfaces.map(() => baseMaterial.clone()), [baseMaterial, part.surfaces]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  // Color de reposo de cada superficie: blanco si su textura ya llegó, si no el neutro.
  const restColors = useMemo(
    () => part.surfaces.map((surface) => (surface.image && textures.has(surface.image) ? TEXTURED_COLOR : NEUTRAL_COLOR)),
    [part.surfaces, textures],
  );

  useEffect(() => {
    part.surfaces.forEach((surface, i) => {
      const map = (surface.image && textures.get(surface.image)) || null;
      if (materials[i].map === map) return;
      materials[i].map = map;
      materials[i].needsUpdate = true;
    });
    invalidate();
  }, [part.surfaces, textures, materials, invalidate]);

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
  }, [hot, linked, showLinked, hovered, viewMode, restColors, invalidate]);

  useFrame((state, delta) => {
    // Se mutan los materiales a través del ref del mesh (los clones creados arriba), no de la variable.
    const mesh = meshRef.current;
    const mats = mesh?.material;
    const ghost = ghostRef.current;
    const ghostMat = ghost?.material;
    if (!mesh || !Array.isArray(mats) || mats.length === 0) return;
    if (!ghost || !(ghostMat instanceof MeshBasicMaterial)) return;
    const dt = Math.min(delta, 0.1);
    const linkTint = !hot && clickable && (showLinked || hovered);
    const targetColorOf = (i: number) => {
      if (hot) return ACCENT_COLOR;
      const rest = restColors[i] ?? NEUTRAL_COLOR;
      if (!linkTint) return rest;
      if (rest === TEXTURED_COLOR) return hovered ? TEXTURED_LINKED_HOVER_COLOR : TEXTURED_LINKED_COLOR;
      return hovered ? LINKED_HOVER_COLOR : LINKED_COLOR;
    };
    const targetEmissive = hot ? HOT_EMISSIVE : 0;
    const targetOpacity = hot ? 1 : viewMode === "isolate" ? 0 : viewMode === "dim" ? DIM_OPACITY : 1;

    const targetGhost = hot && viewMode === "highlight" ? GHOST_OPACITY : 0;

    ghostMat.opacity = MathUtils.damp(ghostMat.opacity, targetGhost, DAMP_LAMBDA, dt);
    let settled = Math.abs(ghostMat.opacity - targetGhost) < EPS;

    mats.forEach((mat, i) => {
      if (!(mat instanceof MeshStandardMaterial)) return;
      const targetColor = targetColorOf(i);
      mat.opacity = MathUtils.damp(mat.opacity, targetOpacity, DAMP_LAMBDA, dt);
      mat.emissiveIntensity = MathUtils.damp(mat.emissiveIntensity, targetEmissive, DAMP_LAMBDA, dt);
      mat.color.lerp(targetColor, 1 - Math.exp(-DAMP_LAMBDA * dt));
      settled &&=
        Math.abs(mat.opacity - targetOpacity) < EPS &&
        Math.abs(mat.emissiveIntensity - targetEmissive) < EPS &&
        colorDistance(mat.color, targetColor) < EPS;
    });

    if (settled) {
      mats.forEach((mat, i) => {
        if (!(mat instanceof MeshStandardMaterial)) return;
        mat.opacity = targetOpacity;
        mat.emissiveIntensity = targetEmissive;
        mat.color.copy(targetColorOf(i));
      });
      ghostMat.opacity = targetGhost;
    } else {
      state.invalidate();
    }

    // Opaco cuando está al 100% (mejor orden de dibujo); invisible cuando desaparece del todo.
    const opacity = mats[0].opacity;
    mats.forEach((mat) => (mat.depthWrite = opacity > 0.99));
    mesh.visible = opacity > 0.01;
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
        material={materials}
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
