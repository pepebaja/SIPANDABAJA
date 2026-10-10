import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { parseRupiah } from "@/lib/import/parse";
import type { EntryRef, Quarters } from "@/lib/cash-import";

export type CashEntry = {
  id: string; progCode: string; progName: string; actCode: string; actName: string; subCode: string; subName: string;
  accCode: string; accName: string; fund: string; desc: string; pagu: string; q: Quarters;
};
const cmp = (a: string, b: string) => a.localeCompare(b, "id", { numeric: true });

/** Rekening anggaran berhierarki Program > Kegiatan > Sub Kegiatan > Belanja beserta nilai kas per triwulan. */
export async function loadCashEntries(sb: SupabaseClient, versionId: string) {
  const { data: plan } = await sb.from("cash_plans").select("id, source_document").eq("budget_version_id", versionId).order("created_at").limit(1).maybeSingle();
  const [rows, items] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("budget_entries")
      .select("id, entry_key, description, amount, subactivities(code, name, activities(code, name, programs(code, name))), expenditure_accounts(code, name), funding_sources(code)")
      .eq("budget_version_id", versionId).order("entry_key").range(f, t)),
    plan ? fetchAll<any>((f, t) => sb.from("cash_plan_items").select("id, budget_entry_id, period_quarter, planned_amount").eq("cash_plan_id", plan.id).order("id").range(f, t)) : Promise.resolve([] as any[])]);
  const qs = new Map<string, Quarters>();
  for (const i of items) { const q = qs.get(i.budget_entry_id) ?? [null, null, null, null]; q[i.period_quarter - 1] = parseRupiah(i.planned_amount) ?? "0.00"; qs.set(i.budget_entry_id, q); }
  const entries: CashEntry[] = rows.map((e) => ({
    id: e.id, progCode: e.subactivities?.activities?.programs?.code ?? "", progName: e.subactivities?.activities?.programs?.name ?? "",
    actCode: e.subactivities?.activities?.code ?? "", actName: e.subactivities?.activities?.name ?? "", subCode: e.subactivities?.code ?? "", subName: e.subactivities?.name ?? "",
    accCode: e.expenditure_accounts?.code ?? "", accName: e.expenditure_accounts?.name ?? "", fund: e.funding_sources?.code ?? "", desc: e.description,
    pagu: parseRupiah(e.amount) ?? "0.00", q: qs.get(e.id) ?? [null, null, null, null] }));
  entries.sort((a, b) => cmp(a.progCode, b.progCode) || cmp(a.actCode, b.actCode) || cmp(a.subCode, b.subCode) || cmp(a.accCode, b.accCode) || cmp(a.desc, b.desc));
  return { planId: (plan?.id as string | undefined) ?? null, sourceDoc: (plan?.source_document as string | null | undefined) ?? null, entries };
}
export const toEntryRefs = (es: CashEntry[]): EntryRef[] => es.map((e) => ({ id: e.id, sub: e.subCode, acc: e.accCode, fund: e.fund, desc: e.desc, pagu: e.pagu }));
