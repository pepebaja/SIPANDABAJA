import { z } from "zod";
import { parseRupiah } from "./import/parse";
const optUuid = z.union([z.literal(""), z.string().uuid()]).transform((v) => v || null);
const optDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")]).transform((v) => v || null);
export const packageSchema = z.object({
  internal_code: z.string().trim().min(1, "Wajib diisi").max(50),
  name: z.string().trim().min(1, "Wajib diisi").max(300),
  pagu: z.string().transform((v, ctx) => { const p = parseRupiah(v); if (p === null || p.startsWith("-")) { ctx.addIssue({ code: "custom", message: "Pagu harus angka rupiah tidak negatif" }); return z.NEVER; } return p; }),
  execution_mode: z.enum(["penyedia", "swakelola"]),
  method_id: optUuid, ppbj_id: optUuid, ppk_id: optUuid, pptk_id: optUuid,
  assigned_date: optDate, due_date: optDate,
}).refine((d) => !d.assigned_date || !d.due_date || d.due_date >= d.assigned_date, { path: ["due_date"], message: "Tenggat tidak boleh sebelum tanggal penugasan" });
