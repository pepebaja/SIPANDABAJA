/** Filter Daftar transaksi realisasi (program / kegiatan / sub kegiatan, tanggal, dan kontrol kelengkapan data). Murni: tanpa akses database. */
export type Cek = "" | "tanpa_tgl" | "tanpa_no" | "tanpa_rup" | "tanpa_metode" | "koreksi";
export type TxFilter = { program: string; kegiatan: string; sub: string; basis: "transaksi" | "spm"; from: string; to: string; pay: "" | "sudah" | "belum"; proses: "" | "pengadaan" | "non"; cek: Cek };
export const CEK_OPTIONS: [Cek, string][] = [["", "Semua data"], ["tanpa_tgl", "Belum ada tanggal SPM/SP2D"], ["tanpa_no", "Sudah bertanggal, No SPM/SP2D kosong"],
  ["tanpa_rup", "Pengadaan tanpa kode RUP"], ["tanpa_metode", "Berkode RUP, metode pemilihan kosong"], ["koreksi", "Koreksi (nilai minus)"]];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export type FilterInput = Record<string, string | undefined>;
/** Membaca & memvalidasi parameter URL. Nilai tidak sah dibuang (dianggap kosong). dateError = tanggal awal setelah tanggal akhir (rentang diabaikan). */
export function parseTxFilter(sp: FilterInput): TxFilter & { dateError: boolean } {
  const id = (v?: string) => (v && UUID.test(v) ? v : "");
  const pick = <T extends string>(v: string | undefined, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  let from = sp.dari && isIsoDate(sp.dari) ? sp.dari : "", to = sp.sampai && isIsoDate(sp.sampai) ? sp.sampai : "", dateError = false;
  if (from && to && from > to) { dateError = true; from = ""; to = ""; }
  return { program: id(sp.program), kegiatan: id(sp.kegiatan), sub: id(sp.sub), basis: pick(sp.basis, ["transaksi", "spm"] as const, "transaksi"), from, to,
    pay: pick(sp.pay, ["", "sudah", "belum"] as const, ""), proses: pick(sp.proses, ["", "pengadaan", "non"] as const, ""),
    cek: pick(sp.cek, CEK_OPTIONS.map(([k]) => k), ""), dateError };
}
/** Parameter URL dari filter (hanya yang terisi); `basis` hanya ikut bila ada rentang tanggal. */
export function txFilterParams(f: TxFilter): Record<string, string> {
  const o: Record<string, string> = { program: f.program, kegiatan: f.kegiatan, sub: f.sub, dari: f.from, sampai: f.to, basis: f.from || f.to ? f.basis : "", pay: f.pay, proses: f.proses, cek: f.cek };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v));
}
export const hasTxFilter = (f: TxFilter): boolean => Object.keys(txFilterParams(f)).length > 0;
/**
 * Menerapkan filter ke kueri `transactions` Supabase. Kueri HARUS memilih `budget_entries!inner(subactivities!inner(activities!inner(...)))`
 * agar filter program/kegiatan/sub kegiatan pada relasi bersarang dapat dipakai (tanpa daftar ID panjang pada URL).
 */
export function applyTxFilter<Q extends { eq: Function; gte: Function; lte: Function; is: Function; not: Function; lt: Function; or: Function }>(q0: Q, f: TxFilter): Q {
  let q: any = q0;
  if (f.sub) q = q.eq("budget_entries.subactivity_id", f.sub);
  else if (f.kegiatan) q = q.eq("budget_entries.subactivities.activity_id", f.kegiatan);
  else if (f.program) q = q.eq("budget_entries.subactivities.activities.program_id", f.program);
  const col = f.basis === "spm" ? "payment_date" : "transaction_date";
  if (f.from) q = q.gte(col, f.from);
  if (f.to) q = q.lte(col, f.to);
  if (f.pay) q = q.eq("payment_status", f.pay === "sudah" ? "sudah_spm_sp2d" : "belum_spm_sp2d");
  if (f.proses === "pengadaan") q = q.or("rup_package_id.not.is.null,procurement_method_id.not.is.null");
  if (f.proses === "non") q = q.is("rup_package_id", null).is("procurement_method_id", null);
  if (f.cek === "tanpa_tgl") q = q.is("payment_date", null);
  if (f.cek === "tanpa_no") q = q.not("payment_date", "is", null).is("payment_number", null);
  if (f.cek === "tanpa_rup") q = q.is("rup_package_id", null).not("procurement_method_id", "is", null);
  if (f.cek === "tanpa_metode") q = q.not("rup_package_id", "is", null).is("procurement_method_id", null);
  if (f.cek === "koreksi") q = q.lt("amount", 0);
  return q;
}
