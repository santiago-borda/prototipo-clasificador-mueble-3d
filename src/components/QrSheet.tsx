"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import type { QrEntry, QrKind } from "@/lib/lookup";

const SECTIONS: ReadonlyArray<{ kind: QrKind; title: string }> = [
  { kind: "furniture", title: "Mueble" },
  { kind: "module", title: "Módulos" },
  { kind: "piece", title: "Piezas" },
];

// El origen de la página no cambia mientras está abierta: no hay nada a qué suscribirse.
const subscribeNever = () => () => {};

function isLocalHost(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/** QR reales de cada mueble, módulo y pieza: se escanean con la cámara del celular y abren la ficha. */
export function QrSheet({ entries }: { entries: readonly QrEntry[] }) {
  // La dirección por defecto es la de esta misma página; en el servidor no existe, por eso "".
  const origin = useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const [override, setOverride] = useState<string | null>(null);
  const baseUrl = override ?? origin;
  const setBaseUrl = setOverride;
  const [images, setImages] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    const base = baseUrl.trim().replace(/\/+$/, "");
    if (!base) return;
    let cancelled = false;
    Promise.all(
      entries.map(async (entry) => {
        const url = await QRCode.toDataURL(`${base}/p/${entry.qrId}`, { width: 360, margin: 1, errorCorrectionLevel: "M" });
        return [entry.qrId, url] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) setImages(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, entries]);

  const base = baseUrl.trim().replace(/\/+$/, "");

  return (
    <main className="mx-auto w-full max-w-4xl p-4 pb-10 lg:p-8">
      <div className="print:hidden">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Lista de QR
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">QR para escanear</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escaneá cada código con la cámara del celular para abrir su ficha, o imprimí esta página.
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="base-url">
          Dirección base de los QR
        </label>
        <input
          id="base-url"
          type="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          placeholder="http://192.168.0.11:3000"
          spellCheck={false}
        />
        {isLocalHost(baseUrl) ? (
          <p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Con <strong>localhost</strong> el celular no va a poder abrir los QR. Abrí esta página desde la IP de la PC
            (por ejemplo <code>http://192.168.0.11:3000/qr</code>, con <code>npm run dev:lan</code>) o escribí arriba la dirección
            pública donde esté publicado.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Cada QR apunta a <code>{base || "…"}/p/&lt;código&gt;</code>. El celular y la PC tienen que estar en la misma red.
          </p>
        )}

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 rounded-full bg-orange-500 px-5 py-2 text-sm font-medium text-white shadow hover:bg-orange-600"
        >
          Imprimir
        </button>
      </div>

      {SECTIONS.map((section) => {
        const items = entries.filter((entry) => entry.kind === section.kind);
        if (items.length === 0) return null;
        return (
          <section key={section.kind} className="mt-8 break-inside-avoid">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {items.map((entry) => (
                <li key={entry.qrId} className="break-inside-avoid rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200">
                  {images[entry.qrId] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL generado en el cliente
                    <img src={images[entry.qrId]} alt={`QR de ${entry.code} ${entry.title}`} className="mx-auto aspect-square w-full max-w-[180px]" />
                  ) : (
                    <div className="mx-auto aspect-square w-full max-w-[180px] animate-pulse rounded bg-slate-100" />
                  )}
                  <p className="mt-2 text-sm font-semibold text-orange-600">{entry.code}</p>
                  <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                  <p className="text-xs text-slate-500">{entry.subtitle}</p>
                  <Link href={`/p/${entry.qrId}`} className="mt-1 inline-block text-xs text-slate-500 underline print:hidden">
                    Abrir ficha
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
