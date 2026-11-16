"use client";

// Zona de subida de un archivo (spike, backoffice de carga por CSV). Para quien carga los archivos: un número de paso,
// el formato bien visible, de dónde exportarlo, un botón "Elegir archivo" con ícono y arrastrar y soltar. El <input>
// queda en la página (oculto a la vista, accesible con teclado y lectores de pantalla): el clic en la zona lo abre.

import { useId, useState, type DragEvent } from "react";

interface FileDropProps {
  step: number;
  title: string;
  /** Formatos que se muestran como etiqueta: [".csv"], [".jpg", ".png"]. */
  formats: readonly string[];
  /** Atributo `accept` del input. */
  accept: string;
  required: boolean;
  /** De dónde sale el archivo (una línea). */
  hint: string;
  multiple?: boolean;
  files: readonly File[];
  onFiles: (files: File[]) => void;
}

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

function UploadIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Solo los archivos cuya extensión está en `formats` (al arrastrar no hay `accept` que filtre). */
const matching = (files: File[], formats: readonly string[]) => files.filter((f) => formats.some((ext) => f.name.toLowerCase().endsWith(ext.toLowerCase())));

export function FileDrop({ step, title, formats, accept, required, hint, multiple = false, files, onFiles }: FileDropProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const chosen = files.length > 0;

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = [...event.dataTransfer.files];
    const ok = matching(dropped, formats);
    if (ok.length === 0) {
      setDropError(`Ese archivo no es ${formats.join(" ni ")}.`);
      return;
    }
    setDropError(null);
    onFiles(multiple ? ok : ok.slice(0, 1));
  }

  const border = dragging ? "border-teal-500 bg-teal-50" : chosen ? "border-teal-300 bg-teal-50/40" : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50";

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${chosen ? "bg-teal-600 text-white" : "bg-slate-800 text-white"}`}>
          {chosen ? <CheckIcon className="h-3.5 w-3.5" /> : step}
        </span>
        <span className="font-semibold text-slate-900">{title}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${required ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{required ? "obligatorio" : "opcional"}</span>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2 ${border}`}
      >
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            setDropError(null);
            onFiles([...(e.target.files ?? [])]);
          }}
        />
        {!chosen ? (
          <>
            <UploadIcon className="h-8 w-8 text-slate-500" />
            <span className="flex flex-wrap justify-center gap-1">
              {formats.map((f) => (
                <span key={f} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                  {f}
                </span>
              ))}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
              <UploadIcon className="h-4 w-4" />
              Elegir archivo{multiple ? "s" : ""}
            </span>
            <span className="text-xs text-slate-500">o arrastralo{multiple ? "s" : ""} acá</span>
          </>
        ) : (
          <>
            <CheckIcon className="h-7 w-7 text-teal-600" />
            <ul className="text-sm text-slate-800">
              {files.map((f) => (
                <li key={f.name}>
                  <span className="font-medium">{f.name}</span> <span className="text-slate-500">· {kb(f.size)}</span>
                </li>
              ))}
            </ul>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              <UploadIcon className="h-3.5 w-3.5" />
              Cambiar
            </span>
          </>
        )}
      </label>

      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      {dropError && <p className="mt-1 text-xs text-red-700">{dropError}</p>}
    </div>
  );
}
