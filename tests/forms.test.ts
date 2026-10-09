import { describe, expect, it } from "vitest";
import { buildSchema, findMaster, MASTERS } from "@/lib/masters";
import { packageSchema } from "@/lib/packages";
describe("master schema", () => {
  it("menolak kode kosong dan enum tidak valid", () => {
    expect(buildSchema(findMaster("program")!).safeParse({ code: " ", name: "X" }).success).toBe(false);
    expect(buildSchema(findMaster("pejabat")!).safeParse({ official_type: "admin", name: "A", nip: "" }).success).toBe(false);
  });
  it("mengubah opsional kosong menjadi null dan checkbox menjadi boolean", () => {
    expect(buildSchema(findMaster("pejabat")!).parse({ official_type: "pptk", name: "A", nip: "" })).toEqual({ official_type: "pptk", name: "A", nip: null });
    expect(buildSchema(findMaster("metode")!).parse({ code: "X", name: "Y", is_swakelola: "on" }).is_swakelola).toBe(true);
  });
  it("hanya tabel dalam daftar putih", () => expect(MASTERS.map((m) => m.table)).not.toContain("user_roles"));
});
describe("packageSchema", () => {
  const base = { internal_code: "P-1", name: "ATK", pagu: "1.500.000", execution_mode: "penyedia", method_id: "", ppbj_id: "", ppk_id: "", pptk_id: "", assigned_date: "", due_date: "" };
  it("menerima paket valid", () => expect(packageSchema.parse(base).pagu).toBe("1500000.00"));
  it("menolak pagu tidak valid dan tenggat sebelum penugasan", () => {
    expect(packageSchema.safeParse({ ...base, pagu: "abc" }).success).toBe(false);
    expect(packageSchema.safeParse({ ...base, assigned_date: "2026-05-01", due_date: "2026-04-01" }).success).toBe(false);
  });
});
