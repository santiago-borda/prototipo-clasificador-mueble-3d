// Constructor de .dae sintéticos, SOLO para pruebas (plan del motor, T3 y T4). No comparte código con el adapter:
// escribe el XML a mano a partir de medidas en mm, para que las pruebas no dependan de lo que prueban.
// Y arriba (COLLADA por defecto): los ejes del XML son los de la escena de three. Datos inventados.

export type CantoFace = "x-" | "x+" | "y-" | "y+" | "z-" | "z+";

export interface PanelSpec {
  /** Nombre del componente; null = malla suelta (sin componente). */
  name: string | null;
  /** Caja del panel antes de girar, en mm, por eje (x, y, z). */
  sizeMm: [number, number, number];
  /** Traslación de la esquina mínima, en mm. */
  atMm: [number, number, number];
  /** Giro alrededor de Z, en grados, aplicado antes de trasladar. */
  rotZDeg?: number;
  /** Espejo en X (determinante negativo). */
  mirrorX?: boolean;
  /** Caras con material `Canto_Blanco` (2 triángulos cada una). */
  cantoFaces?: CantoFace[];
  /** Paneles con la misma clave comparten el nodo de biblioteca (y la geometría del primero). */
  sharedComponent?: string;
}

export interface DaeSpec {
  unit?: { meter: number; name: string };
  panels: PanelSpec[];
  /** Objetos de solo líneas en la escena. */
  lineObjects?: number;
  /** Un nodo de la escena con dos instance_node. */
  nodeWithTwoInstances?: boolean;
  /** Un componente de la biblioteca que contiene otro instance_node. */
  nestedComponent?: boolean;
  /** Al primer panel con caras de canto le falta un triángulo de canto. */
  oddCantoTriangles?: boolean;
}

// Esquinas de la caja (0..a, 0..b, 0..c) y dos triángulos por cara.
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
] as const;
const FACES: Record<CantoFace, [number, number, number, number, number, number]> = {
  "z-": [0, 2, 1, 0, 3, 2],
  "z+": [4, 5, 6, 4, 6, 7],
  "y-": [0, 1, 5, 0, 5, 4],
  "y+": [3, 7, 6, 3, 6, 2],
  "x-": [0, 4, 7, 0, 7, 3],
  "x+": [1, 2, 6, 1, 6, 5],
};

const num = (v: number) => (Math.abs(v) < 1e-15 ? "0" : String(v));

