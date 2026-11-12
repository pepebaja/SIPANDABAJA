import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { contractPaid } from "@/lib/contract-paid";
import { DOC_LABEL } from "@/lib/procurement-profile";
import { parseRupiah } from "@/lib/import/parse";
export type ContractOpt = { id: string; label: string; value: string | null; paid: string; remaining: string | null };
/**
 * Dokumen kontrak/SP pada paket tahapan ini, dikelompokkan menurut kode RUP, beserta nilai terbayar dan sisanya (pembayaran tertaut
 * pada dokumen yang sama atau pada dokumen asal yang dibawa dari tahapan sebelumnya). Bila migrasi 20260123 belum dijalankan: tanpa terbayar.
 */
export async function loadContractOptions(sb: SupabaseClient, versionId: string): Promise<Record<string, ContractOpt[]>> {
  const sel = (cols: string) => (f: number, t: number) => sb.from("contracts_or_orders").select(`id, ${cols}doc_type, doc_number, doc_date, contract_value, procurement_packages!inner(internal_code, budget_version_id)`).eq("procurement_packages.budget_version_id", versionId).order("created_at").range(f, t);
  const rows: any[] = await fetchAll<any>(sel("lineage_id, description, ")).catch(() => fetchAll<any>(sel("")).catch(() => [] as any[]));
  if (!rows.length) return {};
  const refs = rows.map((r) => ({ id: r.id as string, lineage: (r.lineage_id ?? r.id) as string, value: r.contract_value === null ? null : (parseRupiah(r.contract_value) ?? null) }));
  const lineages = [...new Set(refs.map((r) => r.lineage))];
  const family: any[] = await fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("id, lineage_id").in("lineage_id", lineages).order("id").range(f, t)).catch(() => rows.map((r) => ({ id: r.id, lineage_id: r.id })));
  const famIds = family.map((x) => x.id as string);
  const txs: any[] = famIds.length ? await fetchAll<any>((f, t) => sb.from("transactions").select("contract_id, amount").in("contract_id", famIds).order("id").range(f, t)).catch(() => [] as any[]) : [];
  const paid = contractPaid([...refs, ...family.filter((x) => !refs.some((r) => r.id === x.id)).map((x) => ({ id: x.id as string, lineage: (x.lineage_id ?? x.id) as string, value: null }))], txs.map((t) => ({ contractId: t.contract_id as string, amount: parseRupiah(t.amount) ?? "0.00" })));
  const out: Record<string, ContractOpt[]> = {};
  for (const r of rows) {
    const p = paid.get(r.id)!, code = r.procurement_packages?.internal_code as string, no = r.doc_number ? ` ${r.doc_number}` : "", d = r.description ? ` · ${r.description}` : "";
    (out[code] ??= []).push({ id: r.id, label: `${DOC_LABEL[r.doc_type as keyof typeof DOC_LABEL] ?? r.doc_type}${no}${r.doc_date ? ` (${r.doc_date})` : ""}${d}`, value: p.value, paid: p.paid, remaining: p.remaining });
  }
  return out;
}
