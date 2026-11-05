/** Aturan penentuan tahapan anggaran (MURNI / PERGESERAN / PERUBAHAN) untuk sebuah transaksi. Murni dan terpusat agar mudah diuji. */
export type StageVersion = { id: string; stageCode: string; stageName: string; sortOrder: number; versionNo: number; effectiveFrom: string | null };
export type Basis = "spm_sp2d" | "transaksi";
export const BASIS_LABEL: Record<Basis, string> = { spm_sp2d: "Tanggal SPM/SP2D", transaksi: "Tanggal transaksi" };
export type PaymentStatus = "sudah" | "belum";
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { sudah: "Sudah SPM/SP2D", belum: "Belum SPM/SP2D" };

/**
 * Tanggal acuan penentu tahapan: Tanggal SPM/SP2D bila sudah ada; bila belum, tanggal transaksi.
 * Alasannya: realisasi belanja diakui saat dana diajukan/dicairkan, dan tahapan anggaran yang berlaku pada saat itulah yang menjadi acuan.
 */
export function referenceDate(t: { transactionDate: string; paymentDate?: string | null }): { date: string; basis: Basis } {
  return t.paymentDate ? { date: t.paymentDate, basis: "spm_sp2d" } : { date: t.transactionDate, basis: "transaksi" };
}
export const paymentStatusOf = (t: { paymentDate?: string | null }): PaymentStatus => (t.paymentDate ? "sudah" : "belum");

/**
 * Tanggal mulai berlaku bawaan (bulan-tanggal) bila admin belum mengaturnya di panel Aturan tahapan anggaran:
 *  - Murni      : sebelum 16 Maret (berlaku sejak 1 Januari)
 *  - Pergeseran : 16 Maret s.d. 26 Oktober
 *  - Perubahan  : 27 Oktober s.d. 31 Desember
 * Admin tetap dapat mengubahnya; nilai yang disimpan admin selalu didahulukan.
 */
export const DEFAULT_STAGE_START: Record<string, string> = { MURNI: "01-01", PERGESERAN: "03-16", PERUBAHAN: "10-27" };
/** Tanggal mulai berlaku: nilai yang diatur admin, kalau kosong memakai tanggal bawaan di atas. */
export const effectiveStart = (v: StageVersion, year: number): string | null => v.effectiveFrom ?? (DEFAULT_STAGE_START[v.stageCode] ? `${year}-${DEFAULT_STAGE_START[v.stageCode]}` : null);

/** Versi terbaru (nomor versi tertinggi) untuk setiap tahapan. */
export function latestPerStage(vs: StageVersion[]): StageVersion[] {
  const m = new Map<string, StageVersion>();
  for (const v of vs) { const c = m.get(v.stageCode); if (!c || v.versionNo > c.versionNo) m.set(v.stageCode, v); }
  return [...m.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}
/** Tahapan berlaku pada tanggal acuan = tahapan dengan tanggal mulai terakhir yang <= tanggal acuan. Seri tanggal sama: urutan tahapan terbesar. */
export function resolveVersion(vs: StageVersion[], year: number, refDate: string): StageVersion | null {
  let best: { v: StageVersion; start: string } | null = null;
  for (const v of latestPerStage(vs)) {
    const start = effectiveStart(v, year); if (!start || start > refDate) continue;
    if (!best || start > best.start || (start === best.start && v.sortOrder > best.v.sortOrder)) best = { v, start };
  }
  return best?.v ?? null;
}
