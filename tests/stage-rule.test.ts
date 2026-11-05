import { describe, expect, it } from "vitest";
import { latestPerStage, paymentStatusOf, referenceDate, resolveVersion, type StageVersion } from "@/lib/stage-rule";

const V = (id: string, code: string, ord: number, from: string | null, no = 1): StageVersion => ({ id, stageCode: code, stageName: code, sortOrder: ord, versionNo: no, effectiveFrom: from });
const murni = V("m", "MURNI", 1, null), pergeseran = V("g", "PERGESERAN", 2, "2026-05-01"), perubahan = V("p", "PERUBAHAN", 3, "2026-09-01");
const all = [murni, pergeseran, perubahan];

describe("referenceDate: tanggal SPM/SP2D, bila belum ada tanggal transaksi", () => {
  it("sudah ada tanggal SPM/SP2D: itu yang dipakai", () => expect(referenceDate({ transactionDate: "2026-04-10", paymentDate: "2026-05-02" })).toEqual({ date: "2026-05-02", basis: "spm_sp2d" }));
  it("belum ada: tanggal transaksi", () => { expect(referenceDate({ transactionDate: "2026-04-10", paymentDate: null })).toEqual({ date: "2026-04-10", basis: "transaksi" }); expect(referenceDate({ transactionDate: "2026-04-10" })).toEqual({ date: "2026-04-10", basis: "transaksi" }); });
  it("status SPM/SP2D", () => { expect(paymentStatusOf({ paymentDate: "2026-01-01" })).toBe("sudah"); expect(paymentStatusOf({})).toBe("belum"); });
});
describe("resolveVersion: tahapan berlaku pada tanggal acuan", () => {
  it("sebelum Pergeseran = Murni (otomatis berlaku 1 Januari)", () => { expect(resolveVersion(all, 2026, "2026-01-01")?.id).toBe("m"); expect(resolveVersion(all, 2026, "2026-04-30")?.id).toBe("m"); });
  it("tepat pada tanggal mulai berlaku sudah termasuk tahapan baru", () => { expect(resolveVersion(all, 2026, "2026-05-01")?.id).toBe("g"); expect(resolveVersion(all, 2026, "2026-09-01")?.id).toBe("p"); });
  it("di antara tahapan", () => expect(resolveVersion(all, 2026, "2026-08-31")?.id).toBe("g"));
  it("akhir tahun mengikuti Perubahan", () => expect(resolveVersion(all, 2026, "2026-12-31")?.id).toBe("p"));
  it("Pergeseran tanpa tanggal memakai tanggal bawaan 16 Maret", () => expect(resolveVersion([murni, V("g", "PERGESERAN", 2, null)], 2026, "2026-07-01")?.id).toBe("g"));
  it("tahapan dengan kode tak dikenal dan tanpa tanggal tidak dipakai", () => expect(resolveVersion([murni, V("x", "LAINNYA", 2, null)], 2026, "2026-07-01")?.id).toBe("m"));
  it("hanya Murni: semua tanggal ke Murni", () => expect(resolveVersion([murni], 2026, "2026-11-11")?.id).toBe("m"));
  it("Pergeseran boleh jatuh setelah Perubahan (Pergeseran lanjutan)", () => {
    const g2 = V("g", "PERGESERAN", 2, "2026-10-15"); expect(resolveVersion([murni, perubahan, g2], 2026, "2026-10-20")?.id).toBe("g"); expect(resolveVersion([murni, perubahan, g2], 2026, "2026-10-01")?.id).toBe("p");
  });
  it("tanggal sama: tahapan dengan urutan lebih akhir menang", () => expect(resolveVersion([murni, V("g", "PERGESERAN", 2, "2026-06-01"), V("p", "PERUBAHAN", 3, "2026-06-01")], 2026, "2026-06-01")?.id).toBe("p"));
  it("Murni diatur setelah tanggal acuan: tidak ada tahapan", () => expect(resolveVersion([V("m", "MURNI", 1, "2026-02-01")], 2026, "2026-01-15")).toBeNull());
  it("memakai versi terbaru per tahapan", () => { const v2 = V("m2", "MURNI", 1, null, 2); expect(latestPerStage([murni, v2]).map((v) => v.id)).toEqual(["m2"]); expect(resolveVersion([murni, v2], 2026, "2026-02-02")?.id).toBe("m2"); });
});
describe("tanggal bawaan: Murni < 16 Mar, Pergeseran 16 Mar - 26 Okt, Perubahan 27 Okt - 31 Des 2026", () => {
  const D = [V("m", "MURNI", 1, null), V("g", "PERGESERAN", 2, null), V("p", "PERUBAHAN", 3, null)];
  const at = (d: string) => resolveVersion(D, 2026, d)?.id;
  it("Murni: 1 Jan s.d. 15 Mar", () => { expect(at("2026-01-01")).toBe("m"); expect(at("2026-03-15")).toBe("m"); });
  it("Pergeseran: 16 Mar s.d. 26 Okt", () => { expect(at("2026-03-16")).toBe("g"); expect(at("2026-07-17")).toBe("g"); expect(at("2026-10-26")).toBe("g"); });
  it("Perubahan: 27 Okt s.d. 31 Des", () => { expect(at("2026-10-27")).toBe("p"); expect(at("2026-12-31")).toBe("p"); });
  it("tanggal yang diatur admin didahulukan atas bawaan", () => expect(resolveVersion([V("m", "MURNI", 1, null), V("g", "PERGESERAN", 2, "2026-04-01")], 2026, "2026-03-20")?.id).toBe("m"));
});
