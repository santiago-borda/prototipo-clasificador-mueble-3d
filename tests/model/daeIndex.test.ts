// Índice del XML del .dae (plan del motor, T3; spec-motor §4a, M2). Una prueba por rama de indexDae.
// Casos contados a mano: tests/fixtures/dae/minimo.dae (escrito a mano), .dae sintéticos de tests/helpers/daeBuilder.ts
// y XML en línea para los errores de estructura.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DaeStructureError, KEY_PREFIX, indexDae } from "@/model/daeIndex";
import { buildDae } from "../helpers/daeBuilder";
import { loadDaeModel } from "../helpers/loadModel";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** .dae mínimo en línea: `scene` va dentro de un nodo raíz sin id; `extra` son bibliotecas de más. */
function inline(scene: string, library = "", geometries = "", options: { withScene?: boolean } = {}): string {
  const tri = `<geometry id="TRI"><mesh><source id="TRI-p"><float_array id="TRI-a" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor count="3" source="#TRI-a" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="TRI-v"><input semantic="POSITION" source="#TRI-p"/></vertices><triangles count="1"><input offset="0" semantic="VERTEX" source="#TRI-v"/><p>0 1 2</p></triangles></mesh></geometry>`;
  return `<?xml version="1.0"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit meter="0.001" name="millimeter"/></asset>
<library_visual_scenes><visual_scene id="VS"><node name="raiz">${scene}</node></visual_scene></library_visual_scenes>
<library_nodes><node id="LIB" name="_9999-01-M01-C04"><instance_geometry url="#TRI"/></node>${library}</library_nodes>
<library_geometries>${tri}${geometries}</library_geometries>
${options.withScene === false ? "" : `<scene><instance_visual_scene url="#VS"/></scene>`}</COLLADA>`;
}

function structureError(xml: string): DaeStructureError {
  try {
    indexDae(xml);
  } catch (error) {
    if (error instanceof DaeStructureError) return error;
    throw error;
  }
  throw new Error("indexDae no lanzó");
}

describe("indexDae: instancias", () => {
  it("minimo.dae: 2 entradas de componente, instanceKey con la ruta de ids (el nodo sin id se saltea)", () => {
    const idx = indexDae(read("tests/fixtures/dae/minimo.dae"));
    expect(idx.entries).toEqual([
      { instanceKey: "ID2/ID3", nodeId: "ID3", rawName: "_9999-01-M01-C04", kind: "componente" },
      { instanceKey: "ID2/ID4", nodeId: "ID4", rawName: "_9999-01-M01-C04", kind: "componente" },
    ]);
    expect(idx.lineObjects).toBe(0);
  });

  it("el nombre de formato inválido llega crudo como rawName", () => {
    const idx = indexDae(buildDae({ panels: [{ name: "pieza rara", sizeMm: [500, 300, 18], atMm: [0, 0, 0] }] }));
    expect(idx.entries).toHaveLength(1);
    expect(idx.entries[0]).toMatchObject({ kind: "componente", rawName: "pieza rara" });
  });

  it('un componente sin atributo name llega como rawName "" (nombre inválido, no "sin componente")', () => {
    const idx = indexDae(inline(`<node id="A"><instance_node url="#SIN"/></node>`, `<node id="SIN"><instance_geometry url="#TRI"/></node>`));
    expect(idx.entries).toEqual([{ instanceKey: "A", nodeId: "A", rawName: "", kind: "componente" }]);
  });

  it("malla suelta: rawName null, una entrada por nodo", () => {
    const idx = indexDae(buildDae({ panels: [{ name: null, sizeMm: [20, 35, 10], atMm: [0, 0, 0] }] }));
    expect(idx.entries).toHaveLength(1);
    expect(idx.entries[0]).toMatchObject({ kind: "malla-suelta", rawName: null });
  });

  it("una geometría solo de líneas cuenta como línea, no como malla suelta", () => {
    const idx = indexDae(buildDae({ panels: [], lineObjects: 3 }));
    expect(idx.entries).toEqual([]);
    expect(idx.lineObjects).toBe(3);
  });

  it("una geometría con triángulos y líneas da una malla suelta y una línea", () => {
    const mixed = `<geometry id="MIX"><mesh><source id="MIX-p"><float_array id="MIX-a" count="9">0 0 0 1 0 0 0 1 0</float_array><technique_common><accessor count="3" source="#MIX-a" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="MIX-v"><input semantic="POSITION" source="#MIX-p"/></vertices><triangles count="1"><input offset="0" semantic="VERTEX" source="#MIX-v"/><p>0 1 2</p></triangles><lines count="1"><input offset="0" semantic="VERTEX" source="#MIX-v"/><p>0 1</p></lines></mesh></geometry>`;
    const idx = indexDae(inline(`<node id="M"><instance_geometry url="#MIX"/></node>`, "", mixed));
    expect(idx.entries).toEqual([{ instanceKey: "M", nodeId: "M", rawName: null, kind: "malla-suelta" }]);
    expect(idx.lineObjects).toBe(1);
  });

  it("sin <scene>, usa la única visual_scene", () => {
    const idx = indexDae(inline(`<node id="A"><instance_node url="#LIB"/></node>`, "", "", { withScene: false }));
    expect(idx.entries.map((e) => e.instanceKey)).toEqual(["A"]);
  });
});

