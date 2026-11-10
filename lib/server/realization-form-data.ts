import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { parseRupiah } from "@/lib/import/parse";
import { loadStageVersions } from "./stage-versions";
import { stageWindows, type StageWindow } from "@/lib/stage-rule";

export type FormEntry = { id: string; prog: string; act: string; sub: string; acc: string; fund: string; pptk: string; desc: string; pagu: string; cash: (string | null)[]; realized: string[] };
export type FormRup = { id: string; code: string; name: string; pagu: string; realized: string; methodId: string | null; providerId: string | null };
export type FormProvider = { id: string; name: string };
export type FormMethod = { id: string; name: string };
/** Batas per tahapan untuk SATU rekening (padanan rekening layar pada tahapan itu) dan per kode RUP. null = rekening tidak ada pada tahapan itu. */
export type StageLimit = { pagu: string; cash: (string | null)[]; realized: string[] };
export type StageData = { cashPrepared: boolean; entries: Record<string, StageLimit | null>; rups: Record<string, { pagu: string; realized: string } | null> };
const m = (v: unknown) => parseRupiah(v) ?? "0.00";
const cmp = (a: string, b: string) => a.localeCompare(b, "id", { numeric: true });

/** Semua data yang dibutuhkan layar Input Realisasi: rekening anggaran (+ kas per triwulan dan realisasi per triwulan), paket RUP (+ realisasi + metode rencana), master metode pemilihan, dan alokasi RUP -> rekening. */
export async function loadRealizationForm(sb: SupabaseClient, versionId: string, yearId: string, year: number) {
  const { data: plan } = await sb.from("cash_plans").select("id").eq("budget_version_id", versionId).order("created_at").limit(1).maybeSingle();
  const [rows, cash, byQ, rups, byRup, methods, alloc, provs, contracts] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("budget_entries").select("id, entry_key, description, amount, subactivity_id, account_id, funding_source_id, subactivities(code, name, activities(code, name, programs(code, name))), expenditure_accounts(code, name), funding_sources(code), officials(name)").eq("budget_version_id", versionId).order("entry_key").range(f, t)),
    plan ? fetchAll<any>((f, t) => sb.from("cash_plan_items").select("id, budget_entry_id, period_quarter, planned_amount").eq("cash_plan_id", plan.id).order("id").range(f, t)) : Promise.resolve([] as any[]),
    fetchAll<any>((f, t) => sb.rpc("realization_by_entry_quarter", { p_version: versionId }).order("entry_id").order("quarter").range(f, t)),
    fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, name, pagu, planned_method_id").eq("budget_version_id", versionId).order("rup_code").range(f, t)),
    fetchAll<any>((f, t) => sb.rpc("realization_by_rup", { p_version: versionId }).order("rup_id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name").range(f, t)),
    fetchAll<any>((f, t) => sb.from("package_budget_allocations").select("id, rup_package_id, budget_entry_id, rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", versionId).order("id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("providers").select("id, name").eq("is_active", true).order("name").range(f, t)),
    fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("id, provider_id, procurement_packages!inner(budget_version_id, rup_package_id)").not("provider_id", "is", null).eq("procurement_packages.budget_version_id", versionId).order("id").range(f, t))]);
  const provByRup = new Map<string, string>(); for (const c of contracts) { const r = c.procurement_packages?.rup_package_id; if (r && !provByRup.has(r)) provByRup.set(r, c.provider_id); }   // penyedia pada kontrak paket menjadi usulan awal
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
  const rupList: FormRup[] = rups.map((r: any) => ({ id: r.id, code: r.rup_code, name: r.name, pagu: m(r.pagu), realized: rr.get(r.id) ?? "0.00", methodId: r.planned_method_id ?? null, providerId: provByRup.get(r.id) ?? null }));
  const allocByRup: Record<string, string[]> = {};
  for (const a of alloc) (allocByRup[a.rup_package_id] ??= []).push(a.budget_entry_id);
  const methodList: FormMethod[] = methods.map((m: any) => ({ id: m.id, name: m.name }));
  const providers: FormProvider[] = provs.map((p: any) => ({ id: p.id, name: p.name }));
  const versions = await loadStageVersions(sb, yearId), windows: StageWindow[] = stageWindows(versions, year), stageData: Record<string, StageData> = {};
  const sameKey = (a: any, b: any) => a.subactivity_id === b.subactivity_id && a.account_id === b.account_id && (a.funding_source_id ?? null) === (b.funding_source_id ?? null);
  const pick = (e: any, cands: any[]) => { const c = cands.filter((x) => sameKey(x, e)); if (c.length === 1) return c[0]; const same = c.filter((x) => x.description === e.description); return same.length === 1 ? same[0] : null; };
  const zero = ["0.00", "0.00", "0.00", "0.00"];
  for (const w of windows) {
    if (w.id === versionId) {
      stageData[w.id] = { cashPrepared: cash.length > 0, entries: Object.fromEntries(entries.map((e) => [e.id, { pagu: e.pagu, cash: e.cash, realized: e.realized }])), rups: Object.fromEntries(rupList.map((r) => [r.code, { pagu: r.pagu, realized: r.realized }])) };
      continue;
    }
    const [vEntries, vPlan, vReal, vRups, vRupReal] = await Promise.all([
      fetchAll<any>((f, t) => sb.from("budget_entries").select("id, description, amount, subactivity_id, account_id, funding_source_id").eq("budget_version_id", w.id).order("id").range(f, t)),
      sb.from("cash_plans").select("id").eq("budget_version_id", w.id).order("created_at").limit(1).maybeSingle(),
      fetchAll<any>((f, t) => sb.rpc("realization_by_entry_quarter", { p_version: w.id }).order("entry_id").order("quarter").range(f, t)),
      fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, pagu").eq("budget_version_id", w.id).order("rup_code").range(f, t)),
      fetchAll<any>((f, t) => sb.rpc("realization_by_rup", { p_version: w.id }).order("rup_id").range(f, t))]);
    const items: any[] = vPlan.data ? await fetchAll<any>((f, t) => sb.from("cash_plan_items").select("id, budget_entry_id, period_quarter, planned_amount").eq("cash_plan_id", vPlan.data!.id).order("id").range(f, t)) : [];
    const vc = new Map<string, (string | null)[]>(), vr = new Map<string, string[]>();
    for (const c of items) { const a = vc.get(c.budget_entry_id) ?? [null, null, null, null]; a[c.period_quarter - 1] = m(c.planned_amount); vc.set(c.budget_entry_id, a); }
    for (const r of vReal) { const a = vr.get(r.entry_id) ?? [...zero]; a[Number(r.quarter) - 1] = m(r.amount); vr.set(r.entry_id, a); }
    const ent: Record<string, StageLimit | null> = {};
    for (const e of rows) { const t = pick(e, vEntries); ent[e.id] = t ? { pagu: m(t.amount), cash: vc.get(t.id) ?? [null, null, null, null], realized: vr.get(t.id) ?? [...zero] } : null; }
    const rr2 = new Map<string, string>(vRupReal.map((r: any) => [r.rup_id, m(r.amount)])), rp: StageData["rups"] = {};
    for (const r of vRups) rp[r.rup_code] = { pagu: m(r.pagu), realized: rr2.get(r.id) ?? "0.00" };
    stageData[w.id] = { cashPrepared: items.length > 0, entries: ent, rups: rp };
  }
  return { entries, rups: rupList, methods: methodList, providers, allocByRup, hasCashPlan: !!plan, windows, stageData, currentStageId: versionId };
}
