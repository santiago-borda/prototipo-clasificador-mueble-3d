"use client";

// IE-11: formulario del login de desarrollo. Manda usuario y contraseña a POST /api/erp/ingresar (el servidor hace el
// login contra el ERP y crea la sesión propia). La contraseña no se guarda: vive solo en este formulario.

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FormIngresar({ simulado }: { simulado: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    setEnviando(true);
    setError(null);
    const r = await fetch("/api/erp/ingresar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: form.get("usuario"), password: form.get("password") }),
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => null);
    setEnviando(false);
    if (r?.ok) {
      router.push("/erp/proyectos");
      return;
    }
    setError(r?.status === 401 ? "Usuario o contraseña incorrectos." : "No se pudo ingresar. Probá de nuevo.");
  }

  return (
    <main className="mx-auto w-full max-w-sm p-6 text-sm text-slate-700">
      <h1 className="text-lg font-semibold text-slate-900">Ingresar con el ERP</h1>
      <p className="mt-1 text-xs text-amber-800">Solo para desarrollo. Dentro del ERP no hay login: la sesión llega por el iframe.</p>
      {simulado && <p className="mt-1 text-xs text-slate-500">ERP simulado: usuario ana@simulado.test, contraseña simulado.</p>}
      <form onSubmit={enviar} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Email o nombre de usuario
          <input name="usuario" autoComplete="username" required className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <button type="submit" disabled={enviando} className="rounded bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
        {error && <p role="alert" className="text-red-700">{error}</p>}
      </form>
    </main>
  );
}
