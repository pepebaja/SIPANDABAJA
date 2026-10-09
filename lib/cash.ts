import { fromCents, toCents } from "./money";
export type CashItem = { entryId: string; month: number; planned: string };
export type Entry = { id: string; amount: string };
export type PkgSchedule = { id: string; name: string; dueMonth: number | null; allocations: { entryId: string; amount: string }[] };
export type CashWarning = { type: "exceeds_pagu" | "cash_not_ready" | "no_schedule"; refId: string; message: string };

export function quarterTotals(items: CashItem[]): string[] {
  const q = [0n, 0n, 0n, 0n];
  for (const i of items) q[Math.floor((i.month - 1) / 3)]! += toCents(i.planned);
  return q.map(fromCents);
}
/** Peringatan alat bantu; BUKAN persetujuan, dan bukan saldo kas bank aktual. */
export function cashWarnings(entries: Entry[], items: CashItem[], pkgs: PkgSchedule[]): CashWarning[] {
  const out: CashWarning[] = [];
  const byEntry = new Map<string, CashItem[]>();
  for (const i of items) byEntry.set(i.entryId, [...(byEntry.get(i.entryId) ?? []), i]);
  for (const e of entries) {
    const total = (byEntry.get(e.id) ?? []).reduce((s, i) => s + toCents(i.planned), 0n);
    if (total > toCents(e.amount)) out.push({ type: "exceeds_pagu", refId: e.id, message: `Rencana kas ${fromCents(total)} melebihi pagu rekening ${e.amount}.` });
  }
  for (const p of pkgs) {
    if (p.dueMonth === null) { out.push({ type: "no_schedule", refId: p.id, message: `Paket "${p.name}" belum punya jadwal; keselarasan kas tidak dapat diperiksa.` }); continue; }
    for (const a of p.allocations) {
      const cum = (byEntry.get(a.entryId) ?? []).filter((i) => i.month <= p.dueMonth!).reduce((s, i) => s + toCents(i.planned), 0n);
      if (cum < toCents(a.amount)) out.push({ type: "cash_not_ready", refId: p.id, message: `Paket "${p.name}": rencana kas kumulatif s.d. bulan ${p.dueMonth} (${fromCents(cum)}) kurang dari alokasi ${a.amount}.` });
    }
  }
  return out;
}
