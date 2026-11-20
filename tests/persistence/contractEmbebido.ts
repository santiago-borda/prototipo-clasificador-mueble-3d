// IE-4, IE-6, IE-8, IE-9: batería de contrato de los repositorios del embebido (docs/spec-integracion-erp-minima.md).
// Igual que contract.ts: una sola batería que corre contra memoria y contra PostgreSQL.

import { describe, expect, it } from "vitest";
import { ReferenciaDeOtroTenantError, TenantInexistenteError, TenantRequeridoError } from "@/persistence/ports";
import type { PersistenceFactory } from "./contract";

const AHORA = new Date("2026-11-20T12:00:00.000Z");
const VENCE = new Date("2026-11-20T20:00:00.000Z");

export function embebidoContract(label: string, factory: PersistenceFactory): void {
  describe(`contrato del embebido: ${label}`, () => {
    it("IE-6: ensureErpTenant crea la carpintería una vez por erpTenantId y la reutiliza", async () => {
      const p = await factory();
      try {
        const a = await p.tenants.ensureErpTenant({ erpTenantId: "t-casa-mueble", name: "Casa Mueble" });
        const b = await p.tenants.ensureErpTenant({ erpTenantId: "t-casa-mueble", name: "Otro nombre" });
        const c = await p.tenants.ensureErpTenant({ erpTenantId: "t-otra", name: "Otra" });
        expect(b).toEqual(a);
        expect(a.erpTenantId).toBe("t-casa-mueble");
        expect(a.name).toBe("Casa Mueble");
        expect(c.id).not.toBe(a.id);
        expect(await p.tenants.get(a.id)).toEqual(a);
        await expect(p.tenants.ensureErpTenant({ erpTenantId: "", name: "x" })).rejects.toThrow(TenantRequeridoError);
      } finally {
        await p.close();
      }
    });

    it("IE-9: linkErpProject vincula una vez por carpintería; el mismo erpProjectId en otra carpintería es otro proyecto", async () => {
      const p = await factory();
      try {
        const a = await p.tenants.ensureErpTenant({ erpTenantId: "t-a", name: "A" });
        const b = await p.tenants.ensureErpTenant({ erpTenantId: "t-b", name: "B" });
        const pa1 = await p.projects.linkErpProject(a.id, { erpProjectId: "P-0002", name: "Proyecto" });
        const pa2 = await p.projects.linkErpProject(a.id, { erpProjectId: "P-0002", name: "Proyecto renombrado" });
        const pb = await p.projects.linkErpProject(b.id, { erpProjectId: "P-0002", name: "Proyecto" });
        expect(pa2).toBe(pa1);
        expect(pb).not.toBe(pa1);
        await expect(p.projects.linkErpProject("", { erpProjectId: "P-1", name: "x" })).rejects.toThrow(TenantRequeridoError);
        await expect(p.projects.linkErpProject("no-existe", { erpProjectId: "P-1", name: "x" })).rejects.toThrow(TenantInexistenteError);
      } finally {
        await p.close();
      }
    });

    it("IE-4: sesión: crear, leer, reemplazar el token, revocar (dos veces no hace nada)", async () => {
      const p = await factory();
      try {
        const t = await p.tenants.ensureErpTenant({ erpTenantId: "t-a", name: "A" });
        const id = "a".repeat(64);
        await p.sessions.create({ id, tenantId: t.id, erpUserId: "u-ana", erpTenantId: "t-a", erpTokenEncrypted: "v1.x.y.z", createdAt: AHORA, expiresAt: VENCE });
        expect(await p.sessions.get(id)).toEqual({
          id,
          tenantId: t.id,
          erpUserId: "u-ana",
          erpTenantId: "t-a",
          erpTokenEncrypted: "v1.x.y.z",
          createdAt: AHORA,
          expiresAt: VENCE,
          revokedAt: null,
        });
        expect(await p.sessions.get("b".repeat(64))).toBeNull();

        expect(await p.sessions.replaceToken(t.id, id, "v1.nuevo")).toBe(true);
        expect((await p.sessions.get(id))?.erpTokenEncrypted).toBe("v1.nuevo");
        // Con otra carpintería no se toca.
        const otra = await p.tenants.ensureErpTenant({ erpTenantId: "t-b", name: "B" });
        expect(await p.sessions.replaceToken(otra.id, id, "v1.ajeno")).toBe(false);

        const revocada = new Date("2026-11-20T13:00:00.000Z");
        await p.sessions.revoke(id, revocada);
        await p.sessions.revoke(id, new Date("2026-11-20T14:00:00.000Z"));
        expect((await p.sessions.get(id))?.revokedAt).toEqual(revocada);
        expect(await p.sessions.replaceToken(t.id, id, "v1.tarde")).toBe(false);
        expect((await p.sessions.get(id))?.erpTokenEncrypted).toBe("v1.nuevo");
        // Una sesión con una carpintería inexistente no se crea.
        await expect(
          p.sessions.create({ id: "c".repeat(64), tenantId: "no-existe", erpUserId: "u", erpTenantId: "t", erpTokenEncrypted: "v1", createdAt: AHORA, expiresAt: VENCE }),
        ).rejects.toThrow(TenantInexistenteError);
      } finally {
        await p.close();
      }
    });

    it("IE-8: el sha256 de un zip se registra una vez por proyecto, documento y contenido; solo en su carpintería", async () => {
      const p = await factory();
      try {
        const a = await p.tenants.ensureErpTenant({ erpTenantId: "t-a", name: "A" });
        const b = await p.tenants.ensureErpTenant({ erpTenantId: "t-b", name: "B" });
        const proyecto = await p.projects.linkErpProject(a.id, { erpProjectId: "P-0002", name: "Proyecto" });
        const visto = { erpDocumentId: "D-0001", sha256: "f".repeat(64), bytes: 1234 };
        await p.erpDocuments.record(a.id, proyecto, visto);
        await p.erpDocuments.record(a.id, proyecto, visto);
        await p.erpDocuments.record(a.id, proyecto, { ...visto, sha256: "e".repeat(64) });
        expect(await p.erpDocuments.list(a.id, proyecto)).toEqual([visto, { ...visto, sha256: "e".repeat(64) }]);
        expect(await p.erpDocuments.list(b.id, proyecto)).toEqual([]);
        await expect(p.erpDocuments.record(b.id, proyecto, visto)).rejects.toThrow(ReferenciaDeOtroTenantError);
      } finally {
        await p.close();
      }
    });
  });
}
