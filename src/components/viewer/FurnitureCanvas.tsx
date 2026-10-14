"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { FurnitureModel } from "./FurnitureModel";

const BACKGROUND = "#f4f5f7";
// Pantallas de alta densidad (celulares): con 2x o más el antialias por hardware cuesta mucho y casi no se nota.
const HIGH_DENSITY = typeof window !== "undefined" && window.devicePixelRatio >= 2;
const TARGET: [number, number, number] = [0, 0.38, 0];

export default function FurnitureCanvas() {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: !HIGH_DENSITY, powerPreference: "high-performance" }}
      camera={{ position: [1.8, 1.2, 2.15], fov: 36, near: 0.05, far: 20 }}
    >
      <color attach="background" args={[BACKGROUND]} />

      {/* Environment procedural (sin descargas): funciona sin internet en el celular. */}
      <Environment resolution={64} frames={1}>
        <color attach="background" args={["#b9bfc9"]} />
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 2, 3]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[5, 2, -3]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>
      <directionalLight position={[2.5, 4, 3]} intensity={1.6} />

      {/* El .dae se carga con useLoader, que suspende. */}
      <Suspense fallback={null}>
        <FurnitureModel />
        {/*
          La sombra se calcula UNA vez (frames={1}) cuando el modelo ya está montado: el mueble no se mueve, y
          recalcularla en cada frame (otra pasada de dibujo + 2 de desenfoque) era lo más caro al girar.
          Dentro del Suspense para que se hornee con el modelo presente.
        */}
        <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={4} blur={2.5} far={1.2} resolution={256} frames={1} />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        enablePan={false}
        target={TARGET}
        minDistance={0.9}
        maxDistance={5}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </Canvas>
  );
}
