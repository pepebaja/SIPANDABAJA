import { fromCents, sumCents, toCents } from "./money";
/**
 * Sinkronisasi paket pengadaan dengan data Input Realisasi: paket yang sudah punya transaksi tidak boleh tetap "belum diproses".
 * Murni (tanpa akses database). Hanya MENGISI/MAJUKAN data: status tidak pernah dimundurkan, paket batal/tunda tidak disentuh,
 * dan isian yang sudah terisi tidak ditimpa.
 */
export type SyncPkg = { status: string; group: string | null; pagu: string; recurring: boolean; processStart: string | null; processEnd: string | null; handover: string | null; methodId: string | null; hasContract: boolean };
export type SyncTx = { date: string; paymentDate: string | null; amount: string; methodId: string | null; providerId: string | null };
export type SyncResult = { patch: Record<string, string | null>; statusChanged: boolean; contract: { providerId: string | null; value: string } | null } | null;
const mode = (xs: (string | null)[]): string | null => { const m = new Map<string, number>(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
export function deriveFromRealization(p: SyncPkg, txs: SyncTx[]): SyncResult {
  if (!txs.length || p.group === "tidak_aktif" || p.status === "BATAL" || p.status === "TUNDA") return null;
  const recognized = sumCents(txs.filter((t) => t.paymentDate).map((t) => t.amount)), pagu = toCents(p.pagu);
  const first = txs.map((t) => t.paymentDate ?? t.date).sort()[0]!, lastPay = txs.map((t) => t.paymentDate).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const fullyPaid = !p.recurring && pagu > 0n && recognized * 1000n >= pagu * 995n;       // terbayar penuh (>= 99,5% pagu) dan bukan paket berulang
  const patch: Record<string, string | null> = {};
  let status = p.status, statusChanged = false;
  if (p.group === "belum_diproses") { status = fullyPaid ? "SELESAI" : "PELAKSANAAN"; patch.status = status; statusChanged = true; }
  if (!p.processStart) patch.process_start = first;
  const done = status === "SELESAI" || p.group === "selesai";
  if (done && !p.processEnd) patch.process_end = lastPay ?? first;
  if (done && !p.handover) patch.handover_date = lastPay ?? first;
  const m = mode(txs.map((t) => t.methodId)); if (!p.methodId && m) patch.method_id = m;
  const providers = [...new Set(txs.map((t) => t.providerId).filter((x): x is string => !!x))];
  const contract = done && fullyPaid && !p.hasContract ? { providerId: providers.length === 1 ? providers[0]! : null, value: fromCents(recognized) } : null;
  return Object.keys(patch).length || contract ? { patch, statusChanged, contract } : null;
}
