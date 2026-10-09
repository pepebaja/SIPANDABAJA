import { describe, expect, it } from "vitest";
import { derive, totals } from "@/lib/realization";
import { transactionSchema } from "@/lib/transactions";
const row = (pagu: string, verified: string, unverified = "0.00") => ({ pagu, verified, unverified, txCount: 1, unverifiedCount: 0 });
describe("realisasi", () => {
  it("sisa dan persentase dari terverifikasi saja", () => { const d = derive(row("1000.00", "250.00", "300.00")); expect(d.remaining).toBe("750.00"); expect(d.percent).toBe("25.00"); expect(d.overPagu).toBe(false); });
  it("N/A bila pagu nol", () => expect(derive(row("0.00", "0.00")).percent).toBeNull());
  it("menandai melampaui pagu termasuk yang belum diverifikasi", () => expect(derive(row("100.00", "60.00", "50.00")).overPagu).toBe(true));
  it("total tanpa pembulatan sebelum agregasi", () => { const t = totals([row("0.10", "0.10"), row("0.20", "0.20")]); expect(t.pagu).toBe("0.30"); expect(t.verified).toBe("0.30"); expect(t.percent).toBe("100.00"); });
  it("koreksi negatif mengurangi realisasi", () => expect(derive(row("1000.00", "400.00")).remaining).toBe("600.00"));
});
describe("transactionSchema", () => {
  const u = "11111111-1111-1111-1111-111111111111", b = { budget_entry_id: u, procurement_package_id: "", kind: "pembayaran", doc_type: "kuitansi", doc_number: "K-1", doc_date: "", transaction_date: "2026-03-01", amount: "1.000.000", notes: "" };
  it("pembayaran positif, koreksi disimpan negatif", () => { expect(transactionSchema.parse(b).amount).toBe("1000000.00"); expect(transactionSchema.parse({ ...b, kind: "koreksi" }).amount).toBe("-1000000.00"); });
  it("menolak nilai nol/negatif dan tanggal kosong", () => { expect(transactionSchema.safeParse({ ...b, amount: "0" }).success).toBe(false); expect(transactionSchema.safeParse({ ...b, amount: "-5" }).success).toBe(false); expect(transactionSchema.safeParse({ ...b, transaction_date: "" }).success).toBe(false); });
});
import { fillMonths } from "@/lib/dashboard";
describe("dashboard", () => it("mengisi 12 bulan dengan 0 untuk bulan kosong", () => { const r = fillMonths([{ month: 3, verified: 500 }]); expect(r).toHaveLength(12); expect(r[2]).toEqual({ bulan: "Mar", realisasi: 500 }); expect(r[0]?.realisasi).toBe(0); }));