describe("indexDae: estructura no cubierta → DaeStructureError con el id del nodo", () => {
  it("nodo con dos instance_node", () => {
    const error = structureError(buildDae({ panels: [], nodeWithTwoInstances: true }));
    expect(error.nodeId).toBe("DOBLE");
  });

  it("nodo con instance_node y contenido propio", () => {
    expect(structureError(inline(`<node id="A"><instance_node url="#LIB"/><instance_geometry url="#TRI"/></node>`)).nodeId).toBe("A");
    expect(structureError(inline(`<node id="B"><instance_node url="#LIB"/><node id="C"/></node>`)).nodeId).toBe("B");
  });

  it("componente anidado (un componente de la biblioteca con otro instance_node)", () => {
    expect(structureError(buildDae({ panels: [], nestedComponent: true })).nodeId).toBe("ANIDADO");
  });

  it("instance_node que apunta a un nodo inexistente", () => {
    expect(structureError(inline(`<node id="A"><instance_node url="#NO-EXISTE"/></node>`)).nodeId).toBe("A");
  });

  it("instance_geometry que apunta a una geometría inexistente", () => {
    expect(structureError(inline(`<node id="A"><instance_geometry url="#NO-EXISTE"/></node>`)).nodeId).toBe("A");
  });

  it("geometría sin triángulos ni líneas", () => {
    const empty = `<geometry id="VACIA"><mesh></mesh></geometry>`;
    expect(structureError(inline(`<node id="A"><instance_geometry url="#VACIA"/></node>`, "", empty)).nodeId).toBe("A");
  });

  it("nodo de instancia sin id", () => {
    const error = structureError(inline(`<node id="G"><node name="sin-id"><instance_node url="#LIB"/></node></node>`));
    expect(error.nodeId).toBe("G/(sin id)");
  });

  it("dos instancias con el mismo instanceKey (id repetido)", () => {
    expect(structureError(inline(`<node id="A"><instance_node url="#LIB"/></node><node id="A"><instance_node url="#LIB"/></node>`)).nodeId).toBe("A");
  });

  it("XML mal formado o sin visual_scene", () => {
    expect(structureError("<COLLADA><sin-cerrar></COLLADA>").nodeId).toBe("");
    expect(structureError(`<?xml version="1.0"?><COLLADA><asset/></COLLADA>`).nodeId).toBe("");
  });

  it("<scene> que apunta a una visual_scene inexistente", () => {
    const xml = inline(`<node id="A"><instance_node url="#LIB"/></node>`).replace(`url="#VS"/></scene>`, `url="#OTRA"/></scene>`);
    expect(structureError(xml).nodeId).toBe("");
  });
});

describe("indexDae: XML etiquetado y unidad", () => {
  it("taggedXml: cada nodo-instancia lleva name = @key:<instanceKey>; el nombre del componente no cambia", () => {
    const idx = indexDae(read("tests/fixtures/dae/minimo.dae"));
    const doc = new DOMParser().parseFromString(idx.taggedXml, "application/xml");
    const byId = (id: string) => Array.from(doc.getElementsByTagName("node")).find((n) => n.getAttribute("id") === id);
    expect(byId("ID3")?.getAttribute("name")).toBe(`${KEY_PREFIX}ID2/ID3`);
    expect(byId("ID4")?.getAttribute("name")).toBe(`${KEY_PREFIX}ID2/ID4`);
    expect(byId("ID2")?.getAttribute("name")).toBe("group_0");
    expect(byId("ID10")?.getAttribute("name")).toBe("_9999-01-M01-C04");
  });

  it("unitMeters lee <unit meter>; sin <unit>, 1 (COLLADA)", () => {
    expect(indexDae(read("tests/fixtures/dae/minimo.dae")).unitMeters).toBe(0.0254);
    expect(indexDae(buildDae({ unit: { meter: 0.01, name: "centimeter" }, panels: [] })).unitMeters).toBe(0.01);
    expect(indexDae(inline("").replace(/<asset>.*<\/asset>/, "")).unitMeters).toBe(1);
  });
});

describe("indexDae con el .dae real", () => {
  it("olmo.dae: 33 componentes + 6 mallas sueltas + 0 líneas, instanceKey únicos, C01 con su nombre crudo", () => {
    const idx = indexDae(read("public/models/Olmo/olmo.dae"));
    expect(idx.entries.filter((e) => e.kind === "componente")).toHaveLength(33);
    expect(idx.entries.filter((e) => e.kind === "malla-suelta")).toHaveLength(6);
    expect(idx.lineObjects).toBe(0);
    expect(new Set(idx.entries.map((e) => e.instanceKey)).size).toBe(39);
    for (const e of idx.entries) expect(e.instanceKey).toMatch(/^ID\d+(\/ID\d+)*$/);
    // Código real del repo (en docs/ va anonimizado como 9999).
    expect(idx.entries.filter((e) => e.rawName === "_0001-01-M01-C01__")).toHaveLength(1);
  });

  // Sin escribir cifras del segundo fixture: el índice cuenta lo mismo que la carga del visor.
  const SABRINA_DIR = path.join(ROOT, "Sabrina", "Archivo Collada");
  const sabrinaDae = existsSync(SABRINA_DIR) ? readdirSync(SABRINA_DIR).find((n) => n.toLowerCase().endsWith(".dae")) : undefined;
  const models = [
    ["primer fixture", path.join(ROOT, "public", "models", "Olmo", "olmo.dae")],
    ...(sabrinaDae ? [["segundo fixture (local)", path.join(SABRINA_DIR, sabrinaDae)]] : []),
  ];

  it.each(models)("%s: mismas instancias, mallas sin código y líneas que la carga del visor", (_name, file) => {
    const idx = indexDae(readFileSync(file, "utf8"));
    const model = loadDaeModel(file);
    expect(idx.entries.filter((e) => e.kind === "componente")).toHaveLength(model.parts.length);
    expect(idx.entries.filter((e) => e.kind === "malla-suelta")).toHaveLength(model.excluded.meshesWithoutCode);
    expect(idx.lineObjects).toBe(model.excluded.lineObjects);
  });
});
