// SIMULA LA SALIDA DEL FUTURO MOTOR DE ASOCIACIÓN.
// En el sistema real, este vínculo PieceType -> instancias físicas del modelo 3D
// lo va a producir un motor que cruza el listado de piezas con la geometría del .dae.
// Acá está escrito a mano, solo para que el prototipo tenga algo contra qué resaltar.
//
// Clave: PieceType.code. Valor: instanceId = `<nombre del componente en el .dae>#<n>`
// (ver model/colladaModel.ts). Los nombres salen de public/models/olmo.dae (SketchUp);
// el sufijo #n numera las copias del mismo componente en orden de aparición.
//
// Las piezas del .dae que no tienen ficha en el mock (_03, _07..._11, _13..._21) quedan sin
// mapear: se ven en neutro y no navegan al tocarlas. Los herrajes no se cargan (ver model/colladaModel.ts).

export const pieceInstanceMapping: Readonly<Record<string, readonly string[]>> = {
  _01: ["_01_Mesa_Techo_escritorio#1"],
  _02: ["_02_Lateral_escritorio#1"],
  _04: ["_04_Lateral_modulo_cajones#1", "_04_Lateral_modulo_cajones#2"],
  _05: ["_05_Piso_y_techo_modulo_cajones#1", "_05_Piso_y_techo_modulo_cajones#2"],
  _06: ["_06_gola_vertical#1"],
  _12: ["_12_Fondo_cajones#1", "_12_Fondo_cajones#2"],
};

// ASUMIDO PARA EL PROTOTIPO: a qué módulo pertenecen los componentes del .dae que todavía NO tienen
// ficha en el mock (no están en el listado de piezas provisto). Se deduce de los nombres del .dae
// (cajones, tapas, estante abierto, fondo del sector cajones -> módulo cajones; fajas y faja
// del medio -> escritorio) y hay que confirmarlo con Casa Mueble.
// Los componentes que sí tienen ficha se asignan solos por PieceType.moduleId.
export const moduleExtraComponents: Readonly<Record<string, readonly string[]>> = {
  "mod-escritorio": ["_03", "_17", "_18", "_19", "_20"],
  "mod-cajones": ["_07", "_08", "_09", "_10", "_11", "_13", "_14", "_15", "_16", "_21"],
};
