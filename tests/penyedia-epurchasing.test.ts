import { describe, expect, it } from "vitest";
import { summarizeProviders } from "@/lib/provider-report";
import { analyzeEpurchasing, isEPurchasing, narrateEpurchasing, type EpItem } from "@/lib/epurchasing-analysis";
import { checkTransactionInput, payDateOutOfYear } from "@/lib/realization-checks";

describe("penyedia pelaksana pekerjaan", () => {
  const tx = (providerId: string, code: string | null, amount: string, paid = true, methodName: string | null = "E-purchasing") => ({ providerId, providerName: providerId.toUpperCase(), code, rupName: code ? `Paket ${code}` : null, pagu: code ? "1000.00" : null, methodName, amount, paid });
  it("menghitung paket unik per penyedia dan mengurutkan dari paket terbanyak", () => {
    const r = summarizeProviders([tx("a", "111", "100.00"), tx("a", "111", "50.00"), tx("a", "222", "10.00", false), tx("b", "333", "900.00"), tx("a", null, "5.00")], []);
    expect(r.map((x) => [x.id, x.packageCount, x.txCount, x.txNoCode])).toEqual([["a", 2, 4, 1], ["b", 1, 1, 0]]);
    expect(r[0]?.realized).toBe("155.00");                       // 100 + 50 + 5 (bertanggal SPM/SP2D); 10 belum diakui
    expect(r[0]?.packages.find((k) => k.code === "111")?.realized).toBe("150.00");
  });
  it("kontrak menambah paket penyedia tanpa menggandakan kode yang sama", () => {
    const r = summarizeProviders([tx("a", "111", "100.00")], [{ providerId: "a", providerName: "A", code: "111", name: "Paket 111", pagu: "1000.00", value: "900.00" }, { providerId: "a", providerName: "A", code: "444", name: "Paket 444", pagu: "500.00", value: "450.00" }]);
    expect(r[0]?.packageCount).toBe(2); expect(r[0]?.contract).toBe("1350.00");
  });
  it("tanpa data menghasilkan daftar kosong", () => expect(summarizeProviders([], [])).toEqual([]));
});

describe("analisis e-purchasing", () => {
  const it0 = (o: Partial<EpItem>): EpItem => ({ code: "1", name: "P", officer: "X", hasPackage: true, cancelled: false, methodName: "E-purchasing", isEp: true, plannedName: "E-purchasing", plannedIsEp: true, pagu: "1000.00", contract: null, realized: "0.00", ...o });
  const data: EpItem[] = [
    it0({ code: "1", pagu: "1000.00", contract: "900.00", realized: "900.00" }),
    it0({ code: "2", pagu: "3000.00", realized: "0.00" }),
    it0({ code: "3", methodName: "Pengadaan Langsung", isEp: false, plannedName: "E-purchasing", plannedIsEp: true, pagu: "6000.00", contract: "5500.00", realized: "3000.00" }),
    it0({ code: "4", methodName: "Tender", isEp: false, plannedName: "Tender", plannedIsEp: false, pagu: "10000.00", realized: "1000.00" }),
    it0({ code: "5", methodName: "Tender", isEp: false, plannedName: "Tender", plannedIsEp: false, pagu: "999.00", cancelled: true }),
    it0({ code: "6", hasPackage: false, methodName: "E-purchasing", isEp: true, plannedName: "E-purchasing", plannedIsEp: true, pagu: "2000.00" }),
  ];
  it("mengenali e-purchasing dari kode atau nama metode", () => {
    expect(isEPurchasing({ code: "EPURCHASING", name: "apa saja" })).toBe(true);
    for (const n of ["E-purchasing", "e purchasing", "E-Katalog", "Katalog Elektronik"]) expect(isEPurchasing({ name: n })).toBe(true);
    expect(isEPurchasing({ code: "PL", name: "Pengadaan Langsung" })).toBe(false);
  });
  const a = analyzeEpurchasing(data);
  it("membandingkan e-purchasing dengan metode lain dan mengabaikan paket batal/tunda", () => {
    expect(a.cancelled).toBe(1); expect(a.total.items).toBe(5);
    expect(a.ep).toMatchObject({ items: 3, packages: 2, pagu: "6000.00", realized: "900.00", contract: "900.00", contractPagu: "1000.00", saving: "100.00" });
    expect(a.ep.absorption).toBe("15.00"); expect(a.ep.sharePkg).toBe("60.00"); expect(a.ep.sharePagu).toBe("27.27");
    expect(a.others).toMatchObject({ items: 2, pagu: "16000.00", realized: "4000.00" }); expect(a.others.absorption).toBe("25.00");
    expect(a.methods.map((m) => m.name)).toEqual(["Tender", "E-purchasing", "Pengadaan Langsung"]);
  });
  it("membandingkan rencana RUP dengan pelaksanaan", () => {
    expect(a.plan).toEqual({ plannedEp: 4, actualEp: 2, stayed: 2, toOther: 1, fromOther: 0 });
  });
  it("narasi otomatis dan kasus tanpa e-purchasing", () => {
    expect(narrateEpurchasing(a).length).toBeGreaterThanOrEqual(3);
    expect(narrateEpurchasing(analyzeEpurchasing([it0({ methodName: "Tender", isEp: false })]))[0]).toMatch(/Belum ada paket/);
    expect(narrateEpurchasing(analyzeEpurchasing([]))[0]).toMatch(/Belum ada paket RUP/);
  });
});

