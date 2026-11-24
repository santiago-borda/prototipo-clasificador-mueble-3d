// IE-13: servidor del ERP simulado (node:http). `npm run erp:simulado`.
//   ERP_SIMULADO_URL   URL propia (por defecto http://127.0.0.1:4010; escucha solo en 127.0.0.1). La app tiene que
//                      usar la misma (es el issuer de los tokens y el origen de las URLs firmadas).
//   UCP_URL            origen de este sistema, para el iframe y «Enviar a UCP» (por defecto http://localhost:3000).
// Abrir http://localhost:4010/anfitrion (con «localhost», no 127.0.0.1: así el anfitrión y la app son del mismo
// sitio y la cookie SameSite=Lax viaja dentro del iframe, como entre erp-qa y taller-qa). `?duracion=60` acorta la
// vida de los tokens para ver la renovación y el vencimiento. La app corre con
// `ERP_MODO=simulado ERP_WEB_ORIGEN=http://localhost:4010 npm run dev`.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { crearErpSimulado } from "./erp";

const base = (process.env.ERP_SIMULADO_URL || "http://127.0.0.1:4010").replace(/\/+$/, "");
const puerto = Number(new URL(base).port || 80);
const origenUcp = process.env.UCP_URL || "http://localhost:3000";
const dae = readFileSync(path.resolve(process.cwd(), "public", "models", "Olmo", "olmo.dae"));
const erp = crearErpSimulado({ daeOlmo: new Uint8Array(dae), origenUcp, base });

const servidor = createServer(async (req, res) => {
  try {
    const cuerpo: Buffer[] = [];
    for await (const parte of req) cuerpo.push(parte as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(`${base}${req.url ?? "/"}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(cuerpo),
    });
    const respuesta = await erp.manejar(request);
    res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
    res.end(Buffer.from(await respuesta.arrayBuffer()));
    // Sin cabeceras, cuerpos ni query: el registro no lleva tokens ni firmas de URL.
    console.info(`erp-simulado ${req.method} ${(req.url ?? "/").split("?")[0]} ${respuesta.status}`);
  } catch (error) {
    console.error(`erp-simulado error ${error instanceof Error ? error.name : "desconocido"}`);
    res.writeHead(500).end();
  }
});

servidor.listen(puerto, "127.0.0.1", () => {
  console.info(`ERP simulado en ${base} · anfitrión: http://localhost:${puerto}/anfitrion · iframe → ${origenUcp}`);
});
