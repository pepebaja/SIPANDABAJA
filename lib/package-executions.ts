import { fromCents, sumCents, toCents } from "./money";
/** Rincian pelaksanaan suatu paket (satu kode RUP dapat dibelanjakan berulang kali): jumlah, total terpakai, dan sisa pagu. */
export type Execution = { id: string; date: string; amount: string; paymentDate: string | null; paymentNumber: string | null; description: string | null; provider: string | null };
export type ExecutionSummary = { count: number; total: string; recognized: string; unrecognized: string; remaining: string; pct: string | null };
export function summarizeExecutions(xs: Execution[], pagu: string): ExecutionSummary {
  const total = sumCents(xs.map((x) => x.amount)), rec = sumCents(xs.filter((x) => x.paymentDate).map((x) => x.amount)), pg = toCents(pagu);
  return { count: xs.length, total: fromCents(total), recognized: fromCents(rec), unrecognized: fromCents(total - rec), remaining: fromCents(pg - total), pct: pg > 0n ? fromCents((total * 10000n) / pg) : null };
}
