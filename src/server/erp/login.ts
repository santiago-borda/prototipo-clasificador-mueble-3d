// IE-11: login directo contra el ERP, **solo para desarrollo** (guía de auth de QA §1). Lo hace este servidor (la API
// de QA no acepta navegadores de otro dominio). La contraseña pasa de largo: no se guarda ni se registra. Con el ERP
// real esto es U-erp-real: solo con aprobación explícita del equipo. Las pruebas usan el simulado.
//
// ASUMIDO (guía §1): `POST {ERP_API_URL}/api/session/login` con `{email | nombreUsuario, password}`; la respuesta es
// un `OperationResult` con el token en `data.accessToken`. Si el usuario tiene «@», va como `email`.

import { LoginErpRechazado } from "./errores";

export interface OpcionesLogin {
  apiUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export async function loginDirecto(opciones: OpcionesLogin, credenciales: { usuario: string; password: string }): Promise<string> {
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const cuerpo = credenciales.usuario.includes("@")
    ? { email: credenciales.usuario, password: credenciales.password }
    : { nombreUsuario: credenciales.usuario, password: credenciales.password };
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), opciones.timeoutMs);
  let respuesta: Response;
  try {
    respuesta = await fetchImpl(`${opciones.apiUrl}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      redirect: "error",
      signal: control.signal,
    });
  } catch {
    throw new LoginErpRechazado(control.signal.aborted ? "tiempo-agotado" : "red");
  } finally {
    clearTimeout(reloj);
  }
  const json = (await respuesta.json().catch(() => null)) as { data?: { accessToken?: unknown } } | null;
  const token = json?.data?.accessToken;
  if (!respuesta.ok || typeof token !== "string" || token === "") throw new LoginErpRechazado(`http-${respuesta.status}`);
  return token;
}
