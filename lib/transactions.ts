import { z } from "zod";
import { parseRupiah } from "./import/parse";
import { toCents } from "./money";
const optUuid = z.string().optional().transform((v) => v || null).pipe(z.string().uuid().nullable());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal transaksi wajib diisi (format tanggal tidak valid)");
const optDate = z.string().optional().transform((v) => v || null).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal SPM/SP2D tidak valid").nullable());
const optText = (max: number, msg: string) => z.string().trim().max(max, msg).optional().transform((v) => v || null);
// Nilai positif = pembayaran; nilai minus = koreksi (mengurangi realisasi). Jenis dokumen/nomor dokumen/kode paket tidak lagi dicatat.
export const transactionSchema = z.object({
  budget_entry_id: z.string().uuid({ message: "Pilih rekening" }), rup_package_id: optUuid, procurement_method_id: optUuid,
  transaction_date: date, payment_date: optDate, payment_number: optText(100, "No SPM/SP2D maksimal 100 karakter"),
  amount: z.string().transform((v, ctx) => { const p = parseRupiah(v); if (p === null || toCents(p) === 0n) { ctx.addIssue({ code: "custom", message: "Nilai harus angka rupiah dan tidak boleh nol (minus untuk koreksi)" }); return z.NEVER; } return p; }),
  notes: optText(500, "Catatan maksimal 500 karakter"),
}).transform((d) => ({ ...d, kind: d.amount.startsWith("-") ? "koreksi" : "pembayaran" }));
export const paymentUpdateSchema = z.object({ id: z.string().uuid(), payment_number: optText(100, "No SPM/SP2D maksimal 100 karakter"), payment_date: optDate });
