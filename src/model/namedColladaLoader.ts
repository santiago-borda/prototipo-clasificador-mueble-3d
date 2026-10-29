import { LoadingManager } from "three";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { PIECE_NAME } from "./ids";

/**
 * ColladaLoader pierde el nombre de los componentes de SketchUp: cuando un <node> solo envuelve
 * un <instance_node> (caso de casi todas las piezas), three devuelve el componente de la
 * biblioteca pero lo renombra con el nombre del envoltorio ("instance_27"), y el código de
 * pieza (`_0001-01-M01-C04`) desaparece de la escena.
 *
 * Este loader, antes de parsear, copia el nombre del componente al envoltorio, así el nombre
 * sobrevive. Solo toca componentes cuyo nombre es un código de pieza (ver `PIECE_NAME`).
 */
function restoreComponentNames(doc: Document): void {
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
}

function initFrom(element: Element | null | undefined): string | null {
  return element?.getElementsByTagName("init_from")[0]?.textContent?.trim() || null;
}

/**
 * Nombre de material -> archivo de imagen de su textura, sin carpeta (`GAUDI.jpeg`). SketchUp guarda la ruta
 * relativa a una carpeta que no viaja con el .dae (y en Sabrina está rota), así que el visor busca la imagen
 * por nombre de archivo (ver `model/textureLibrary.ts`).
 */
export function readMaterialImages(doc: Document): Record<string, string> {
  const byId = (tag: string) =>
    new Map(Array.from(doc.getElementsByTagName(tag)).map((element) => [element.getAttribute("id") ?? "", element]));
  const effects = byId("effect");
  const images = byId("image");
  const result: Record<string, string> = {};

  for (const material of Array.from(doc.getElementsByTagName("material"))) {
    const name = material.getAttribute("name") ?? material.getAttribute("id");
    const effectId = (material.getElementsByTagName("instance_effect")[0]?.getAttribute("url") ?? "").replace(/^#/, "");
    const imageId = initFrom(effects.get(effectId)?.getElementsByTagName("surface")[0]);
    const path = imageId ? initFrom(images.get(imageId)) : null;
    if (!name || !path) continue;
    let file = path.split(/[\\/]/).pop() ?? "";
    try {
      file = decodeURIComponent(file);
    } catch {
      // un "%" suelto: se usa el nombre tal cual
    }
    if (file) result[name] = file;
  }
  return result;
}

export class NamedColladaLoader extends ColladaLoader {
  override parse(text: string, path: string): ReturnType<ColladaLoader["parse"]> {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    restoreComponentNames(doc);
    const result = super.parse(new XMLSerializer().serializeToString(doc), path);
    if (result) result.scene.userData.materialImages = readMaterialImages(doc);
    return result;
  }
}

// ColladaLoader no carga las texturas: las rutas del .dae apuntan a carpetas que no viajan con el archivo (en
// Sabrina, además, rotas). Se reemplazan por un píxel transparente para no pedirlas (404). El visor las carga
// por su cuenta, por nombre de archivo (`readMaterialImages` + `model/textureLibrary.ts`).
const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// El reemplazo va en un LoadingManager propio: el de fábrica (DefaultLoadingManager) es global y también lo usa
// el TextureLoader del visor, que entonces recibiría el píxel transparente en vez de las texturas.
const skipTexturesManager = new LoadingManager();
skipTexturesManager.setURLModifier((url) => (/\.(png|jpe?g)$/i.test(url) ? BLANK_PIXEL : url));

export function skipTextures(loader: ColladaLoader): void {
  loader.manager = skipTexturesManager;
}
