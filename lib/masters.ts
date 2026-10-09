import { z } from "zod";
export type Opt = { value: string; label: string };
export type Field = { name: string; label: string; type: "text" | "enum" | "ref" | "bool"; required?: boolean; options?: Opt[]; ref?: { table: string; labelCols: string[] } };
export type MasterDef = { slug: string; title: string; table: string; fields: Field[] };
const code: Field = { name: "code", label: "Kode", type: "text", required: true };
const name: Field = { name: "name", label: "Nama", type: "text", required: true };
// Daftar putih: nama tabel tidak pernah berasal dari klien.
export const MASTERS: MasterDef[] = [
  { slug: "program", title: "Program", table: "programs", fields: [code, name] },
  { slug: "kegiatan", title: "Kegiatan", table: "activities", fields: [{ name: "program_id", label: "Program", type: "ref", required: true, ref: { table: "programs", labelCols: ["code", "name"] } }, code, name] },
  { slug: "subkegiatan", title: "Subkegiatan", table: "subactivities", fields: [{ name: "activity_id", label: "Kegiatan", type: "ref", required: true, ref: { table: "activities", labelCols: ["code", "name"] } }, code, name] },
  { slug: "sumber-dana", title: "Sumber dana", table: "funding_sources", fields: [code, name] },
  { slug: "rekening", title: "Rekening belanja", table: "expenditure_accounts", fields: [code, name, { name: "expense_type", label: "Jenis belanja", type: "text" }] },
  { slug: "pejabat", title: "Pejabat (PPK/PPTK/PPBJ)", table: "officials", fields: [{ name: "official_type", label: "Jabatan", type: "enum", required: true, options: [{ value: "ppk", label: "PPK" }, { value: "pptk", label: "PPTK" }, { value: "ppbj", label: "PPBJ" }] }, name, { name: "nip", label: "NIP", type: "text" }] },
  { slug: "penyedia", title: "Penyedia", table: "providers", fields: [name] },
  { slug: "metode", title: "Metode pemilihan", table: "procurement_methods", fields: [code, name, { name: "is_swakelola", label: "Swakelola (bukan pemilihan penyedia)", type: "bool" }] },
];
export const findMaster = (slug: string) => MASTERS.find((m) => m.slug === slug);

export function buildSchema(def: MasterDef) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.fields) {
    if (f.type === "bool") { shape[f.name] = z.preprocess((v) => v === "on" || v === true, z.boolean()); continue; }
    const base = f.type === "enum" ? z.enum(f.options!.map((o) => o.value) as [string, ...string[]], { message: "Pilihan tidak valid" })
      : f.type === "ref" ? z.string().uuid("Pilihan tidak valid") : z.string().trim().max(200, "Maksimal 200 karakter");
    shape[f.name] = f.required ? (f.type === "text" ? z.string().trim().min(1, "Wajib diisi").max(200, "Maksimal 200 karakter") : base)
      : z.union([z.literal(""), base]).transform((v) => (v === "" ? null : v));
  }
  return z.object(shape);
}
