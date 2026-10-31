const MONTHS: Record<string, number> = { januari: 1, jan: 1, january: 1, februari: 2, feb: 2, pebruari: 2, february: 2, maret: 3, mar: 3, march: 3, april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7, agustus: 8, agu: 8, agt: 8, aug: 8, august: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, october: 10, november: 11, nov: 11, nop: 11, desember: 12, des: 12, dec: 12, december: 12 };
const iso = (y: number, m: number, d: number): string | null => {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > dim ? null : `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
/**
 * Mengubah isi sel tanggal menjadi yyyy-mm-dd. "" = kosong (bukan kesalahan); null = tidak dapat dibaca.
 * Dikenali: 2026-03-15, 15/03/2026, 15-03-2026, 15.03.2026, 15 Maret 2026, 15-Mar-26, serial tanggal Excel (46000).
 * Format hari/bulan mengikuti kebiasaan Indonesia (dd/mm/yyyy); bulan/hari ala AS (mm/dd) TIDAK ditebak.
 */
export function parseDateCell(v: unknown): string | null {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {                                  // serial Excel (sistem 1900)
    if (!Number.isFinite(v) || v < 20000 || v > 80000) return null;
    return new Date(Math.round((Math.floor(v) - 25569) * 86400_000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim().replace(/\s+/g, " ");
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})$/.exec(s);
  if (m) return iso(m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})[ \-/.]([A-Za-z]+)\.?[ \-/.,]+(\d{4}|\d{2})$/.exec(s);
  if (m) { const mo = MONTHS[m[2]!.toLowerCase()]; return mo ? iso(m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!, mo, +m[1]!) : null; }
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDateCell(Number(s));
  return null;
}
