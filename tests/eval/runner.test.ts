// @vitest-environment node
// T5: runner del eval y DOM de jsdom (docs/spec-t5-runner-eval.md v0.2 §4; plan T5, M20).
// Entorno node a propósito: así R7 ve los globales que pone installDom() y no los del entorno jsdom de vitest.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installDom } from "../../eval/dom";

const ROOT = path.resolve(__dirname, "..", "..");
const EVAL_DIR = path.join(ROOT, "eval");
const PROCESS_TIMEOUT_MS = 60_000;

function run(command: string): { status: number | null; out: string } {
  const r = spawnSync(command, { cwd: ROOT, shell: true, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function jsdomVersionFrom(file: string): string {
  return (createRequire(file)("jsdom/package.json") as { version: string }).version;
}

describe("T5: runner del eval (M20)", () => {
  it("R1: vitest y eval/dom.ts resuelven el mismo jsdom, 24.1.3", () => {
    const fromVitest = jsdomVersionFrom(createRequire(__filename).resolve("vitest/package.json"));
    const fromEval = jsdomVersionFrom(path.join(EVAL_DIR, "dom.ts"));
    expect(fromEval).toBe(fromVitest);
    expect(fromEval).toBe("24.1.3");
    expect(installDom().jsdomVersion).toBe(fromEval);
  });

  it(
    "R2: alias-check resuelve @/ y corre observeDae en Node fuera de vitest (39 observaciones en el primer fixture)",
    () => {
      const r = run("npx vite-node --config vitest.config.ts eval/alias-check.ts");
      expect(r.status).toBe(0);
      expect(r.out).toContain("observaciones: 39");
    },
    PROCESS_TIMEOUT_MS,
  );

  it(
    "R3: sin installDom(), indexDae falla con DOMParser is not defined",
    () => {
      const r = run("npx vite-node --config vitest.config.ts tests/eval/sinDom.ts");
      expect(r.status).not.toBe(0);
      expect(r.out).toContain("DOMParser is not defined");
    },
    PROCESS_TIMEOUT_MS,
  );

  it(
    "R4: npm run eval imprime la versión de jsdom y sale con 0",
    () => {
      const r = run("npm run eval");
      expect(r.status).toBe(0);
      expect(r.out).toContain("jsdom 24.1.3");
    },
    PROCESS_TIMEOUT_MS,
  );

  it("R5 (T5-E1): package.json no suma dependencias; vite-node no está en devDependencies", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // Lista actual del repo (10/11), no la del plan T5: @google-cloud/vision y @vercel/blob entraron antes de T5.
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "@google-cloud/vision", // Aprobada por el equipo el 10/11 (CLAUDE.md, "Credenciales de Google Cloud"). No autoriza enviar datos reales: la compuerta por sha256 sigue.
      "@react-three/drei",
      "@react-three/fiber",
      "@vercel/blob",
      "jsqr",
      "next",
      "qrcode",
      "react",
      "react-dom",
      "three",
      "zustand",
    ]);
    expect(Object.keys(pkg.devDependencies).sort()).toEqual([
      "@tailwindcss/turbopack",
      "@types/node",
      "@types/qrcode",
      "@types/react",
      "@types/react-dom",
      "@types/three",
      "eslint",
      "eslint-config-next",
      "jsdom",
      "tailwindcss",
      "typescript",
      "vitest",
    ]);
    expect(Object.keys(pkg.devDependencies)).not.toContain("vite-node"); // viene con vitest
  });

  it("R6 (T5-E3): ningún archivo de eval/ usa la red ni importa OCR, Blob ni el importador", () => {
    // LÍMITE: la prueba es estática y solo ve imports directos de cada archivo de eval/. No sigue la cadena de
    // dependencias: si eval/ importa un módulo de src/ que a su vez importa @vercel/blob, esto no lo detecta.
    // vite-node no aplica tests/setup/sinRed.ts (T5-E3), así que en el eval no hay guarda en tiempo de ejecución.
    const files = readdirSync(EVAL_DIR, { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|mts|js|mjs)$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(3);
    const forbidden = [/^@google-cloud\/vision/, /^@vercel\/blob/, /(^@\/|\/src\/)pdf\/ocr(\/|$)/, /(^@\/|\/src\/)importer(\/|$)/];
    const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
    const problems: string[] = [];
    for (const file of files) {
      const text = readFileSync(path.join(EVAL_DIR, file), "utf8");
      if (/\bfetch\b/.test(text)) problems.push(`${file}: fetch`);
      for (const [, spec] of text.matchAll(specifier)) {
        const normalized = spec.startsWith(".") ? path.posix.join("/eval", path.posix.dirname(file.replaceAll("\\", "/")), spec) : spec;
        if (forbidden.some((re) => re.test(normalized))) problems.push(`${file}: ${spec}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("R7: installDom() dos veces usa un solo JSDOM y no reemplaza los globales", () => {
    const first = installDom();
    const globals = { DOMParser: globalThis.DOMParser, XMLSerializer: globalThis.XMLSerializer, document: globalThis.document };
    expect(globals.DOMParser).toBeTypeOf("function");
    expect(globals.XMLSerializer).toBeTypeOf("function");
    expect(globals.document).toBeDefined();
    const second = installDom();
    expect(second).toBe(first);
    expect(globalThis.DOMParser).toBe(globals.DOMParser);
    expect(globalThis.XMLSerializer).toBe(globals.XMLSerializer);
    expect(globalThis.document).toBe(globals.document);
  });
});
