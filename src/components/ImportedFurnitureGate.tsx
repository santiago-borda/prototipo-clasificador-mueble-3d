"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ImportedFurnitureDef } from "@/importer/buildDef";
import { IMPORT_ID_FORMAT } from "@/importer/paths";
import { getImportedFurnitureDef, registerImportedFurniture } from "@/lib/lookup";
import { useViewStore } from "@/store/viewStore";
import { ViewerLayout } from "./ViewerLayout";

type State = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto w-full max-w-xl p-6 text-sm text-slate-600">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2">{text}</p>
      <Link href="/" className="mt-4 inline-block underline">
        Ir al inicio
      </Link>
    </main>
  );
}

/**
 * R8: busca la importación, la registra en el navegador (fuente adicional de lookup.ts) y recién entonces muestra
 * el visor y las fichas de siempre. No hay estado compartido en el servidor entre peticiones.
 */
export function ImportedFurnitureGate({ importId, children }: { importId: string; children: React.ReactNode }) {
  const [state, setState] = useState<State>(() =>
    getImportedFurnitureDef(importId) ? { status: "ready" } : { status: "loading" },
  );

  useEffect(() => {
    if (getImportedFurnitureDef(importId)) return;
    if (!IMPORT_ID_FORMAT.test(importId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/importaciones/${importId}`);
        if (res.status === 404) throw new Error("No existe esa importación (puede haberse borrado).");
        if (!res.ok) throw new Error(`No se pudo leer la importación (error ${res.status}).`);
        const { mueble } = (await res.json()) as { mueble: ImportedFurnitureDef };
        const def = registerImportedFurniture(importId, mueble);
        // Antes de mostrar el visor: así el primer render ya carga este mueble y no el de Olmo.
        useViewStore.getState().setSelectedQrId(def.furniture.qrId);
        if (!cancelled) setState({ status: "ready" });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Error desconocido." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importId]);

  if (!IMPORT_ID_FORMAT.test(importId)) return <Message title="Link no válido" text="Ese link de prueba no tiene el formato esperado." />;
  if (state.status === "error") return <Message title="No se pudo abrir la importación" text={state.message} />;
  if (state.status === "loading") return <Message title="Cargando importación…" text="Buscando el mueble en el servidor." />;
  return <ViewerLayout>{children}</ViewerLayout>;
}
