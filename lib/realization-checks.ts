/** Pemeriksaan kelengkapan/kewajaran isian Input Realisasi (peringatan di layar; batas pagu/kas dan duplikat tetap ditegakkan server & database). */
export type FormCheck = { level: "warn" | "info"; text: string };
export type CheckInput = { year: number; date: string; payDate: string; hasRup: boolean; hasMethod: boolean; hasProvider: boolean; hasNewProvider: boolean };
export const yearOf = (d: string): number | null => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? Number(d.slice(0, 4)) : null);
/** Tanggal SPM/SP2D (bila diisi) harus pada tahun anggaran: menentukan tahapan dan pengakuan realisasi. */
export const payDateOutOfYear = (payDate: string, year: number): boolean => { const y = yearOf(payDate); return y !== null && y !== year; };
export function checkTransactionInput(i: CheckInput): FormCheck[] {
  const out: FormCheck[] = [], provider = i.hasProvider || i.hasNewProvider, pengadaan = i.hasRup || i.hasMethod;
  if (i.payDate && i.date && i.payDate < i.date) out.push({ level: "warn", text: "Tanggal SPM/SP2D lebih awal daripada tanggal transaksi. Periksa kembali kedua tanggal." });
  if (i.hasRup && !i.hasMethod) out.push({ level: "warn", text: "Kode RUP dipilih tetapi metode pemilihan kosong: transaksi tidak akan masuk peringkat metode dan analisis e-purchasing." });
  if (pengadaan && !provider) out.push({ level: "info", text: "Penyedia belum dipilih. Isi agar data penyedia dan jumlah paket per penyedia lengkap (dapat dilengkapi kemudian lewat Daftar transaksi > Ubah)." });
  if (provider && !pengadaan) out.push({ level: "info", text: "Penyedia diisi pada belanja tanpa RUP/metode pemilihan. Pastikan ini memang pekerjaan yang dilaksanakan penyedia." });
  return out;
}
