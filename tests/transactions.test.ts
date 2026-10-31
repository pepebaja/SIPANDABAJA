import { describe, expect, it } from "vitest";
import { paymentUpdateSchema, transactionSchema } from "@/lib/transactions";

const E = "11111111-1111-1111-1111-111111111111", M = "22222222-2222-2222-2222-222222222222";
const base = { budget_entry_id: E, transaction_date: "2026-03-10", amount: "1.500.000,50" };
describe("transactionSchema (input manual, format sederhana)", () => {
  it("nilai positif = pembayaran; hanya kolom yang tersisa yang dicatat", () => {
    const r = transactionSchema.parse({ ...base, rup_package_id: "", procurement_method_id: M, payment_date: "2026-03-15", payment_number: " SP2D/1 ", notes: "" });
    expect(r).toMatchObject({ kind: "pembayaran", amount: "1500000.50", procurement_method_id: M, payment_date: "2026-03-15", payment_number: "SP2D/1", rup_package_id: null, notes: null });
    for (const k of ["doc_type", "doc_number", "doc_date", "procurement_package_id"]) expect(r).not.toHaveProperty(k);
  });
  it("nilai minus = koreksi", () => expect(transactionSchema.parse({ ...base, amount: "-250000" })).toMatchObject({ kind: "koreksi", amount: "-250000.00" }));
  it("SPM/SP2D, metode, dan RUP boleh kosong", () => expect(transactionSchema.parse(base)).toMatchObject({ payment_date: null, payment_number: null, procurement_method_id: null, rup_package_id: null }));
  it("menolak nilai nol/bukan angka, tanggal kosong, rekening kosong, nomor terlalu panjang, tanggal SPM/SP2D rusak", () => {
    for (const bad of [{ ...base, amount: "0" }, { ...base, amount: "abc" }, { ...base, transaction_date: "" }, { ...base, budget_entry_id: "" }, { ...base, payment_number: "x".repeat(101) }, { ...base, payment_date: "15/03/2026" }])
      expect(transactionSchema.safeParse(bad).success).toBe(false);
  });
});
describe("paymentUpdateSchema", () => {
  it("id wajib UUID; nomor/tanggal opsional", () => {
    expect(paymentUpdateSchema.parse({ id: E, payment_number: "", payment_date: "" })).toEqual({ id: E, payment_number: null, payment_date: null });
    expect(paymentUpdateSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("transactionSchema: tautan RUP", () => {
  it("menerima uuid RUP dan menolak nilai asal-asalan", () => {
    expect(transactionSchema.parse({ ...base, rup_package_id: "22222222-2222-4222-8222-222222222222" }).rup_package_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(transactionSchema.safeParse({ ...base, rup_package_id: "bukan-uuid" }).success).toBe(false);
  });
});
