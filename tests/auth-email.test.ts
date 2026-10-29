import { describe, expect, it } from "vitest";
import { clientIp, resolveLogin, type AuthLookupClient } from "@/lib/server/auth-email";

const fake = (profile: { id: string; is_active: boolean } | null, email: string | null): AuthLookupClient => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }),
  auth: { admin: { getUserById: async () => ({ data: { user: email ? { email } : null } }) } },
});
describe("resolveLogin", () => {
  it("memakai email Auth asli milik profil, bukan tebakan username@domain", async () => {
    const r = await resolveLogin(fake({ id: "u1", is_active: true }, "admin@instansi.go.id"), "admin");
    expect(r).toEqual({ email: "admin@instansi.go.id", userId: "u1", active: true });
  });
  it("profil tidak ada -> email turunan sebagai cadangan, tanpa userId", async () => {
    const r = await resolveLogin(fake(null, null), "admin");
    expect(r.email.startsWith("admin@")).toBe(true); expect(r.userId).toBeNull(); expect(r.active).toBe(false);
  });
  it("profil ada tetapi akun Auth hilang -> cadangan, userId tetap tercatat", async () => {
    const r = await resolveLogin(fake({ id: "u2", is_active: false }, null), "budi.ppbj");
    expect(r.email.startsWith("budi.ppbj@")).toBe(true); expect(r.userId).toBe("u2"); expect(r.active).toBe(false);
  });
});
describe("clientIp", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  it("mengutamakan header Vercel yang tidak dapat dipalsukan", () => expect(clientIp(h({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4"));
  it("mengambil alamat pertama & unknown bila kosong", () => { expect(clientIp(h({ "x-forwarded-for": "5.5.5.5, 6.6.6.6" }))).toBe("5.5.5.5"); expect(clientIp(h({}))).toBe("unknown"); });
});
