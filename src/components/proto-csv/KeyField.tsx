"use client";

import { setUploadKey, useUploadKey } from "@/proto-csv/keyStore";

/** Clave de subida: campo de texto, solo en memoria de la página (sin NEXT_PUBLIC_*, sin localStorage). */
export function KeyField() {
  const key = useUploadKey();
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">Clave de carga</span>
      <input
        type="password"
        autoComplete="off"
        value={key}
        onChange={(e) => setUploadKey(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        placeholder="La da el responsable del proyecto"
      />
      <span className="mt-1 block text-xs text-slate-500">Queda solo en esta pestaña mientras no la recargues; no se guarda.</span>
    </label>
  );
}
