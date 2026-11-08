// Tipos del motor de asociación: fuente única (docs/spec-sesion-2b-listado-cruce.md §2.1, D1).
// Tal como están en docs/spec-motor-asociacion.md v3 §5.2 (`Observation`) y §5.3 (`Evidence`).
// Si esa spec cambia, cambia este archivo; nadie copia estos tipos. Solo tipos: el motor no existe todavía.

/** Salida del adapter, única entrada geométrica del motor (spec-motor §5.2). */
export interface Observation {
  modelId: string;
  instanceKey: string;
  frameVersion: string;
  /** Nombre del componente (del XML); null = malla sin componente. */
  rawName: string | null;
  /** Caja ordenada ascendente (espesor, medio, mayor), en mm. */
  sizeMm: [number, number, number];
  /** false si hay normales fuera de los ejes. */
  axisAligned: boolean;
  /** Por el eje del espesor, en el marco. */
  orientation: "horizontal" | "vertical-lateral" | "vertical-frontal";
  /** Centro relativo a la caja de referencia del mueble, 0..1 por eje. */
  centerRel: [number, number, number];
  /** La caja de la instancia cruza el plano medio del mueble en ese eje. */
  crossesMidplane: [boolean, boolean, boolean];
  /** Largo de cada cara de canto; sin caras Canto_* -> "no-disponible". */
  edgeRunsMm: number[] | "no-disponible";
  /** Transformada con determinante < 0. */
  mirrored: boolean;
}

/** Evidencia de una comparación (spec-motor §5.3). */
export interface Evidence {
  kind: "codigo" | "medidas" | "espesor" | "cantidad" | "orientacion" | "posicion" | "canto" | "espejo";
  result: "cumple" | "no-cumple" | "neutral" | "no-disponible";
  /** Texto legible: qué se comparó y con qué valores. */
  detail: string;
  /** Id de la regla de vocabulario, si aplica. */
  rule?: string;
}
