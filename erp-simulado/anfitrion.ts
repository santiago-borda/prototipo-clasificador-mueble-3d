// IE-13: página /anfitrion del ERP simulado. Hace lo que haría el frontend del ERP con el componente del §10 de la
// spec (docs/guia-embebido-erp.md): embebe este sistema en un iframe y le pasa el token por postMessage.
// Botones para probar los casos: vencer el token, mandar el token de otro usuario y cerrar la sesión (erp:salir).
// La página nunca muestra el token: el registro dice solo el tipo de cada mensaje.

import type { UsuarioSimulado } from "./erp";

/** JSON seguro dentro de <script>. */
const enScript = (v: unknown) => JSON.stringify(v).replaceAll("<", "\\u003c");
const enHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function paginaAnfitrion(o: { origenPfg: string; proyecto: string; usuarios: readonly UsuarioSimulado[] }): string {
  const opciones = o.usuarios
    .map((u) => `<option value="${enHtml(u.id)}">${enHtml(u.nombre)} — ${enHtml(u.tenant.nombre)}</option>`)
    .join("");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ERP simulado — anfitrión</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 0; background: #eef1f5; color: #1e293b; }
  header { background: #1e3a8a; color: white; padding: 10px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header strong { font-size: 15px; }
  .aviso { background: #fde68a; color: #78350f; padding: 6px 16px; font-weight: 600; }
  main { padding: 12px 16px; }
  .controles { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
  button, select { font: inherit; padding: 4px 10px; }
  iframe { width: 100%; height: 75vh; border: 1px solid #cbd5e1; background: white; }
  #registro { font: 12px ui-monospace, monospace; background: #0f172a; color: #e2e8f0; padding: 8px; height: 110px; overflow: auto; margin-top: 8px; }
</style>
</head>
<body>
<div class="aviso">ERP SIMULADO — no es el ERP de Casa Mueble. Datos de prueba.</div>
<header>
  <strong>ERP (simulado) · Proyecto <span id="proyecto"></span></strong>
  <label>Usuario: <select id="usuario">${opciones}</select></label>
</header>
<main>
  <div class="controles">
    <button id="vencer">Vencer el token</button>
    <label><input type="checkbox" id="otro"> El próximo token es de otro usuario</label>
    <button id="salir">Cerrar sesión en el ERP (erp:salir)</button>
    <button id="recargar">Recargar el iframe</button>
  </div>
  <iframe id="pfg" title="Guía de armado"></iframe>
  <div id="registro" aria-label="Registro de mensajes"></div>
</main>
<script>
(function () {
  const ORIGEN_PFG = ${enScript(o.origenPfg)};
  const PROYECTO = ${enScript(o.proyecto)};
  const OTRO = { "u-ana": "u-bruno", "u-bruno": "u-ana", "u-carla": "u-ana" };
  const frame = document.getElementById("pfg");
  const registro = document.getElementById("registro");
  const usuario = document.getElementById("usuario");
  const otro = document.getElementById("otro");
  document.getElementById("proyecto").textContent = PROYECTO;

  function anotar(texto) {
    const linea = document.createElement("div");
    linea.textContent = new Date().toLocaleTimeString() + "  " + texto;
    registro.prepend(linea);
  }

  async function obtenerToken() {
    let id = usuario.value;
    if (otro.checked) { id = OTRO[id]; otro.checked = false; anotar("token de otro usuario: " + id); }
    const r = await fetch("/simulado/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario: id }) });
    const cuerpo = await r.json();
    return cuerpo.token;
  }

  function cargar() {
    frame.src = ORIGEN_PFG + "/embebido?proyecto=" + encodeURIComponent(PROYECTO);
    anotar("iframe → " + ORIGEN_PFG + "/embebido?proyecto=" + PROYECTO);
  }

  window.addEventListener("message", async function (e) {
    if (e.origin !== ORIGEN_PFG || e.source !== frame.contentWindow) return;
    const tipo = e.data && e.data.tipo;
    if (e.data && e.data.v === 1 && (tipo === "pfg:listo" || tipo === "pfg:token-requerido")) {
      anotar("recibido " + tipo);
      const token = await obtenerToken();
      frame.contentWindow.postMessage({ tipo: "erp:token", v: 1, token: token }, ORIGEN_PFG);
      anotar("enviado erp:token (el token no se muestra)");
    }
  });

  document.getElementById("vencer").onclick = async function () {
    await fetch("/simulado/vencer", { method: "POST" });
    anotar("tokens vencidos en el ERP simulado");
  };
  document.getElementById("salir").onclick = function () {
    frame.contentWindow.postMessage({ tipo: "erp:salir", v: 1 }, ORIGEN_PFG);
    anotar("enviado erp:salir");
  };
  document.getElementById("recargar").onclick = cargar;
  usuario.onchange = cargar;
  cargar();
})();
</script>
</body>
</html>`;
}
