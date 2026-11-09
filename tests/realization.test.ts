import { describe, expect, it } from "vitest";
import { derive, totals } from "@/lib/realization";
const row = (pagu: string, verified: string, unverified = "0.00") => ({ pagu, verified, unverified, txCount: 1, unverifiedCount: 0 });
describe("realisasi", () => {
  it("sisa dan persentase dari terverifikasi saja", () => { const d = derive(row("1000.00", "250.00", "300.00")); expect(d.remaining).toBe("750.00"); expect(d.percent).toBe("25.00"); expect(d.overPagu).toBe(false); });
  it("N/A bila pagu nol", () => expect(derive(row("0.00", "0.00")).percent).toBeNull());
  it("menandai melampaui pagu termasuk yang belum diverifikasi", () => expect(derive(row("100.00", "60.00", "50.00")).overPagu).toBe(true));
  it("total tanpa pembulatan sebelum agregasi", () => { const t = totals([row("0.10", "0.10"), row("0.20", "0.20")]); expect(t.pagu).toBe("0.30"); expect(t.verified).toBe("0.30"); expect(t.percent).toBe("100.00"); });
  it("koreksi negatif mengurangi realisasi", () => expect(derive(row("1000.00", "400.00")).remaining).toBe("600.00"));
});
import { fillMonths } from "@/lib/dashboard";
describe("dashboard", () => it("mengisi 12 bulan dengan 0 untuk bulan kosong", () => { const r = fillMonths([{ month: 3, verified: 500 }]); expect(r).toHaveLength(12); expect(r[2]).toEqual({ bulan: "Mar", realisasi: 500 }); expect(r[0]?.realisasi).toBe(0); }));

import { rankMethods } from "@/lib/dashboard";
import { applyTxFilter, hasTxFilter, parseTxFilter, txFilterParams } from "@/lib/realization-filter";
describe("peringkat metode pemilihan", () => {
  const r = (name: string, pkg: number, real: string, tx = 1) => ({ method_id: null, method_name: name, pkg_count: pkg, tx_count: tx, realized: real });
  it("urut realisasi tertinggi ke terendah dengan peringkat", () => {
    const x = rankMethods([r("Tender", 2, "100.00"), r("Penunjukan Langsung", 5, "300.00"), r("E-Purchasing", 9, "600.00")]);
    expect(x.map((m) => [m.rank, m.name])).toEqual([[1, "E-Purchasing"], [2, "Penunjukan Langsung"], [3, "Tender"]]);
    expect(x[0]?.share).toBe(60); expect(x[2]?.share).toBe(10);
  });
  it("seri realisasi: peringkat sama, paket terbanyak lebih dulu; metode tanpa realisasi di bawah", () => {
    const x = rankMethods([r("A", 1, "50.00"), r("B", 4, "50.00"), r("C", 7, "0")]);
    expect(x.map((m) => [m.rank, m.name])).toEqual([[1, "B"], [1, "A"], [3, "C"]]);
    expect(x[2]?.share).toBe(0); expect(x[2]?.realized).toBe("0.00");
  });
  it("tanpa data / nilai desimal dari database", () => {
    expect(rankMethods([])).toEqual([]);
    expect(rankMethods([r("A", 1, "1234.5")])[0]?.realized).toBe("1234.50");
  });
});
describe("filter daftar transaksi", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("membuang nilai tidak sah dan membaca yang sah", () => {
    const f = parseTxFilter({ program: "x", kegiatan: id, sub: "' or 1=1", dari: "2026-02-30", sampai: "2026-03-31", basis: "spm", pay: "zzz", cek: "tanpa_tgl" });
    expect(f).toMatchObject({ program: "", kegiatan: id, sub: "", from: "", to: "2026-03-31", basis: "spm", pay: "", cek: "tanpa_tgl", dateError: false });
  });
  it("tanggal awal setelah tanggal akhir ditandai dan diabaikan", () => {
    const f = parseTxFilter({ dari: "2026-05-01", sampai: "2026-04-01" }); expect(f.dateError).toBe(true); expect(f.from).toBe(""); expect(f.to).toBe("");
  });
  it("parameter URL hanya memuat yang terisi; basis ikut hanya bila ada tanggal", () => {
    expect(hasTxFilter(parseTxFilter({}))).toBe(false);
    expect(txFilterParams(parseTxFilter({ basis: "spm", cek: "koreksi" }))).toEqual({ cek: "koreksi" });
    expect(txFilterParams(parseTxFilter({ basis: "spm", dari: "2026-01-01" }))).toEqual({ dari: "2026-01-01", basis: "spm" });
  });
  it("kueri: sub kegiatan paling spesifik; kolom tanggal mengikuti basis", () => {
    const calls: string[] = []; const q: any = new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => { calls.push(`${k}:${a.join(",")}`); return q; } });
    applyTxFilter(q, parseTxFilter({ program: id, kegiatan: id, sub: id, basis: "spm", dari: "2026-01-01", sampai: "2026-02-01", cek: "tanpa_no" }));
    expect(calls).toEqual([`eq:budget_entries.subactivity_id,${id}`, "gte:payment_date,2026-01-01", "lte:payment_date,2026-02-01", "not:payment_date,is,", "is:payment_number,"]);
  });
});
import { applyScopeFilter, hasScopeFilter } from "@/lib/realization-filter";
describe("cakupan filter rekening", () => {
  it("jalur relasi sesuai tingkat tanpa awalan", () => {
    const id = "11111111-2222-3333-4444-555555555555", c: string[] = []; const q: any = new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => { c.push(`${k}:${a.join(",")}`); return q; } });
    applyScopeFilter(q, parseTxFilter({ program: id }));
    expect(c).toEqual([`eq:subactivities.activities.program_id,${id}`]); expect(hasScopeFilter(parseTxFilter({ cek: "koreksi" }))).toBe(false);
  });
});
