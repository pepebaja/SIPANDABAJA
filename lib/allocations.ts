import { z } from "zod";
import { fromCents, toCents } from "./money";
import { parseRupiah } from "./import/parse";
export const allocationSchema = z.object({
  rup_package_id: z.string().uuid(), budget_entry_id: z.string().uuid({ message: "Pilih rekening" }),
  amount: z.string().transform((v, ctx) => { const p = parseRupiah(v); if (p === null || p.startsWith("-") || toCents(p) === 0n) { ctx.addIssue({ code: "custom", message: "Harus angka rupiah lebih dari nol" }); return z.NEVER; } return p; }) });
export const cashItemSchema = z.object({
  budget_entry_id: z.string().uuid({ message: "Pilih rekening" }), period_month: z.coerce.number().int().min(1).max(12),
  planned_amount: z.string().transform((v, ctx) => { const p = parseRupiah(v); if (p === null || p.startsWith("-")) { ctx.addIssue({ code: "custom", message: "Harus angka rupiah tidak negatif" }); return z.NEVER; } return p; }) });
/** Sisa kapasitas = total - jumlah alokasi (dalam sen; tidak negatif dilaporkan apa adanya). */
export const remaining = (total: string, allocated: string[]): string => fromCents(toCents(total) - allocated.reduce((s, a) => s + toCents(a), 0n));
export const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
