/** Jenis belanja dari kode rekening (jenjang kode akun belanja: 5.1 Operasi, 5.1.02 Barang dan Jasa, dst.). */
const NAMA: Record<string, string> = {
  "5.1": "Belanja Operasi", "5.2": "Belanja Modal", "5.3": "Belanja Tidak Terduga", "5.4": "Belanja Transfer",
  "5.1.01": "Belanja Pegawai", "5.1.02": "Belanja Barang dan Jasa", "5.1.03": "Belanja Bunga", "5.1.04": "Belanja Subsidi", "5.1.05": "Belanja Hibah", "5.1.06": "Belanja Bantuan Sosial",
  "5.2.01": "Belanja Modal Tanah", "5.2.02": "Belanja Modal Peralatan dan Mesin", "5.2.03": "Belanja Modal Gedung dan Bangunan", "5.2.04": "Belanja Modal Jalan, Jaringan, dan Irigasi",
  "5.2.05": "Belanja Modal Aset Tetap Lainnya", "5.2.06": "Belanja Modal Aset Lainnya", "5.3.01": "Belanja Tidak Terduga", "5.4.01": "Belanja Bagi Hasil", "5.4.02": "Belanja Bantuan Keuangan",
};
export type JenisOption = { prefix: string; label: string; level: 2 | 3 };
/** Prefix 2 dan 3 segmen yang ada pada daftar kode rekening, terurut menurut kode (2 segmen = induk, mencakup semua turunannya). */
export function jenisOptions(codes: string[]): JenisOption[] {
  const set = new Map<string, JenisOption>();
  for (const c of codes) { const seg = c.split("."); for (const n of [2, 3] as const) if (seg.length > n) { const prefix = seg.slice(0, n).join("."); if (!set.has(prefix)) set.set(prefix, { prefix, label: NAMA[prefix] ?? `Kelompok ${prefix}`, level: n }); } }
  return [...set.values()].sort((a, b) => a.prefix.localeCompare(b.prefix, "id", { numeric: true }));
}
/** Rekening termasuk jenis (prefix) tertentu; prefix kosong = semua. */
export const inJenis = (code: string, prefix: string): boolean => !prefix || code.startsWith(`${prefix}.`);
export const jenisOfCode = (code: string): string => code.split(".").slice(0, 3).join(".");
/** Nama jenis belanja untuk awalan kode (2/3 segmen); awalan yang tidak dikenal diberi nama generik. */
export const jenisName = (prefix: string): string => NAMA[prefix] ?? `Kelompok ${prefix}`;
