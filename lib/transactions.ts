import { z } from "zod";
import { parseRupiah } from "./import/parse";
import { toCents } from "./money";
export const KINDS: Record<string, string> = { pembayaran: "Pembayaran", koreksi: "Koreksi (mengurangi)", pembatalan: "Pembatalan (mengurangi)" };
export const DOC_TYPES: Record<string, string> = { kuitansi: "Kuitansi", bast: "BAST", invoice: "Invoice", sp2d: "SP2D", lainnya: "Lainnya" };
const optUuid = z.string().transform((v) => v || null).pipe(z.string().uuid().nullable());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal wajib diisi (format tanggal tidak valid)");
// Pengguna mengisi nilai positif; koreksi/pembatalan disimpan negatif oleh sistem.
export const transactionSchema = z.object({
  budget_entry_id: z.string().uuid({ message: "Pilih rekening" }), procurement_package_id: optUuid,
  kind: z.enum(["pembayaran", "koreksi", "pembatalan"]), doc_type: z.enum(["kuitansi", "bast", "invoice", "sp2d", "lainnya"]),
  doc_number: z.string().trim().max(100).transform((v) => v || null),
  doc_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).transform((v) => v || null), transaction_date: date,
  amount: z.string().transform((v, ctx) => { const p = parseRupiah(v); if (p === null || toCents(p) <= 0n) { ctx.addIssue({ code: "custom", message: "Nilai harus angka rupiah lebih dari nol" }); return z.NEVER; } return p; }),
  notes: z.string().trim().max(500).transform((v) => v || null),
}).transform((d) => ({ ...d, amount: d.kind === "pembayaran" ? d.amount : `-${d.amount}` }));
