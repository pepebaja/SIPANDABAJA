/** Aturan penentuan tahapan anggaran (MURNI / PERGESERAN / PERUBAHAN) untuk sebuah transaksi. Murni dan terpusat agar mudah diuji. */
export type StageVersion = { id: string; stageCode: string; stageName: string; sortOrder: number; versionNo: number; effectiveFrom: string | null };
export type Basis = "spm_sp2d" | "transaksi";
export const BASIS_LABEL: Record<Basis, string> = { spm_sp2d: "Tanggal SPM/SP2D", transaksi: "Tanggal transaksi" };
export type PaymentStatus = "sudah_spm_sp2d" | "belum_spm_sp2d";
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { sudah_spm_sp2d: "Sudah SPM/SP2D (diakui)", belum_spm_sp2d: "belum_spm_sp2d (belum diakui)" };

/**
 * Tanggal acuan penentu tahapan: Tanggal SPM/SP2D bila sudah ada; bila belum, tanggal transaksi.
 * Alasannya: realisasi belanja diakui saat dana diajukan/dicairkan, dan tahapan anggaran yang berlaku pada saat itulah yang menjadi acuan.
 */
export function referenceDate(t: { transactionDate: string; paymentDate?: string | null }): { date: string; basis: Basis } {
  return t.paymentDate ? { date: t.paymentDate, basis: "spm_sp2d" } : { date: t.transactionDate, basis: "transaksi" };
}
export const paymentStatusOf = (t: { paymentDate?: string | null }): PaymentStatus => (t.paymentDate ? "sudah_spm_sp2d" : "belum_spm_sp2d");

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
/**
 * Tahapan berlaku pada tanggal acuan = versi dengan tanggal penetapan (mulai berlaku) terakhir yang <= tanggal acuan.
 * SEMUA versi ikut dipertimbangkan (mis. Pergeseran I dan Pergeseran II dengan tanggal penetapan berbeda). Seri tanggal sama:
 * urutan tahapan terbesar, lalu nomor versi terbesar.
 */
export function resolveVersion(vs: StageVersion[], year: number, refDate: string): StageVersion | null {
  let best: { v: StageVersion; start: string } | null = null;
  for (const v of vs) {
    const start = effectiveStart(v, year); if (!start || start > refDate) continue;
    if (!best || start > best.start || (start === best.start && (v.sortOrder > best.v.sortOrder || (v.sortOrder === best.v.sortOrder && v.versionNo > best.v.versionNo)))) best = { v, start };
  }
  return best?.v ?? null;
}
/** Triwulan (1-4) dari tanggal ISO: I Jan-Mar, II Apr-Jun, III Jul-Sep, IV Okt-Des. Null bila format tanggal tidak sah. */
export const quarterOf = (iso: string): 1 | 2 | 3 | 4 | null => { const m = /^\d{4}-(\d{2})-\d{2}$/.exec(iso); if (!m) return null; const mo = Number(m[1]); return mo >= 1 && mo <= 12 ? ((Math.floor((mo - 1) / 3) + 1) as 1 | 2 | 3 | 4) : null; };
export const QUARTER_MONTHS = ["Januari - Maret", "April - Juni", "Juli - September", "Oktober - Desember"] as const;
export type StageWindow = { id: string; code: string; name: string; versionNo: number; start: string; end: string };
/** Jendela berlaku tiap versi pada satu tahun: mulai = tanggal penetapan, berakhir sehari sebelum penetapan versi berikutnya (terakhir: 31 Des). Untuk tampilan. */
export function stageWindows(vs: StageVersion[], year: number): StageWindow[] {
  const dated = vs.map((v) => ({ v, start: effectiveStart(v, year) })).filter((x): x is { v: StageVersion; start: string } => !!x.start)
    .sort((a, b) => a.start.localeCompare(b.start) || a.v.sortOrder - b.v.sortOrder || a.v.versionNo - b.v.versionNo);
  const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  // Versi yang tanggalnya persis sama dengan versi berikutnya digantikan (tidak pernah terpilih): dilewati.
  const live = dated.filter((x, i) => !dated[i + 1] || dated[i + 1]!.start !== x.start);
  return live.map((x, i) => ({ id: x.v.id, code: x.v.stageCode, name: x.v.stageName, versionNo: x.v.versionNo, start: x.start, end: live[i + 1] ? dayBefore(live[i + 1]!.start) : `${year}-12-31` }));
}
