// IE-12 / TIE-20: validación de la configuración al arrancar el servidor. Si algo está mal (ERP_MODO=simulado o
// ERP_LOGIN_DIRECTO con NODE_ENV=production, ERP_WEB_ORIGEN con comodines o barra final, ERP_ISSUER sin barra
// final, URLs http en producción), el servidor no arranca. Los mensajes nombran la variable, nunca su valor.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validarConfiguracionAlArrancar } = await import("./server/erp/config");
  validarConfiguracionAlArrancar(process.env);
}
