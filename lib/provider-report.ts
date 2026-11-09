import { fromCents, sumCents } from "./money";
/** Penyedia pelaksana pekerjaan per tahun anggaran. Paket = kode RUP unik (paket yang sama pada beberapa tahapan dihitung sekali). */
export type ProvTx = { providerId: string; providerName: string; code: string | null; rupName: string | null; pagu: string | null; methodName: string | null; amount: string; paid: boolean };
export type ProvContract = { providerId: string; providerName: string; code: string | null; name: string | null; pagu: string | null; value: string };
export type ProviderPackage = { code: string; name: string; methods: string[]; pagu: string | null; realized: string; contract: string };
export type ProviderStat = { id: string; name: string; packageCount: number; txCount: number; txNoCode: number; realized: string; contract: string; packages: ProviderPackage[] };
const cmp = (a: string, b: string) => a.localeCompare(b, "id", { numeric: true });
export function summarizeProviders(tx: ProvTx[], contracts: ProvContract[]): ProviderStat[] {
  type Pk = { code: string; name: string; methods: Set<string>; pagu: string | null; real: string[]; contract: string[] };
  const by = new Map<string, { id: string; name: string; pk: Map<string, Pk>; txCount: number; txNoCode: number; real: string[]; contract: string[] }>();
  const prov = (id: string, name: string) => { let p = by.get(id); if (!p) { p = { id, name, pk: new Map(), txCount: 0, txNoCode: 0, real: [], contract: [] }; by.set(id, p); } return p; };
  const pkg = (p: ReturnType<typeof prov>, code: string, name: string | null, pagu: string | null) => { let k = p.pk.get(code); if (!k) { k = { code, name: name ?? "", methods: new Set(), pagu, real: [], contract: [] }; p.pk.set(code, k); } if (!k.name && name) k.name = name; if (!k.pagu && pagu) k.pagu = pagu; return k; };
  for (const t of tx) {
    const p = prov(t.providerId, t.providerName); p.txCount++;
    if (t.paid) p.real.push(t.amount);
    if (!t.code) { p.txNoCode++; continue; }
    const k = pkg(p, t.code, t.rupName, t.pagu); if (t.methodName) k.methods.add(t.methodName); if (t.paid) k.real.push(t.amount);
  }
  for (const c of contracts) { const p = prov(c.providerId, c.providerName); p.contract.push(c.value); if (c.code) pkg(p, c.code, c.name, c.pagu).contract.push(c.value); }
  return [...by.values()].map((p): ProviderStat => ({ id: p.id, name: p.name, packageCount: p.pk.size, txCount: p.txCount, txNoCode: p.txNoCode, realized: fromCents(sumCents(p.real)), contract: fromCents(sumCents(p.contract)),
    packages: [...p.pk.values()].sort((a, b) => cmp(a.code, b.code)).map((k) => ({ code: k.code, name: k.name, methods: [...k.methods].sort(cmp), pagu: k.pagu, realized: fromCents(sumCents(k.real)), contract: fromCents(sumCents(k.contract)) })) }))
    .sort((a, b) => b.packageCount - a.packageCount || (BigInt(b.realized.replace(".", "")) === BigInt(a.realized.replace(".", "")) ? 0 : BigInt(b.realized.replace(".", "")) > BigInt(a.realized.replace(".", "")) ? 1 : -1) || cmp(a.name, b.name));
}
