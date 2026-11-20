// IE-13: servidor del ERP simulado (node:http, sin dependencias). `npm run erp:simulado`.
//   ERP_SIMULADO_PUERTO  puerto (por defecto 4010); escucha solo en 127.0.0.1.
//   PFG_URL              origen de este sistema para el iframe (por defecto http://localhost:3000).
// Abrir http://localhost:4010/anfitrion?proyecto=P-0002 (con «localhost», no 127.0.0.1: así el anfitrión y la app
// son del mismo sitio y la cookie SameSite=Lax viaja dentro del iframe, como entre erp-qa y taller-test).
// La app tiene que correr con ERP_MODO=simulado y ERP_FRONT_ORIGENES=http://localhost:4010.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { crearErpSimulado } from "./erp";

const puerto = Number(process.env.ERP_SIMULADO_PUERTO ?? 4010);
const origenPfg = process.env.PFG_URL ?? "http://localhost:3000";
const dae = readFileSync(path.resolve(process.cwd(), "public", "models", "Olmo", "olmo.dae"));
const erp = crearErpSimulado({ daeOlmo: new Uint8Array(dae), origenPfg });

const servidor = createServer(async (req, res) => {
  try {
    const cuerpo: Buffer[] = [];
    for await (const parte of req) cuerpo.push(parte as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(`http://localhost:${puerto}${req.url ?? "/"}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(cuerpo),
    });
    const respuesta = await erp.manejar(request);
    res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
    res.end(Buffer.from(await respuesta.arrayBuffer()));
    // Sin cabeceras ni cuerpos: el registro no lleva tokens.
    console.info(`erp-simulado ${req.method} ${(req.url ?? "/").split("?")[0]} ${respuesta.status}`);
  } catch (error) {
    console.error(`erp-simulado error ${error instanceof Error ? error.name : "desconocido"}`);
    res.writeHead(500).end();
  }
});

servidor.listen(puerto, "127.0.0.1", () => {
  console.info(`ERP simulado en http://localhost:${puerto} · anfitrión: http://localhost:${puerto}/anfitrion?proyecto=P-0002 · iframe → ${origenPfg}`);
});
