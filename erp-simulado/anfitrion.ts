// IE-13: página /anfitrion del ERP simulado. Hace de frontend del ERP según el contrato UCP v1 §5 (reemplaza al
// host-erp.html, que Casa Mueble no mandó): embebe {UCP}/erp/proyectos/{uuid}, responde `ucp:listo` con
// `erp:sesion`, manda `erp:token` antes de cada vencimiento y ajusta el alto con `ucp:alto`.
// Botones: «Enviar a UCP» (y variantes con error), renovar ya, token de otro usuario, tenant distinto, dejar de renovar
// (la sesión vence a los `vence` + 60 s), tema y recargar. La página nunca muestra ni registra el token.

import type { ProyectoSimulado, UsuarioSimulado } from "./erp";

/** JSON seguro dentro de <script>. */
const enScript = (v: unknown) => JSON.stringify(v).replaceAll("<", "\\u003c");
const enHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function paginaAnfitrion(o: {
  origenUcp: string;
  proyecto: ProyectoSimulado;
  proyectos: readonly ProyectoSimulado[];
  usuarios: readonly UsuarioSimulado[];
  otroTenant: string;
  duracionS: number;
}): string {
  const usuarios = o.usuarios
    .filter((u) => u.tenantId === o.proyecto.tenantId)
    .map((u) => `<option value="${enHtml(u.sub)}">${enHtml(u.nombre)}</option>`)
    .join("");
  const proyectos = o.proyectos
    .map((p) => `<option value="${enHtml(p.uuid)}"${p.uuid === o.proyecto.uuid ? " selected" : ""}>${enHtml(p.codigo)} · ${enHtml(p.nombre)}</option>`)
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
  iframe { width: 100%; height: 480px; border: 1px solid #cbd5e1; background: white; display: block; }
  #registro { font: 12px ui-monospace, monospace; background: #0f172a; color: #e2e8f0; padding: 8px; height: 130px; overflow: auto; margin-top: 8px; }
</style>
</head>
<body>
<div class="aviso">ERP SIMULADO — no es el ERP de Casa Mueble. Datos de prueba.</div>
<header>
  <strong>ERP (simulado)</strong>
  <label>Proyecto: <select id="proyecto">${proyectos}</select></label>
  <label>Usuario: <select id="usuario">${usuarios}</select></label>
  <label>Tema: <select id="tema"><option value="claro">claro</option><option value="oscuro">oscuro</option></select></label>
</header>
<main>
  <div class="controles">
    <button id="enviar">Enviar a UCP</button>
    <button id="enviar-malo">Enviar con sha256 malo</button>
    <button id="enviar-sin-dae">Enviar zip sin .dae</button>
    <button id="enviar-ajena">Enviar con URL ajena</button>
  </div>
  <div class="controles">
    <button id="renovar">Renovar el token ya</button>
    <button id="otro">Mandar el token de otro usuario</button>
    <button id="tenant">Reabrir con un tenant distinto</button>
    <label><input type="checkbox" id="pausa"> Dejar de renovar</label>
    <button id="recargar">Recargar el iframe</button>
    <span id="vence"></span>
  </div>
  <iframe id="ucp" title="UCP"></iframe>
  <div id="registro" aria-label="Registro de mensajes"></div>
</main>
<script>
(function () {
  const ORIGEN_UCP = ${enScript(o.origenUcp)};
  const PROYECTO = ${enScript({ uuid: o.proyecto.uuid, codigo: o.proyecto.codigo, nombre: o.proyecto.nombre })};
  const USUARIOS = ${enScript(o.usuarios.map((u) => ({ sub: u.sub, tenantId: u.tenantId })))};
  const OTRO_TENANT = ${enScript(o.otroTenant)};
  const DURACION = ${enScript(o.duracionS)};
  const frame = document.getElementById("ucp");
  const registro = document.getElementById("registro");
  const usuario = document.getElementById("usuario");
  const tema = document.getElementById("tema");
  const pausa = document.getElementById("pausa");
  let temporizador = null;
  let tenantDistinto = false;

  function anotar(texto) {
    const linea = document.createElement("div");
    linea.textContent = new Date().toLocaleTimeString() + "  " + texto;
    registro.prepend(linea);
  }

  async function token(sub) {
    const r = await fetch("/simulado/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario: sub, venceEnS: DURACION }) });
    return r.json();
  }

  function enviarAlIframe(mensaje) {
    frame.contentWindow.postMessage(mensaje, ORIGEN_UCP); // nunca "*"
  }

  function programarRenovacion(vence) {
    clearTimeout(temporizador);
    document.getElementById("vence").textContent = "token vence " + new Date(vence * 1000).toLocaleTimeString();
    const espera = Math.max(5000, vence * 1000 - Date.now() - 30000);
    temporizador = setTimeout(renovar, espera);
  }

  async function renovar(sub) {
    if (pausa.checked && !sub) { anotar("renovación en pausa: no se manda erp:token"); return; }
    const t = await token(sub || usuario.value);
    enviarAlIframe({ tipo: "erp:token", version: 1, accessToken: t.accessToken, vence: t.vence });
    anotar("enviado erp:token" + (sub ? " (de otro usuario)" : "") + " — el token no se muestra");
    if (!sub) programarRenovacion(t.vence);
  }

  window.addEventListener("message", async function (e) {
    if (e.origin !== ORIGEN_UCP || e.source !== frame.contentWindow) return;
    const m = e.data;
    if (!m || m.version !== 1) return;
    if (m.tipo === "ucp:alto" && Number.isInteger(m.alto)) {
      frame.style.height = Math.max(240, Math.min(m.alto, 4000)) + "px";
      return;
    }
    if (m.tipo === "ucp:listo") {
      anotar("recibido ucp:listo");
      const t = await token(usuario.value);
      const tenantId = tenantDistinto ? OTRO_TENANT : t.tenantId;
      enviarAlIframe({ tipo: "erp:sesion", version: 1, accessToken: t.accessToken, vence: t.vence, tenantId: tenantId, proyecto: PROYECTO, tema: tema.value });
      anotar("enviado erp:sesion" + (tenantDistinto ? " con tenantId distinto del token" : ""));
      tenantDistinto = false;
      programarRenovacion(t.vence);
    }
  });

  async function enviar(variante) {
    anotar("Enviar a UCP (" + variante + ")…");
    const r = await fetch("/simulado/enviar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usuario: usuario.value, proyecto: PROYECTO.uuid, variante: variante }) });
    const c = await r.json();
    const cuerpo = c.cuerpo || {};
    anotar("POST /api/trabajos → " + c.status + " " + (cuerpo.estado || cuerpo.error || "") + (cuerpo.mensaje ? " · " + cuerpo.mensaje : ""));
  }

  function cargar() {
    clearTimeout(temporizador);
    frame.src = ORIGEN_UCP + "/erp/proyectos/" + encodeURIComponent(PROYECTO.uuid);
    anotar("iframe → " + frame.src);
  }

  document.getElementById("enviar").onclick = function () { enviar("ok"); };
  document.getElementById("enviar-malo").onclick = function () { enviar("sha256-malo"); };
  document.getElementById("enviar-sin-dae").onclick = function () { enviar("sin-dae"); };
  document.getElementById("enviar-ajena").onclick = function () { enviar("url-ajena"); };
  document.getElementById("renovar").onclick = function () { renovar(); };
  document.getElementById("otro").onclick = function () {
    const otro = USUARIOS.find(function (u) { return u.sub !== usuario.value; });
    renovar(otro.sub);
  };
  document.getElementById("tenant").onclick = function () { tenantDistinto = true; cargar(); };
  document.getElementById("recargar").onclick = cargar;
  document.getElementById("proyecto").onchange = function (e) { location.search = "?proyecto=" + encodeURIComponent(e.target.value) + "&duracion=" + DURACION; };
  usuario.onchange = cargar;
  tema.onchange = cargar;
  cargar();
})();
</script>
</body>
</html>`;
}
