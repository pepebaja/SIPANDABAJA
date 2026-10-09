import { parseRupiah } from "./parse";
export type Masters = { subactivities: Map<string, string>; accounts: Map<string, string>; fundingSources: Map<string, string>; pptkByNip: Map<string, string> };
export type StagedRow = { subactivity_id: string; account_id: string; funding_source_id: string; pptk_id: string | null; entry_key: string; description: string; amount: string };
export type RowError = { row: number; field: string; message: string; hint: string };
export const TEMPLATE_COLUMNS = ["kode_subkegiatan", "kode_rekening", "kode_sumber_dana", "uraian", "pagu", "nip_pptk"] as const;
const str = (v: unknown) => String(v ?? "").trim();

export function validateBudgetRows(rows: { _row: number; [k: string]: unknown }[], m: Masters) {
  const valid: StagedRow[] = [], errors: RowError[] = [], seen = new Map<string, number>();
  for (const r of rows) {
    const before = errors.length, err = (field: string, message: string, hint: string) => errors.push({ row: r._row, field, message, hint });
    const sub = str(r.kode_subkegiatan), acc = str(r.kode_rekening), fund = str(r.kode_sumber_dana).toUpperCase(), desc = str(r.uraian), nip = str(r.nip_pptk);
    const subId = m.subactivities.get(sub), accId = m.accounts.get(acc), fundId = m.fundingSources.get(fund);
    if (!sub) err("kode_subkegiatan", "Kosong", "Isi kode subkegiatan sesuai DPA"); else if (!subId) err("kode_subkegiatan", `Kode "${sub}" tidak ada di master`, "Tambahkan di master Subkegiatan atau perbaiki kode");
    if (!acc) err("kode_rekening", "Kosong", "Isi kode rekening"); else if (!accId) err("kode_rekening", `Kode "${acc}" tidak ada di master`, "Tambahkan di master Rekening atau perbaiki kode");
    if (!fund) err("kode_sumber_dana", "Kosong", "Isi kode sumber dana, mis. DAU"); else if (!fundId) err("kode_sumber_dana", `Kode "${fund}" tidak ada di master`, "Tambahkan di master Sumber Dana");
    if (!desc) err("uraian", "Kosong", "Isi uraian belanja");
    const amount = parseRupiah(r.pagu);
    if (amount === null) err("pagu", `Format angka tidak valid: "${str(r.pagu)}"`, "Gunakan angka, mis. 1500000 atau 1.500.000,00");
    else if (amount.startsWith("-")) err("pagu", "Pagu tidak boleh negatif", "Periksa tanda minus");
    const pptkId = nip ? m.pptkByNip.get(nip) : undefined;
    if (nip && !pptkId) err("nip_pptk", `NIP "${nip}" tidak ditemukan sebagai PPTK`, "Tambahkan PPTK di master atau kosongkan kolom");
    if (errors.length > before) continue;
    const key = [sub, acc, fund, desc.toLowerCase().replace(/\s+/g, " ")].join("|");
    const dup = seen.get(key);
    if (dup !== undefined) { err("uraian", `Duplikat dengan baris ${dup}`, "Gabungkan atau bedakan uraiannya"); continue; }
    seen.set(key, r._row);
    valid.push({ subactivity_id: subId!, account_id: accId!, funding_source_id: fundId!, pptk_id: pptkId ?? null, entry_key: key, description: desc, amount: amount! });
  }
  return { valid, errors };
}
