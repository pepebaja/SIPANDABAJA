import { z } from "zod";
import { parseRupiah } from "./import/parse";
const money = (required: boolean) => z.string().transform((v, ctx) => {
  if (v.trim() === "") { if (required) ctx.addIssue({ code: "custom", message: "Wajib diisi" }); return required ? z.NEVER : null; }
  const p = parseRupiah(v);
  if (p === null || p.startsWith("-")) { ctx.addIssue({ code: "custom", message: "Harus angka rupiah tidak negatif" }); return z.NEVER; }
  return p;
});
const optUuid = z.string().transform((v) => v || null).pipe(z.string().uuid().nullable());
const optDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Format tanggal tidak valid").transform((v) => v || null);
// Nilai kontrak/SP BUKAN realisasi keuangan (dicatat terpisah di modul transaksi).
export const contractSchema = z.object({
  doc_type: z.enum(["kontrak", "spk", "surat_pesanan"]), doc_number: z.string().trim().max(100).transform((v) => v || null), doc_date: optDate,
  provider_id: optUuid, selection_result_value: money(false), contract_value: money(false) });
export const rupSchema = z.object({
  rup_code: z.string().trim().min(1, "Wajib diisi").max(50), name: z.string().trim().min(1, "Wajib diisi").max(300),
  procurement_type: z.enum(["barang", "konstruksi", "konsultansi", "jasa_lainnya"]), planned_method_id: optUuid, pagu: money(true) });
