import { fromCents, toCents } from "./money";

/** Triwulan (1-4) dari tanggal yyyy-mm-dd; tanggal di luar tahun anggaran dibulatkan (sebelum = TW I, sesudah = TW IV). Sama dengan fungsi SQL tx_quarter. */
export function quarterOfDate(date: string, year: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]); if (mo < 1 || mo > 12) return null;
  return y < year ? 1 : y > year ? 4 : Math.ceil(mo / 3);
}

export type EntryLimitInput = {
  pagu: string;
  cash: (string | null)[];        // rencana kas per triwulan (4 elemen); null = belum diisi (dianggap 0)
  realized: string[];             // realisasi semua status per triwulan menurut tanggal transaksi (4 elemen; boleh negatif karena koreksi)
};
export type QuarterRow = { quarter: number; cash: string; cashCum: string; realCum: string; left: string };
export type Limits = {
  rows: QuarterRow[];             // per triwulan: sisa kas kumulatif = kas kumulatif - realisasi kumulatif
  entryLeft: string;              // sisa pagu rekening
  cashLeft: string;               // maksimal dari batas kas untuk triwulan tanggal transaksi (min triwulan q..IV)
  rupLeft: string | null;         // sisa pagu RUP (bila RUP dipilih)
  max: string;                    // nilai pembayaran maksimal yang diterima sistem (tidak negatif)
  limitedBy: "pagu" | "kas" | "rup";
};

/** Cermin penjaga database (check_transaction_limits). Basis data tetap penegak utama; ini untuk tampilan dan pemeriksaan awal. */
export function computeLimits(e: EntryLimitInput, quarter: number, rup?: { pagu: string; realized: string } | null): Limits {
  const rows: QuarterRow[] = []; let cc = 0n, rc = 0n;
  for (let i = 0; i < 4; i++) {
    const c = toCents(e.cash[i] ?? "0.00"); cc += c; rc += toCents(e.realized[i] ?? "0.00");
    rows.push({ quarter: i + 1, cash: fromCents(c), cashCum: fromCents(cc), realCum: fromCents(rc), left: fromCents(cc - rc) });
  }
  const total = rows[3] ? toCents(rows[3].realCum) : 0n;
  const entryLeft = toCents(e.pagu) - total;
  let cashLeft: bigint | null = null;
  for (let k = quarter; k <= 4; k++) { const l = toCents(rows[k - 1]!.left); if (cashLeft === null || l < cashLeft) cashLeft = l; }
  const rupLeft = rup ? toCents(rup.pagu) - toCents(rup.realized) : null;
  const cands: [bigint, Limits["limitedBy"]][] = [[entryLeft, "pagu"], [cashLeft!, "kas"]];
  if (rupLeft !== null) cands.push([rupLeft, "rup"]);
  const [m, by] = cands.reduce((a, b) => (b[0] < a[0] ? b : a));
  return { rows, entryLeft: fromCents(entryLeft), cashLeft: fromCents(cashLeft!), rupLeft: rupLeft === null ? null : fromCents(rupLeft), max: fromCents(m < 0n ? 0n : m), limitedBy: by };
}
