import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from "three";
import type { FurnitureDef } from "@/data/types";
import { textureUrlFor } from "@/model/textureLibrary";
import type { FurniturePart } from "@/model/types";

// Carga las texturas de las placas (dónde está cada imagen: `model/textureLibrary.ts`). Si una imagen no se
// encuentra, la pieza queda con el color neutro de siempre.
const MAX_ANISOTROPY = 4;

/** Texturas ya cargadas, por nombre de archivo del .dae. No suspende: las piezas se ven lisas hasta que llegan. */
export function useSurfaceTextures(def: FurnitureDef, parts: readonly FurniturePart[]): ReadonlyMap<string, Texture> {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const [textures, setTextures] = useState<ReadonlyMap<string, Texture>>(new Map());

  useEffect(() => {
    const files = new Set(parts.flatMap((part) => part.surfaces.map((s) => s.image).filter((f): f is string => f !== null)));
    const loader = new TextureLoader();
    const loaded: Texture[] = [];
    let cancelled = false;

    for (const file of files) {
      const url = textureUrlFor(def, file);
      if (!url) continue;
      loader.load(
        url,
        (texture) => {
          loaded.push(texture);
          if (cancelled) return texture.dispose();
          // SketchUp exporta las UV en "repeticiones" de la imagen (según su tamaño real en el modelo).
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy =Math.min(MAX_ANISOTROPY, gl.capabilities.getMaxAnisotropy());
          setTextures((previous) => new Map(previous).set(file, texture));
          invalidate();
        },
        undefined,
        () => console.warn(`[texturas ${def.furniture.id}] no se encontró ${file} (${url}): se usa el color neutro.`),
      );
    }

    return () => {
      cancelled = true;
      loaded.forEach((texture) => texture.dispose());
    };
  }, [def, parts, gl, invalidate]);

  return textures;
}
