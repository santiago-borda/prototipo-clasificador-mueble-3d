// Formato de los ids del ERP (proyecto, Documento, usuario, tenant). ASUMIDO hasta U-erp-real (P-0002, D-0001…):
// texto corto sin barras ni espacios. Lo comparten el servidor (esquemas del cliente) y las páginas.
export const ID_ERP = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
