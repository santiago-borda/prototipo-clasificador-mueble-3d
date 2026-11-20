// IE-10 e IE-12: validación de la configuración al arrancar el servidor. Si algo está mal (ERP_MODO=simulado con
// NODE_ENV=production, ERP_FRONT_ORIGENES con comodines, o embebido encendido sin ERP_API_URL o sin SESION_CLAVE
// en producción), el servidor no arranca. Los mensajes nombran la variable, nunca su valor secreto.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validarConfiguracionAlArrancar } = await import("./server/embebido/config");
  validarConfiguracionAlArrancar(process.env);
}
