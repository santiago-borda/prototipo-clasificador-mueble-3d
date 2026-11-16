// Clave de subida del spike: SOLO en memoria de la página (variable de módulo). No va en el bundle (nada de
// NEXT_PUBLIC_*), no se guarda en localStorage, sessionStorage ni cookies, y se pierde al recargar.
// Sobrevive a la navegación interna entre /backoffice/csv, la revisión y la publicación (mismo módulo en memoria).

import { useSyncExternalStore } from "react";

let key = "";
const listeners = new Set<() => void>();

export function setUploadKey(value: string) {
  key = value;
  for (const listener of listeners) listener();
}

export function getUploadKey(): string {
  return key;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useUploadKey(): string {
  return useSyncExternalStore(subscribe, getUploadKey, () => "");
}
