import { fromCents, percent, toCents } from "./money";
export type EntryRow = { pagu: string; verified: string; unverified: string; txCount: number; unverifiedCount: number };
export type Derived = EntryRow & { remaining: string; percent: string | null; overPagu: boolean };
/** Sisa = pagu - realisasi TERVERIFIKASI. Persentase N/A bila pagu nol. Nilai kontrak tidak pernah masuk di sini. */
export function derive(r: EntryRow): Derived {
  return { ...r, remaining: fromCents(toCents(r.pagu) - toCents(r.verified)), percent: percent(r.verified, r.pagu),
    overPagu: toCents(r.verified) + toCents(r.unverified) > toCents(r.pagu) };
}
export function totals(rows: EntryRow[]): Derived {
  const s = rows.reduce((a, r) => ({ pagu: a.pagu + toCents(r.pagu), v: a.v + toCents(r.verified), u: a.u + toCents(r.unverified), n: a.n + r.txCount, un: a.un + r.unverifiedCount }), { pagu: 0n, v: 0n, u: 0n, n: 0, un: 0 });
  return derive({ pagu: fromCents(s.pagu), verified: fromCents(s.v), unverified: fromCents(s.u), txCount: s.n, unverifiedCount: s.un });
}
