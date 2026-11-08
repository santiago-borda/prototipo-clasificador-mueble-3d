// Índice del XML del .dae (spec-motor §4a; plan del motor, T3 y "Decisiones del plan").
// Recorre la visual_scene y arma la tabla de instancias: `instanceKey` y nombre crudo salen del XML, no de la escena
// de three (three pierde nombres y no se verificó que exponga el `id`). Devuelve además el XML **etiquetado**: el
// `name` de cada nodo-instancia pasa a `@key:<instanceKey>`; three conserva ese nombre y el adapter busca el
// ancestro `@key:` de cada malla. No importa three: usa el `DOMParser` global (jsdom en las pruebas y en el eval).
// Lo que el índice no cubre falla fuerte con el id del nodo: el adapter no adivina.

export const KEY_PREFIX = "@key:";

export interface DaeEntry {
  /** Ids de los nodos desde la raíz de la visual_scene hasta el de la instancia, unidos con `/` (sin los nodos sin id). */
  instanceKey: string;
  nodeId: string;
  /** `name` del componente de la biblioteca, tal cual ("" si no tiene); null = malla suelta. */
  rawName: string | null;
  kind: "componente" | "malla-suelta";
}

export interface DaeIndex {
  /** En el orden del documento. */
  entries: DaeEntry[];
  /** Geometrías de solo líneas fuera de un componente (aristas sueltas): no son piezas. */
  lineObjects: number;
  /** `<unit meter>`; 1 si falta (valor por defecto de COLLADA). */
  unitMeters: number;
  taggedXml: string;
}

/** Estructura que el índice no cubre. `nodeId` = id del nodo (o ruta + "(sin id)"); "" si es del documento. */
export class DaeStructureError extends Error {
  constructor(
    readonly nodeId: string,
    message: string,
  ) {
    super(nodeId === "" ? message : `${nodeId}: ${message}`);
    this.name = "DaeStructureError";
  }
}

const TRIANGLE_TAGS = new Set(["triangles", "polylist", "polygons"]);
const LINE_TAGS = new Set(["lines", "linestrips"]);

const childElements = (element: Element, localName: string) => Array.from(element.children).filter((c) => c.localName === localName);
const urlId = (element: Element) => (element.getAttribute("url") ?? "").replace(/^#/, "");

interface GeometryKind {
  triangles: boolean;
  lines: boolean;
}

function geometryKinds(doc: Document): Map<string, GeometryKind> {
  const kinds = new Map<string, GeometryKind>();
  for (const geometry of Array.from(doc.getElementsByTagName("geometry"))) {
    const id = geometry.getAttribute("id");
    if (!id) continue;
    const primitives = Array.from(geometry.getElementsByTagName("mesh")).flatMap((mesh) => Array.from(mesh.children).map((c) => c.localName));
    kinds.set(id, { triangles: primitives.some((t) => TRIANGLE_TAGS.has(t)), lines: primitives.some((t) => LINE_TAGS.has(t)) });
  }
  return kinds;
}

function libraryNodes(doc: Document): Map<string, Element> {
  const nodes = new Map<string, Element>();
  for (const library of Array.from(doc.getElementsByTagName("library_nodes"))) {
    for (const node of childElements(library, "node")) {
      const id = node.getAttribute("id");
      if (id) nodes.set(id, node);
    }
  }
  return nodes;
}

function visualScene(doc: Document): Element {
  const scenes = Array.from(doc.getElementsByTagName("visual_scene"));
  const instance = doc.getElementsByTagName("instance_visual_scene")[0];
  if (instance) {
    const target = scenes.find((s) => s.getAttribute("id") === urlId(instance));
    if (!target) throw new DaeStructureError("", `<scene> apunta a "${urlId(instance)}", que no es una visual_scene del archivo.`);
    return target;
  }
  if (scenes.length !== 1) throw new DaeStructureError("", `sin <scene>, se espera una sola visual_scene y hay ${scenes.length}.`);
  return scenes[0];
}

function unitOf(doc: Document): number {
  const unit = doc.getElementsByTagName("unit")[0];
  const meter = unit?.getAttribute("meter");
  if (meter === null || meter === undefined) return 1;
  const value = Number(meter);
  if (!Number.isFinite(value) || value <= 0) throw new DaeStructureError("", `<unit meter="${meter}"> no es un número positivo.`);
  return value;
}

export function indexDae(xml: string): DaeIndex {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new DaeStructureError("", "el XML del .dae no se puede leer.");

  const geometries = geometryKinds(doc);
  const library = libraryNodes(doc);
  const scene = visualScene(doc);
  const entries: DaeEntry[] = [];
  const tagged: [Element, string][] = [];
  const keys = new Set<string>();
  let lineObjects = 0;

  const keyOf = (path: string[], node: Element): string => {
    const id = node.getAttribute("id");
    if (!id) throw new DaeStructureError([...path, "(sin id)"].join("/"), "una instancia necesita id para su instanceKey.");
    const key = [...path, id].join("/");
    if (keys.has(key)) throw new DaeStructureError(id, `instanceKey repetido (${key}).`);
    keys.add(key);
    return key;
  };

  const visit = (node: Element, path: string[]) => {
    const id = node.getAttribute("id");
    const label = id ?? [...path, "(sin id)"].join("/");
    const instances = childElements(node, "instance_node");
    const geometryRefs = childElements(node, "instance_geometry");
    const children = childElements(node, "node");

    if (instances.length > 1) throw new DaeStructureError(label, `${instances.length} instance_node en un mismo nodo.`);
    if (instances.length === 1) {
      if (geometryRefs.length > 0 || children.length > 0) throw new DaeStructureError(label, "instance_node y contenido propio en un mismo nodo.");
      const component = library.get(urlId(instances[0]));
      if (!component) throw new DaeStructureError(label, `instance_node apunta a "${urlId(instances[0])}", que no está en library_nodes.`);
      if (component.getElementsByTagName("instance_node").length > 0) {
        throw new DaeStructureError(component.getAttribute("id") ?? "", "componente anidado (un componente que instancia otro): no está cubierto.");
      }
      const key = keyOf(path, node);
      entries.push({ instanceKey: key, nodeId: id as string, rawName: component.getAttribute("name") ?? "", kind: "componente" });
      tagged.push([node, key]);
      return;
    }

    let triangles = false;
    for (const ref of geometryRefs) {
      const kind = geometries.get(urlId(ref));
      if (!kind) throw new DaeStructureError(label, `instance_geometry apunta a "${urlId(ref)}", que no está en library_geometries.`);
      if (!kind.triangles && !kind.lines) throw new DaeStructureError(label, `la geometría "${urlId(ref)}" no tiene triángulos ni líneas.`);
      if (kind.lines) lineObjects += 1;
      if (kind.triangles) triangles = true;
    }
    if (triangles) {
      const key = keyOf(path, node);
      entries.push({ instanceKey: key, nodeId: id as string, rawName: null, kind: "malla-suelta" });
      tagged.push([node, key]);
    }

    const childPath = id ? [...path, id] : path;
    for (const child of children) visit(child, childPath);
  };

  for (const node of childElements(scene, "node")) visit(node, []);
  for (const [node, key] of tagged) node.setAttribute("name", `${KEY_PREFIX}${key}`);

  return { entries, lineObjects, unitMeters: unitOf(doc), taggedXml: new XMLSerializer().serializeToString(doc) };
}
