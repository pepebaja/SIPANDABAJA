import { describe, expect, it } from "vitest";
import { can, canAssignRole } from "@/lib/rbac";
import { usernameToEmail, usernameSchema } from "@/lib/username";
import { decodeContext, encodeContext } from "@/lib/context";
describe("rbac", () => {
  it("viewer tidak dapat mengelola pengguna", () => expect(can(["viewer"], "users:manage")).toBe(false));
  it("admin_opd dapat mengelola pengguna", () => expect(can(["admin_opd"], "users:manage")).toBe(true));
  it("hanya super_admin menulis pengaturan", () => { expect(can(["admin_opd"], "settings:write")).toBe(false); expect(can(["super_admin"], "settings:write")).toBe(true); });
  it("admin_opd tidak dapat memberi role administratif", () => { expect(canAssignRole(["admin_opd"], "super_admin")).toBe(false); expect(canAssignRole(["admin_opd"], "ppbj")).toBe(true); });
});
describe("username", () => {
  it("tidak membedakan huruf besar-kecil", () => expect(usernameToEmail("Budi.PPBJ", "x.org")).toBe("budi.ppbj@x.org"));
  it("menolak karakter tidak sah", () => { expect(usernameSchema.safeParse("a b").success).toBe(false); expect(usernameSchema.safeParse("ab").success).toBe(false); });
});
describe("context", () => {
  const a = "11111111-1111-1111-1111-111111111111", b = "22222222-2222-2222-2222-222222222222";
  it("round-trip", () => expect(decodeContext(encodeContext(a, b))).toEqual({ yearId: a, stageId: b }));
  it("menolak nilai rusak", () => expect(decodeContext("x:y")).toBeNull());
});