function matrix(panel: PanelSpec, mmToUnit: number): string {
  const rad = ((panel.rotZDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const sx = panel.mirrorX ? -1 : 1;
  const [tx, ty, tz] = panel.atMm.map((v) => v * mmToUnit);
  return [c * sx, -s, 0, tx, s * sx, c, 0, ty, 0, 0, 1, tz, 0, 0, 0, 1].map(num).join(" ");
}

function geometry(id: string, panel: PanelSpec, mmToUnit: number, dropOne: boolean): string {
  const [a, b, c] = panel.sizeMm.map((v) => v * mmToUnit);
  const positions = CORNERS.flatMap(([x, y, z]) => [x * a, y * b, z * c]).map(num).join(" ");
  const canto = new Set(panel.cantoFaces ?? []);
  const plain = (Object.keys(FACES) as CantoFace[]).filter((f) => !canto.has(f)).flatMap((f) => FACES[f]);
  let edge = [...canto].flatMap((f) => FACES[f]);
  if (dropOne) edge = edge.slice(3);
  const triangles = (indices: number[], symbol: string) =>
    indices.length === 0
      ? ""
      : `<triangles count="${indices.length / 3}" material="${symbol}"><input offset="0" semantic="VERTEX" source="#${id}-vtx"/><p>${indices.join(" ")}</p></triangles>`;
  return `<geometry id="${id}"><mesh>
<source id="${id}-pos"><float_array id="${id}-arr" count="24">${positions}</float_array>
<technique_common><accessor count="8" source="#${id}-arr" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>
${triangles(plain, "Placa")}${triangles(edge, "Canto")}
</mesh></geometry>`;
}

function lineGeometry(id: string): string {
  return `<geometry id="${id}"><mesh>
<source id="${id}-pos"><float_array id="${id}-arr" count="6">0 0 0 1 0 0</float_array>
<technique_common><accessor count="2" source="#${id}-arr" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>
<lines count="1"><input offset="0" semantic="VERTEX" source="#${id}-vtx"/><p>0 1</p></lines>
</mesh></geometry>`;
}

const BIND = `<bind_material><technique_common><instance_material symbol="Placa" target="#MAT-placa"/><instance_material symbol="Canto" target="#MAT-canto"/></technique_common></bind_material>`;

export function buildDae(spec: DaeSpec): string {
  const unit = spec.unit ?? { meter: 0.001, name: "millimeter" };
  const mmToUnit = 0.001 / unit.meter;
  let next = 100;
  const id = () => `ID${next++}`;

  const scene: string[] = [];
  const library: string[] = [];
  const geometries: string[] = [];
  const shared = new Map<string, string>();
  let dropped = false;

  spec.panels.forEach((panel, i) => {
    const dropOne = Boolean(spec.oddCantoTriangles) && !dropped && (panel.cantoFaces?.length ?? 0) > 0;
    if (dropOne) dropped = true;
    if (panel.name === null) {
      const g = id();
      geometries.push(geometry(g, panel, mmToUnit, dropOne));
      scene.push(`<node id="${id()}" name="group_${i}"><matrix>${matrix(panel, mmToUnit)}</matrix><instance_geometry url="#${g}">${BIND}</instance_geometry></node>`);
      return;
    }
    let lib = panel.sharedComponent ? shared.get(panel.sharedComponent) : undefined;
    if (!lib) {
      lib = id();
      const g = id();
      geometries.push(geometry(g, panel, mmToUnit, dropOne));
      library.push(`<node id="${lib}" name="${panel.name}"><instance_geometry url="#${g}">${BIND}</instance_geometry></node>`);
      if (panel.sharedComponent) shared.set(panel.sharedComponent, lib);
    }
    scene.push(`<node id="${id()}" name="instance_${i}"><matrix>${matrix(panel, mmToUnit)}</matrix><instance_node url="#${lib}"/></node>`);
  });

  for (let i = 0; i < (spec.lineObjects ?? 0); i++) {
    const g = id();
    geometries.push(lineGeometry(g));
    scene.push(`<node id="${id()}" name="lineas_${i}"><instance_geometry url="#${g}"/></node>`);
  }

  if (spec.nodeWithTwoInstances || spec.nestedComponent) {
    const g = id();
    const inner = id();
    geometries.push(geometry(g, { name: "x", sizeMm: [10, 10, 10], atMm: [0, 0, 0] }, mmToUnit, false));
    library.push(`<node id="${inner}" name="_9999-01-M01-C90"><instance_geometry url="#${g}">${BIND}</instance_geometry></node>`);
    if (spec.nodeWithTwoInstances) {
      scene.push(`<node id="DOBLE" name="doble"><instance_node url="#${inner}"/><instance_node url="#${inner}"/></node>`);
    }
    if (spec.nestedComponent) {
      library.push(`<node id="ANIDADO" name="_9999-01-M01-C91"><instance_node url="#${inner}"/></node>`);
      scene.push(`<node id="${id()}" name="instance_anidado"><instance_node url="#ANIDADO"/></node>`);
    }
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit meter="${unit.meter}" name="${unit.name}"/><up_axis>Y_UP</up_axis></asset>
<library_visual_scenes><visual_scene id="ID1"><node name="raiz">${scene.join("\n")}</node></visual_scene></library_visual_scenes>
<library_nodes>${library.join("\n")}</library_nodes>
<library_geometries>${geometries.join("\n")}</library_geometries>
<library_materials><material id="MAT-placa" name="Blanco"><instance_effect url="#FX"/></material><material id="MAT-canto" name="Canto_Blanco"><instance_effect url="#FX"/></material></library_materials>
<library_effects><effect id="FX"><profile_COMMON><technique sid="COMMON"><lambert><diffuse><color>1 1 1 1</color></diffuse></lambert></technique></profile_COMMON></effect></library_effects>
<scene><instance_visual_scene url="#ID1"/></scene>
</COLLADA>`;
}

/** El XML como bytes UTF-8, como llega `observeDae`. */
export function enc(xml: string): Uint8Array {
  return new TextEncoder().encode(xml);
}
