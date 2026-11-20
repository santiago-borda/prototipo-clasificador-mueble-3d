// IE-2, IE-9, IE-10 y TIE-18 (con PB-6 a PB-8): batería de contrato de los repositorios de la integración con el ERP
// (docs/spec-integracion-erp-minima.md v0.3). Igual que contract.ts: una sola batería contra memoria y PostgreSQL.

import { describe, expect, it } from "vitest";
import { ReferenciaDeOtroTenantError, TenantInexistenteError, TenantRequeridoError, TrabajoSinCausaError, type NewJob, type Persistence } from "@/persistence/ports";
import type { PersistenceFactory } from "./contract";

const T_A = "5e1a0000-0000-4000-8000-0000000c0001";
const T_B = "5e1a0000-0000-4000-8000-0000000c0002";
const P_UUID = "5e1a0000-0000-4000-8000-000000000142";
const SHA = (c: string) => c.repeat(64);

/** Un reloj que avanza un segundo por llamada: el orden de creación queda claro también en SQL. */
function reloj() {
  let t = Date.parse("2026-11-20T12:00:00.000Z");
  return () => new Date((t += 1000));
}

const trabajo = (projectId: string, extra: Partial<NewJob> = {}): NewJob => ({
  envioUuid: "7f6d0000-0000-4000-8000-000000000001",
  projectId,
  status: "success",
  message: "Modelo y CSV recibidos y verificados.",
  model: { sha256: SHA("a"), version: 3, name: "olmo.zip" },
  csv: { sha256: SHA("b"), version: 1, name: "piezas.csv" },
  ...extra,
});

async function conDos(p: Persistence) {
  const a = await p.tenants.ensureErpTenant({ erpTenantId: T_A, name: "A" });
  const b = await p.tenants.ensureErpTenant({ erpTenantId: T_B, name: "B" });
  return { a, b };
}

