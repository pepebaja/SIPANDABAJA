import { fromCents, toCents } from "./money";
/** Terbayar/sisa per dokumen kontrak/SP. Salinan dokumen pada tahapan berikutnya (lineage sama) berbagi pembayaran yang tertaut ke dokumen aslinya. */
export type ContractRef = { id: string; lineage: string; value: string | null };
export type PaidTx = { contractId: string; amount: string };
export type ContractPaid = { value: string | null; paid: string; remaining: string | null };
export function contractPaid(contracts: ContractRef[], txs: PaidTx[]): Map<string, ContractPaid> {
  const lineageOf = new Map(contracts.map((c) => [c.id, c.lineage])), byLineage = new Map<string, bigint>();
  for (const t of txs) { const l = lineageOf.get(t.contractId); if (l) byLineage.set(l, (byLineage.get(l) ?? 0n) + toCents(t.amount)); }
  return new Map(contracts.map((c) => { const paid = byLineage.get(c.lineage) ?? 0n, v = c.value !== null && toCents(c.value) > 0n ? toCents(c.value) : null; return [c.id, { value: c.value, paid: fromCents(paid), remaining: v === null ? null : fromCents(v - paid) }]; }));
}
/** Pembayaran baru (positif) tidak boleh melampaui nilai dokumen; dokumen tanpa nilai tidak dibatasi. Mengembalikan sisa maksimal atau null bila tidak dibatasi. */
export const contractMaxPayable = (p: ContractPaid): string | null => (p.remaining === null ? null : p.remaining);
