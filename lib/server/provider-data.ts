import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { loadStageVersions } from "./stage-versions";
import { parseRupiah } from "@/lib/import/parse";
import { summarizeProviders, type ProvContract, type ProvTx, type ProviderStat } from "@/lib/provider-report";
const m = (v: unknown) => parseRupiah(v) ?? "0.00";
/**
 * Penyedia pelaksana pekerjaan dalam satu tahun anggaran (seluruh tahapan): jumlah paket (kode RUP unik), nilai kontrak/SP, dan realisasi.
 * Sumber: penyedia pada transaksi dan pada kontrak paket. Bila kolom penyedia pada transaksi belum ada (migrasi 20260119), hanya kontrak yang dipakai.
 */
export async function loadProviderStats(sb: SupabaseClient, yearId: string): Promise<{ list: ProviderStat[]; versionIds: string[] }> {
  const ids = (await loadStageVersions(sb, yearId)).map((v) => v.id);
  if (!ids.length) return { list: [], versionIds: [] };
  const [tx, ct] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("transactions").select("amount, payment_date, provider_id, providers(name), rup_packages(rup_code, name, pagu), procurement_methods(name)").in("budget_version_id", ids).not("provider_id", "is", null).order("id").range(f, t)).catch(() => [] as any[]),
    fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("id, contract_value, provider_id, providers(name), procurement_packages!inner(budget_version_id, internal_code, name, pagu)").in("procurement_packages.budget_version_id", ids).not("provider_id", "is", null).order("id").range(f, t)).catch(() => [] as any[])]);
  const txs: ProvTx[] = tx.map((r) => ({ providerId: r.provider_id, providerName: r.providers?.name ?? "(tanpa nama)", code: r.rup_packages?.rup_code ?? null, rupName: r.rup_packages?.name ?? null, pagu: r.rup_packages ? m(r.rup_packages.pagu) : null, methodName: r.procurement_methods?.name ?? null, amount: m(r.amount), paid: !!r.payment_date }));
  const cts: ProvContract[] = ct.map((r) => ({ providerId: r.provider_id, providerName: r.providers?.name ?? "(tanpa nama)", code: r.procurement_packages?.internal_code ?? null, name: r.procurement_packages?.name ?? null, pagu: r.procurement_packages ? m(r.procurement_packages.pagu) : null, value: m(r.contract_value) }));
  return { list: summarizeProviders(txs, cts), versionIds: ids };
}
