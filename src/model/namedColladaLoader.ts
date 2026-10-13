import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { PIECE_NAME } from "./ids";

/**
 * ColladaLoader pierde el nombre de los componentes de SketchUp: cuando un <node> solo envuelve
 * un <instance_node> (caso de casi todas las piezas), three devuelve el componente de la
 * biblioteca pero lo renombra con el nombre del envoltorio ("instance_27"), y el código de
 * pieza (`_04_Lateral_modulo_cajones`) desaparece de la escena.
 *
 * Este loader, antes de parsear, copia el nombre del componente al envoltorio, así el nombre
 * sobrevive. Solo toca componentes cuyo nombre lleva código de pieza (`_NN_...`).
 */
function restoreComponentNames(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const nodes = Array.from(doc.getElementsByTagName("node"));

  const libraryNames = new Map<string, string>();
  for (const node of nodes) {
    const id = node.getAttribute("id");
    const name = node.getAttribute("name");
    if (id && name && node.parentElement?.localName === "library_nodes") libraryNames.set(id, name);
  }

  for (const node of nodes) {
    const children = Array.from(node.children);
    const instances = children.filter((child) => child.localName === "instance_node");
    const hasContent = children.some((child) => child.localName === "node" || child.localName === "instance_geometry");
    if (instances.length !== 1 || hasContent) continue;

    const target = libraryNames.get((instances[0].getAttribute("url") ?? "").replace(/^#/, ""));
    if (target && PIECE_NAME.test(target)) node.setAttribute("name", target);
  }

  return new XMLSerializer().serializeToString(doc);
}

export class NamedColladaLoader extends ColladaLoader {
  override parse(text: string, path: string): ReturnType<ColladaLoader["parse"]> {
    return super.parse(restoreComponentNames(text), path);
  }
}
