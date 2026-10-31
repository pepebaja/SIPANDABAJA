import { describe, expect, it } from "vitest";
import { latestPerStage, paymentStatusOf, referenceDate, resolveVersion, type StageVersion } from "@/lib/stage-rule";

const V = (id: string, code: string, ord: number, from: string | null, no = 1): StageVersion => ({ id, stageCode: code, stageName: code, sortOrder: ord, versionNo: no, effectiveFrom: from });
const murni = V("m", "MURNI", 1, null), pergeseran = V("g", "PERGESERAN", 2, "2026-05-01"), perubahan = V("p", "PERUBAHAN", 3, "2026-09-01");
const all = [murni, pergeseran, perubahan];

describe("referenceDate: SP2D > SPM > tanggal transaksi", () => {
  it("sudah cair memakai SP2D", () => expect(referenceDate({ transactionDate: "2026-04-10", spmDate: "2026-04-20", sp2dDate: "2026-05-02" })).toEqual({ date: "2026-05-02", basis: "sp2d" }));
  it("SPM saja memakai SPM", () => expect(referenceDate({ transactionDate: "2026-04-10", spmDate: "2026-04-20" })).toEqual({ date: "2026-04-20", basis: "spm" }));
  it("belum diajukan memakai tanggal transaksi", () => expect(referenceDate({ transactionDate: "2026-04-10", spmDate: null, sp2dDate: null })).toEqual({ date: "2026-04-10", basis: "transaksi" }));
  it("status pencairan", () => { expect(paymentStatusOf({ sp2dDate: "2026-01-01" })).toBe("cair"); expect(paymentStatusOf({ spmDate: "2026-01-01" })).toBe("spm"); expect(paymentStatusOf({})).toBe("belum"); });
});
describe("resolveVersion: tahapan berlaku pada tanggal acuan", () => {
  it("sebelum Pergeseran = Murni (otomatis berlaku 1 Januari)", () => { expect(resolveVersion(all, 2026, "2026-01-01")?.id).toBe("m"); expect(resolveVersion(all, 2026, "2026-04-30")?.id).toBe("m"); });
  it("tepat pada tanggal mulai berlaku sudah termasuk tahapan baru", () => { expect(resolveVersion(all, 2026, "2026-05-01")?.id).toBe("g"); expect(resolveVersion(all, 2026, "2026-09-01")?.id).toBe("p"); });
  it("di antara tahapan", () => expect(resolveVersion(all, 2026, "2026-08-31")?.id).toBe("g"));
  it("akhir tahun mengikuti Perubahan", () => expect(resolveVersion(all, 2026, "2026-12-31")?.id).toBe("p"));
  it("Pergeseran tanpa tanggal tidak dipakai", () => expect(resolveVersion([murni, V("g", "PERGESERAN", 2, null)], 2026, "2026-07-01")?.id).toBe("m"));
  it("hanya Murni: semua tanggal ke Murni", () => expect(resolveVersion([murni], 2026, "2026-11-11")?.id).toBe("m"));
  it("Pergeseran boleh jatuh setelah Perubahan (Pergeseran lanjutan)", () => {
    const g2 = V("g", "PERGESERAN", 2, "2026-10-15"); expect(resolveVersion([murni, perubahan, g2], 2026, "2026-10-20")?.id).toBe("g"); expect(resolveVersion([murni, perubahan, g2], 2026, "2026-10-01")?.id).toBe("p");
  });
  it("tanggal sama: tahapan dengan urutan lebih akhir menang", () => expect(resolveVersion([murni, V("g", "PERGESERAN", 2, "2026-06-01"), V("p", "PERUBAHAN", 3, "2026-06-01")], 2026, "2026-06-01")?.id).toBe("p"));
  it("Murni diatur setelah tanggal acuan: tidak ada tahapan", () => expect(resolveVersion([V("m", "MURNI", 1, "2026-02-01")], 2026, "2026-01-15")).toBeNull());
  it("memakai versi terbaru per tahapan", () => { const v2 = V("m2", "MURNI", 1, null, 2); expect(latestPerStage([murni, v2]).map((v) => v.id)).toEqual(["m2"]); expect(resolveVersion([murni, v2], 2026, "2026-02-02")?.id).toBe("m2"); });
});
