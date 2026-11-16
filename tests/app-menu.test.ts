// Menú de secciones (src/components/AppMenu.tsx): reemplaza a las pestañas fijas Piezas / Escanear QR por un botón a la
// izquierda que despliega las dos secciones. Se monta con React DOM en jsdom.

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

const { AppMenu } = await import("@/components/AppMenu");

let root: Root;
let container: HTMLDivElement;
const button = () => container.querySelector<HTMLButtonElement>("nav > div > button") as HTMLButtonElement;
const links = () => [...container.querySelectorAll<HTMLAnchorElement>("nav a")];

async function mount(path: string) {
  pathname = path;
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(AppMenu));
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Menú de secciones", () => {
  it("cerrado: un solo botón a la izquierda con la sección actual; sin pestañas a la vista", async () => {
    await mount("/escanear");
    expect(container.querySelector('nav[aria-label="Secciones"]')).not.toBeNull();
    expect(button().textContent).toBe("Escanear QR");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(links()).toHaveLength(0);
  });

  it("al tocarlo despliega Piezas y Escanear QR, marca la actual y se cierra al elegir", async () => {
    await mount("/p/olmo-c04");
    await act(async () => button().click());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(button().getAttribute("aria-controls") ?? "")).not.toBeNull();
    expect(links().map((a) => [a.getAttribute("href"), a.textContent, a.getAttribute("aria-current")])).toEqual([
      ["/", "PiezasMuebles y la ficha de cada pieza", "page"],
      ["/escanear", "Escanear QRAbrí una ficha con la cámara", null],
    ]);
    await act(async () => links()[1].click());
    expect(links()).toHaveLength(0);
  });

  it("Escape cierra y devuelve el foco al botón; un clic afuera también cierra", async () => {
    await mount("/");
    await act(async () => button().click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(links()).toHaveLength(0);
    expect(document.activeElement).toBe(button());
    await act(async () => button().click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(links()).toHaveLength(0);
  });

  it("en el backoffice el botón dice «Carga por CSV» (no está en el menú)", async () => {
    await mount("/backoffice/csv");
    expect(button().textContent).toBe("Carga por CSV");
  });
});
