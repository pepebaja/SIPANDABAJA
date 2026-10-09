export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** Mengisi 12 bulan; bulan tanpa data = 0. Nilai hanya untuk tampilan grafik (bukan agregasi keuangan). */
export function fillMonths(rows: { month: number; verified: number }[]): { bulan: string; realisasi: number }[] {
  const by = new Map(rows.map((r) => [r.month, Number(r.verified)]));
  return MONTH_SHORT.map((bulan, i) => ({ bulan, realisasi: by.get(i + 1) ?? 0 }));
}
