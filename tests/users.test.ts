import { describe, expect, it } from "vitest";
import { assignableRoles, canManageTarget } from "@/lib/rbac";
import { createUserSchema, generatePassword, passwordIssues, resetPasswordSchema, updateUserSchema } from "@/lib/users";
import { newUsernameSchema } from "@/lib/username";
const base = { username: "budi.santoso", full_name: "Budi Santoso", nip: "", role: "ppbj", password: "Rahasia2026x", confirm: "Rahasia2026x" };
describe("username baru", () => {
  it("menerima format wajar", () => expect(newUsernameSchema.safeParse("Budi.Santoso").data).toBe("budi.santoso"));
  it.each(["ab", "_budi", "budi_", "bu..di", "bu di", "budi@mail.com", "a".repeat(33)])("menolak %s", (v) => expect(newUsernameSchema.safeParse(v).success).toBe(false));
});
describe("password", () => {
  it("menolak password lemah", () => { expect(passwordIssues("abc").length).toBeGreaterThan(2); expect(passwordIssues("Password12345")).toContain("tidak memakai kata umum yang mudah ditebak"); });
  it("menerima password kuat", () => expect(passwordIssues("Rahasia2026x")).toEqual([]));
  it("menolak password memuat username", () => expect(createUserSchema.safeParse({ ...base, password: "Budi.Santoso9X", confirm: "Budi.Santoso9X" }).success).toBe(false));
  it("generator selalu memenuhi kebijakan", () => { for (let i = 0; i < 200; i++) expect(passwordIssues(generatePassword())).toEqual([]); });
});
describe("skema pengguna", () => {
  it("valid", () => expect(createUserSchema.safeParse(base).success).toBe(true));
  it("konfirmasi harus sama", () => expect(createUserSchema.safeParse({ ...base, confirm: "x" }).success).toBe(false));
  it("NIP 18 digit atau kosong", () => { expect(createUserSchema.safeParse({ ...base, nip: "1990 0101 2020 0110 01" }).data?.nip).toBe("199001012020011001"); expect(createUserSchema.safeParse({ ...base, nip: "123" }).success).toBe(false); expect(createUserSchema.safeParse(base).data?.nip).toBeNull(); });
  it("peran tidak dikenal ditolak", () => expect(createUserSchema.safeParse({ ...base, role: "root" }).success).toBe(false));
  it("reset & ubah", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(resetPasswordSchema.safeParse({ id, password: "Rahasia2026x", confirm: "Rahasia2026x" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ id, full_name: "Budi", nip: "", role: "viewer" }).success).toBe(true);
  });
});
describe("kewenangan target", () => {
  it("super_admin mengelola semua", () => expect(canManageTarget(["super_admin"], ["super_admin"])).toBe(true));
  it("admin_opd tidak mengelola admin", () => { expect(canManageTarget(["admin_opd"], ["super_admin"])).toBe(false); expect(canManageTarget(["admin_opd"], ["admin_opd"])).toBe(false); expect(canManageTarget(["admin_opd"], ["ppk"])).toBe(true); });
  it("peran lain tidak mengelola", () => expect(canManageTarget(["ppbj"], ["viewer"])).toBe(false));
  it("peran yang dapat diberikan", () => { expect(assignableRoles(["admin_opd"])).not.toContain("super_admin"); expect(assignableRoles(["super_admin"])).toHaveLength(7); });
});