export function erpContract(label: string, factory: PersistenceFactory): void {
  describe(`contrato de la integración con el ERP: ${label}`, () => {
    const abrir = () => factory({ now: reloj() });

    it("IE-9: ensureErpTenant crea la carpintería una vez por erpTenantId; findErpTenant no crea", async () => {
      const p = await abrir();
      try {
        expect(await p.tenants.findErpTenant(T_A)).toBeNull();
        const a = await p.tenants.ensureErpTenant({ erpTenantId: T_A, name: "Casa Mueble" });
        const a2 = await p.tenants.ensureErpTenant({ erpTenantId: T_A, name: "Otro nombre" });
        expect(a2).toEqual(a);
        expect(await p.tenants.findErpTenant(T_A)).toEqual(a);
        expect(await p.tenants.findErpTenant(T_B)).toBeNull();
        await expect(p.tenants.ensureErpTenant({ erpTenantId: "", name: "x" })).rejects.toThrow(TenantRequeridoError);
      } finally {
        await p.close();
      }
    });

    it("IE-9: upsertErpProject crea una vez por carpintería y actualiza código, nombre y fecha; otra carpintería es otro proyecto", async () => {
      const p = await abrir();
      try {
        const { a, b } = await conDos(p);
        const id = await p.projects.upsertErpProject(a.id, { erpProjectId: P_UUID, code: "P-0142", name: "Cocina", deliveryDate: "2026-12-15" });
        const id2 = await p.projects.upsertErpProject(a.id, { erpProjectId: P_UUID, code: "P-0142", name: "Cocina integral", deliveryDate: null });
        expect(id2).toBe(id);
        expect(await p.projects.getErpProject(a.id, P_UUID)).toEqual({ id, erpProjectId: P_UUID, code: "P-0142", name: "Cocina integral", deliveryDate: null });
        const enB = await p.projects.upsertErpProject(b.id, { erpProjectId: P_UUID, code: "P-9", name: "Otra", deliveryDate: null });
        expect(enB).not.toBe(id);
        // TIE-18 / PB-6: cada carpintería ve solo los suyos.
        expect((await p.projects.listErpProjects(a.id)).map((x) => x.name)).toEqual(["Cocina integral"]);
        expect((await p.projects.listErpProjects(b.id)).map((x) => x.name)).toEqual(["Otra"]);
        await expect(p.projects.upsertErpProject("no-existe", { erpProjectId: P_UUID, code: "x", name: "x", deliveryDate: null })).rejects.toThrow(TenantInexistenteError);
      } finally {
        await p.close();
      }
    });

    it("IE-2: sesión sin token del ERP; extend corre el vencimiento; revocar es idempotente y extend ya no anda", async () => {
      const p = await abrir();
      try {
        const { a } = await conDos(p);
        const creada = new Date("2026-11-20T12:00:00.000Z");
        const vence = new Date("2026-11-20T12:15:00.000Z");
        await p.sessions.create({ id: "h".repeat(64), tenantId: a.id, erpUserId: "u-1", erpTenantId: T_A, createdAt: creada, expiresAt: vence });
        const s = await p.sessions.get("h".repeat(64));
        expect(s).toEqual({ id: "h".repeat(64), tenantId: a.id, erpUserId: "u-1", erpTenantId: T_A, createdAt: creada, expiresAt: vence, revokedAt: null });
        expect(Object.keys(s!).sort()).toEqual(["createdAt", "erpTenantId", "erpUserId", "expiresAt", "id", "revokedAt", "tenantId"]);
        const nuevo = new Date("2026-11-20T12:30:00.000Z");
        expect(await p.sessions.extend(a.id, "h".repeat(64), nuevo)).toBe(true);
        expect((await p.sessions.get("h".repeat(64)))?.expiresAt).toEqual(nuevo);
        // PB-7: con el tenant equivocado no toca nada.
        expect(await p.sessions.extend("otro", "h".repeat(64), creada)).toBe(false);
        const revocada = new Date("2026-11-20T12:20:00.000Z");
        await p.sessions.revoke("h".repeat(64), revocada);
        await p.sessions.revoke("h".repeat(64), new Date("2026-11-20T13:00:00.000Z"));
        expect((await p.sessions.get("h".repeat(64)))?.revokedAt).toEqual(revocada);
        expect(await p.sessions.extend(a.id, "h".repeat(64), nuevo)).toBe(false);
        expect(await p.sessions.get("x".repeat(64))).toBeNull();
      } finally {
        await p.close();
      }
    });

    it("IE-7 / IE-9: jobs.create es idempotente por (carpintería, envioUuid); otra carpintería con el mismo envioUuid es otro trabajo", async () => {
      const p = await abrir();
      try {
        const { a, b } = await conDos(p);
        const pa = await p.projects.upsertErpProject(a.id, { erpProjectId: P_UUID, code: "P-1", name: "A", deliveryDate: null });
        const pb = await p.projects.upsertErpProject(b.id, { erpProjectId: P_UUID, code: "P-1", name: "B", deliveryDate: null });
        const uno = await p.jobs.create(a.id, trabajo(pa, { id: "11111111-0000-4000-8000-000000000001" }));
        expect(uno.created).toBe(true);
        expect(uno.job).toMatchObject({ id: "11111111-0000-4000-8000-000000000001", status: "success", model: { version: 3, name: "olmo.zip" } });
        const otraVez = await p.jobs.create(a.id, trabajo(pa, { id: "22222222-0000-4000-8000-000000000002", status: "failed", message: "x" }));
        expect(otraVez).toEqual({ job: uno.job, created: false });
        const enB = await p.jobs.create(b.id, trabajo(pb, { id: "33333333-0000-4000-8000-000000000003" }));
        expect(enB.created).toBe(true);
        expect(await p.jobs.findByEnvio(a.id, uno.job.envioUuid)).toEqual(uno.job);
        expect(await p.jobs.get(a.id, uno.job.id)).toEqual(uno.job);
        // TIE-17 / PB-7: el trabajo de una carpintería no se lee desde otra.
        expect(await p.jobs.get(b.id, uno.job.id)).toBeNull();
        expect(await p.jobs.get(a.id, enB.job.id)).toBeNull();
      } finally {
        await p.close();
      }
    });

    it("failed sin mensaje: TrabajoSinCausaError; proyecto de otra carpintería: ReferenciaDeOtroTenantError", async () => {
      const p = await abrir();
      try {
        const { a, b } = await conDos(p);
        const pa = await p.projects.upsertErpProject(a.id, { erpProjectId: P_UUID, code: "P-1", name: "A", deliveryDate: null });
        await expect(p.jobs.create(a.id, trabajo(pa, { status: "failed", message: null }))).rejects.toThrow(TrabajoSinCausaError);
        await expect(p.jobs.create(a.id, trabajo(pa, { status: "failed", message: "  " }))).rejects.toThrow(TrabajoSinCausaError);
        await expect(p.jobs.create(b.id, trabajo(pa))).rejects.toThrow(ReferenciaDeOtroTenantError);
      } finally {
        await p.close();
      }
    });

    it("latestForProject: el último creado, o el último con un estado", async () => {
      const p = await abrir();
      try {
        const { a } = await conDos(p);
        const pa = await p.projects.upsertErpProject(a.id, { erpProjectId: P_UUID, code: "P-1", name: "A", deliveryDate: null });
        expect(await p.jobs.latestForProject(a.id, pa)).toBeNull();
        const ok = await p.jobs.create(a.id, trabajo(pa, { id: "11111111-0000-4000-8000-00000000000a", envioUuid: "7f6d0000-0000-4000-8000-00000000000a" }));
        const mal = await p.jobs.create(a.id, trabajo(pa, { id: "11111111-0000-4000-8000-00000000000b", envioUuid: "7f6d0000-0000-4000-8000-00000000000b", status: "failed", message: "sha256" }));
        expect((await p.jobs.latestForProject(a.id, pa))?.id).toBe(mal.job.id);
        expect((await p.jobs.latestForProject(a.id, pa, "success"))?.id).toBe(ok.job.id);
        expect(await p.jobs.latestForProject(a.id, pa, "inProgress")).toBeNull();
      } finally {
        await p.close();
      }
    });

    it("IE-10: el almacén guarda por (carpintería, sha256), es idempotente y una carpintería no lee los archivos de otra", async () => {
      const p = await abrir();
      try {
        const { a, b } = await conDos(p);
        const datos = new Uint8Array([0, 1, 2, 250, 255]);
        await p.almacen.guardar(a.id, SHA("c"), datos);
        await p.almacen.guardar(a.id, SHA("c"), datos);
        expect(await p.almacen.leer(a.id, SHA("c"))).toEqual(datos);
        expect(await p.almacen.leer(b.id, SHA("c"))).toBeNull();
        expect(await p.almacen.leer(a.id, SHA("d"))).toBeNull();
        // Lo leído es una copia: modificarlo no cambia lo guardado.
        const leido = (await p.almacen.leer(a.id, SHA("c")))!;
        leido[0] = 99;
        expect((await p.almacen.leer(a.id, SHA("c")))![0]).toBe(0);
        await expect(p.almacen.guardar("no-existe", SHA("e"), datos)).rejects.toThrow(TenantInexistenteError);
      } finally {
        await p.close();
      }
    });
  });
}