describe("pemeriksaan isian realisasi", () => {
  const base = { year: 2026, date: "2026-05-10", payDate: "", hasRup: true, hasMethod: true, hasProvider: true, hasNewProvider: false };
  it("isian lengkap tidak menghasilkan peringatan", () => expect(checkTransactionInput(base)).toEqual([]));
  it("memperingatkan tanggal SPM lebih awal, RUP tanpa metode, dan penyedia kosong", () => {
    const t = checkTransactionInput({ ...base, payDate: "2026-05-01", hasMethod: false, hasProvider: false }).map((c) => c.text).join("|");
    expect(t).toMatch(/lebih awal/); expect(t).toMatch(/metode pemilihan kosong/); expect(t).toMatch(/Penyedia belum dipilih/);
  });
  it("penyedia baru yang diketik dihitung sebagai terisi; tahun SPM/SP2D harus sama", () => {
    expect(checkTransactionInput({ ...base, hasProvider: false, hasNewProvider: true })).toEqual([]);
    expect(payDateOutOfYear("2025-12-31", 2026)).toBe(true); expect(payDateOutOfYear("2026-01-01", 2026)).toBe(false); expect(payDateOutOfYear("", 2026)).toBe(false);
  });
});

import { rowIssues } from "@/lib/realization-issues";
import { transactionSaveSchema } from "@/lib/transactions";
describe("kontrol kelengkapan transaksi", () => {
  const ok = { paymentDate: "2026-05-01", paymentNumber: "SP2D-1", rupCode: "123", methodName: "E-purchasing", providerName: "PT A" };
  it("lengkap = tanpa catatan", () => expect(rowIssues(ok)).toEqual([]));
  it("mendeteksi tanggal, nomor, RUP, metode, dan penyedia yang kurang", () => {
    expect(rowIssues({ ...ok, paymentDate: null })).toEqual(["Tanggal SPM/SP2D belum diisi"]);
    expect(rowIssues({ ...ok, paymentNumber: null })).toEqual(["No SPM/SP2D belum diisi"]);
    expect(rowIssues({ ...ok, rupCode: null })).toEqual(["Kode RUP belum diisi"]);
    expect(rowIssues({ ...ok, methodName: null })).toEqual(["Metode pemilihan belum diisi"]);
    expect(rowIssues({ ...ok, providerName: null })).toEqual(["Penyedia belum diisi"]);
  });
  it("belanja non-pengadaan tidak dituntut RUP/metode/penyedia", () => expect(rowIssues({ paymentDate: "2026-05-01", paymentNumber: "X", rupCode: null, methodName: null, providerName: null })).toEqual([]));
});
describe("simpan perubahan transaksi", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("kolom kosong berarti dihapus (null), nilai dinormalisasi", () => {
    const r = transactionSaveSchema.parse({ id, transaction_date: "2026-05-01", amount: "1.250.000,50", payment_date: "", payment_number: "  ", rup_code: "", method_id: "", provider_id: "", notes: "" });
    expect(r).toMatchObject({ amount: "1250000.50", payment_date: null, payment_number: null, rup_code: null, method_id: null, provider_id: null, notes: null });
  });
  it("menolak nilai nol/tidak valid dan tanggal transaksi kosong", () => {
    expect(transactionSaveSchema.safeParse({ id, transaction_date: "2026-05-01", amount: "0" }).success).toBe(false);
    expect(transactionSaveSchema.safeParse({ id, transaction_date: "", amount: "100" }).success).toBe(false);
    expect(transactionSaveSchema.safeParse({ id, transaction_date: "2026-05-01", amount: "-500" }).success).toBe(true);
  });
});
