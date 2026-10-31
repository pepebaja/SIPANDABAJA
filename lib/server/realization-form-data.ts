import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { parseRupiah } from "@/lib/import/parse";

export type FormEntry = { id: string; prog: string; act: string; sub: string; acc: string; fund: string; pptk: string; desc: string; pagu: string; cash: (string | null)[]; realized: string[] };
export type FormRup = { id: string; code: string; name: string; pagu: string; realized: string; methodId: string | null };
export type FormMethod = { id: string; name: string };
const m = (v: unknown) => parseRupiah(v) ?? "0.00";
const cmp = (a: string, b: string) => a.localeCompare(b, "id", { numeric: true });

/** Semua data yang dibutuhkan layar Input Realisasi: rekening anggaran (+ kas per triwulan dan realisasi per triwulan), paket RUP (+ realisasi + metode rencana), master metode pemilihan, dan alokasi RUP -> rekening. */
export async function loadRealizationForm(sb: SupabaseClient, versionId: string) {
  const { data: plan } = await sb.from("cash_plans").select("id").eq("budget_version_id", versionId).order("created_at").limit(1).maybeSingle();
  const [rows, cash, byQ, rups, byRup, methods, alloc] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("budget_entries").select("id, entry_key, description, amount, subactivities(code, name, activities(code, name, programs(code, name))), expenditure_accounts(code, name), funding_sources(code), officials(name)").eq("budget_version_id", versionId).order("entry_key").range(f, t)),
    plan ? fetchAll<any>((f, t) => sb.from("cash_plan_items").select("id, budget_entry_id, period_quarter, planned_amount").eq("cash_plan_id", plan.id).order("id").range(f, t)) : Promise.resolve([] as any[]),
    fetchAll<any>((f, t) => sb.rpc("realization_by_entry_quarter", { p_version: versionId }).order("entry_id").order("quarter").range(f, t)),
    fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, name, pagu, planned_method_id").eq("budget_version_id", versionId).order("rup_code").range(f, t)),
    fetchAll<any>((f, t) => sb.rpc("realization_by_rup", { p_version: versionId }).order("rup_id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name").range(f, t)),
    fetchAll<any>((f, t) => sb.from("package_budget_allocations").select("id, rup_package_id, budget_entry_id, rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", versionId).order("id").range(f, t))]);
  const cashBy = new Map<string, (string | null)[]>(), realBy = new Map<string, string[]>();
  for (const c of cash) { const a = cashBy.get(c.budget_entry_id) ?? [null, null, null, null]; a[c.period_quarter - 1] = m(c.planned_amount); cashBy.set(c.budget_entry_id, a); }
  for (const r of byQ) { const a = realBy.get(r.entry_id) ?? ["0.00", "0.00", "0.00", "0.00"]; a[Number(r.quarter) - 1] = m(r.amount); realBy.set(r.entry_id, a); }
  const entries: FormEntry[] = rows.map((e: any) => ({
    id: e.id, prog: e.subactivities?.activities?.programs ? `${e.subactivities.activities.programs.code} ${e.subactivities.activities.programs.name}` : "",
    act: e.subactivities?.activities ? `${e.subactivities.activities.code} ${e.subactivities.activities.name}` : "", sub: e.subactivities ? `${e.subactivities.code} ${e.subactivities.name}` : "",
    acc: e.expenditure_accounts ? `${e.expenditure_accounts.code} ${e.expenditure_accounts.name}` : "", fund: e.funding_sources?.code ?? "", pptk: e.officials?.name ?? "-", desc: e.description,
    pagu: m(e.amount), cash: cashBy.get(e.id) ?? [null, null, null, null], realized: realBy.get(e.id) ?? ["0.00", "0.00", "0.00", "0.00"] }));
  entries.sort((a, b) => cmp(a.sub, b.sub) || cmp(a.acc, b.acc) || cmp(a.desc, b.desc));
  const rr = new Map<string, string>(byRup.map((r: any) => [r.rup_id, m(r.amount)]));
  const rupList: FormRup[] = rups.map((r: any) => ({ id: r.id, code: r.rup_code, name: r.name, pagu: m(r.pagu), realized: rr.get(r.id) ?? "0.00", methodId: r.planned_method_id ?? null }));
  const allocByRup: Record<string, string[]> = {};
  for (const a of alloc) (allocByRup[a.rup_package_id] ??= []).push(a.budget_entry_id);
  const methodList: FormMethod[] = methods.map((m: any) => ({ id: m.id, name: m.name }));
  return { entries, rups: rupList, methods: methodList, allocByRup, hasCashPlan: !!plan };
}
