import { describe, expect, it } from "vitest";
import { REPORTS, findReport, formatCell } from "@/lib/report-types";
import { actionLabel, auditSummary, tableLabel } from "@/lib/audit-labels";
import { printProfileSchema } from "@/lib/settings";
import { fmtDate, todayIso } from "@/lib/date";
import { can } from "@/lib/rbac";

describe("format sel laporan", () => {
  it("uang memakai pemisah Indonesia tanpa Rp", () => { expect(formatCell("money", "1500000.00")).toBe("1.500.000,00"); expect(formatCell("money", "-250.50")).toContain("250,50"); });
  it("persen memakai koma", () => expect(formatCell("percent", "12.34")).toBe("12,34%"));
  it("kosong menjadi strip", () => { expect(formatCell("text", null)).toBe("-"); expect(formatCell("money", "")).toBe("-"); });
  it("bilangan bulat", () => expect(formatCell("int", 1234)).toBe("1.234"));
});
describe("daftar laporan", () => {
  it("slug unik dan dapat ditemukan", () => { const s = REPORTS.map((r) => r.slug); expect(new Set(s).size).toBe(s.length); s.forEach((x) => expect(findReport(x)).toBeTruthy()); expect(findReport("tidak-ada")).toBeUndefined(); });
  it("laporan sensitif dibatasi izin", () => {
    const need = (slug: string) => findReport(slug)!.permission;
    expect(need("pengguna")).toBe("users:read"); expect(need("log-audit")).toBe("audit:read");
    expect(can(["viewer"], "audit:read")).toBe(false); expect(can(["auditor"], "audit:read")).toBe(true);
  });
});
describe("log audit", () => {
  it("label dikenal dan cadangan", () => { expect(actionLabel("USER_CREATE")).toBe("Buat akun"); expect(actionLabel("X")).toBe("X"); expect(tableLabel("transactions")).toBe("Transaksi"); expect(tableLabel("zzz")).toBe("zzz"); });
  it("ringkasan tidak memuat NIP", () => { const s = auditSummary({ new_data: { username: "budi", full_name: "Budi S", nip: "199001012020011001" } }); expect(s).toContain("budi"); expect(s).not.toContain("1990"); });
  it("ringkasan dipotong dan aman bila kosong", () => { expect(auditSummary({})).toBe("-"); expect(auditSummary({ new_data: { description: "x".repeat(100) } }).length).toBeLessThanOrEqual(60); });
});
describe("pengaturan cetak", () => {
  const ok = { org_name: "Dinas Contoh", address: "", city: "Banjarmasin", head_title: "Kepala", head_name: "Siti", head_nip: "" };
  it("valid", () => expect(printProfileSchema.safeParse(ok).success).toBe(true));
  it("nama OPD wajib", () => expect(printProfileSchema.safeParse({ ...ok, org_name: "ab" }).success).toBe(false));
  it("NIP 18 digit atau kosong", () => { expect(printProfileSchema.safeParse({ ...ok, head_nip: "1990 0101 2020 0110 01" }).data?.head_nip).toBe("199001012020011001"); expect(printProfileSchema.safeParse({ ...ok, head_nip: "12" }).success).toBe(false); });
});
describe("tanggal", () => {
  it("format dd/mm/yyyy", () => { expect(fmtDate("2026-10-09")).toBe("09/10/2026"); expect(fmtDate("2026-10-09T10:00:00Z")).toBe("09/10/2026"); expect(fmtDate(null)).toBe("-"); });
  it("todayIso berformat ISO", () => expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
});
