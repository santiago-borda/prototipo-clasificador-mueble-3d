// S3-D5, F3, F4 (docs/spec-s3-almacenamiento-archivos.md v0.2): batería de contrato de `FileRepository` (tabla
// `stored_file`), contra memoria y PostgreSQL, como contract.ts y contractErp.ts.

import { describe, expect, it } from "vitest";
import { TenantInexistenteError, type NewStoredFile } from "@/persistence/ports";
import type { PersistenceFactory } from "./contract";

const SHA = (c: string) => c.repeat(64);

const archivo = (tenantId: string, extra: Partial<NewStoredFile> = {}): NewStoredFile => ({
  id: "f0000000-0000-4000-8000-000000000001",
  sha256: SHA("a"),
  bytes: 12,
  contentType: "application/zip",
  kind: "zip",
  originalName: "olmo.zip",
  storageKey: `t/${tenantId}/archivos/${SHA("a")}`,
  uploadedBy: "erp",
  ...extra,
});

export function filesContract(label: string, factory: PersistenceFactory): void {
  describe(`contrato de stored_file (S3): ${label}`, () => {
    it("insert, get y findBySha256; el mismo sha256 dos veces en una carpintería es una sola fila (F4)", async () => {
      const p = await factory({ now: () => new Date("2026-11-21T12:00:00.000Z") });
      try {
        const a = await p.tenants.create({ name: "A" });
        const meta = await p.files.insert(a.id, archivo(a.id));
        expect(meta).toEqual({ ...archivo(a.id), createdAt: new Date("2026-11-21T12:00:00.000Z") });
        expect(await p.files.get(a.id, meta.id)).toEqual(meta);
        expect(await p.files.findBySha256(a.id, SHA("a"))).toEqual(meta);
        expect(await p.files.findBySha256(a.id, SHA("b"))).toBeNull();
        // Otro id con el mismo contenido: devuelve la fila que ya estaba.
        const otra = await p.files.insert(a.id, archivo(a.id, { id: "f0000000-0000-4000-8000-000000000002", originalName: "otro.zip" }));
        expect(otra).toEqual(meta);
        expect(await p.files.get(a.id, "f0000000-0000-4000-8000-000000000002")).toBeNull();
      } finally {
        await p.close();
      }
    });

    it("F3: la carpintería B no ve los archivos de la A; en B el mismo contenido es otra fila", async () => {
      const p = await factory();
      try {
        const a = await p.tenants.create({ name: "A" });
        const b = await p.tenants.create({ name: "B" });
        const enA = await p.files.insert(a.id, archivo(a.id));
        expect(await p.files.get(b.id, enA.id)).toBeNull();
        expect(await p.files.findBySha256(b.id, SHA("a"))).toBeNull();
        const enB = await p.files.insert(b.id, archivo(b.id, { id: "f0000000-0000-4000-8000-00000000000b" }));
        expect(enB.storageKey).toBe(`t/${b.id}/archivos/${SHA("a")}`);
        expect(await p.files.get(a.id, enB.id)).toBeNull();
      } finally {
        await p.close();
      }
    });

    it("carpintería inexistente: TenantInexistenteError; dos inserts del mismo contenido a la vez dan la misma fila", async () => {
      const p = await factory();
      try {
        await expect(p.files.insert("no-existe", archivo("no-existe"))).rejects.toThrow(TenantInexistenteError);
        const a = await p.tenants.create({ name: "A" });
        const [x, y] = await Promise.all([
          p.files.insert(a.id, archivo(a.id, { id: "f0000000-0000-4000-8000-0000000000c1", sha256: SHA("c"), storageKey: `t/${a.id}/archivos/${SHA("c")}` })),
          p.files.insert(a.id, archivo(a.id, { id: "f0000000-0000-4000-8000-0000000000c2", sha256: SHA("c"), storageKey: `t/${a.id}/archivos/${SHA("c")}` })),
        ]);
        expect(x).toEqual(y);
      } finally {
        await p.close();
      }
    });
  });
}
