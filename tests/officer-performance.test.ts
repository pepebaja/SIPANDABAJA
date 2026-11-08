import { describe, expect, it } from "vitest";
import { buildPerformance, progressOf, type PerfPackage } from "@/lib/officer-performance";
const P = (o: Partial<PerfPackage>): PerfPackage => ({ id: "x", code: "K", name: "N", officer: "A", pagu: "100.00", status: "RENCANA", statusName: "Rencana", group: null, due: null, handover: null, start: null, end: null, obstacle: null, contract: null, ...o });
describe("progressOf", () => {
  it("memetakan status", () => { expect(progressOf({ status: "SELESAI", group: "selesai" })).toBe("selesai"); expect(progressOf({ status: "PEMILIHAN", group: "diproses" })).toBe("diproses"); expect(progressOf({ status: "BATAL", group: null })).toBe("batalTunda"); expect(progressOf({ status: "REVIU", group: null })).toBe("persiapan"); });
});
describe("buildPerformance", () => {
  const r = buildPerformance([
    P({ id: "1", status: "SELESAI", group: "selesai", pagu: "100.00", contract: "90.00", due: "2026-05-10", handover: "2026-05-09", start: "2026-04-01", end: "2026-04-11" }),
    P({ id: "2", status: "SELESAI", group: "selesai", pagu: "50.00", contract: "50.00", due: "2026-05-10", handover: "2026-05-20" }),
    P({ id: "3", status: "PEMILIHAN", group: "diproses", due: "2026-06-01", obstacle: "Dokumen" }),
    P({ id: "4", status: "BATAL", officer: null }),
  ], "2026-07-01");
  it("rekap per pejabat", () => { const a = r.officers.find((o) => o.officer === "A")!; expect(a.total).toBe(3); expect(a.selesai).toBe(2); expect(a.pagu).toBe("250.00"); expect(a.contract).toBe("140.00"); expect(a.saving).toBe("10.00"); expect(a.onTime).toBe(1); expect(a.late).toBe(1); expect(a.avgDays).toBe(10); expect(a.overdue).toBe(1); });
  it("tanpa pejabat dikelompokkan", () => expect(r.officers.some((o) => o.officer === "(Belum ditetapkan)")).toBe(true));
  it("total, kendala, terlambat", () => { expect(r.all.total).toBe(4); expect(r.obstacles).toEqual([{ name: "Dokumen", n: 1 }]); expect(r.overdue.map((p) => p.id)).toEqual(["3"]); });
});

import { packageCreateSchema, modeOfMethod } from "@/lib/packages";
describe("packageCreateSchema (kode paket = kode RUP)", () => {
  it("membersihkan spasi dan .0 pada kode RUP", () => expect(packageCreateSchema.parse({ rup_code: " 1234 5678.0 ", ppbj_id: "", ppk_id: "", pptk_id: "", due_date: "" }).rup_code).toBe("12345678"));
  it("kode RUP wajib", () => expect(packageCreateSchema.safeParse({ rup_code: "  ", ppbj_id: "", ppk_id: "", pptk_id: "", due_date: "" }).success).toBe(false));
  it("swakelola dikenali dari nama metode", () => { expect(modeOfMethod("Swakelola Tipe I")).toBe("swakelola"); expect(modeOfMethod("E-purchasing")).toBe("penyedia"); expect(modeOfMethod(null)).toBe("penyedia"); });
});
