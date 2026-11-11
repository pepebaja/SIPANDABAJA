import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { loadStageVersions } from "./stage-versions";
import { parseRupiah } from "@/lib/import/parse";
import { aggregateLevels, byStage, quarterSeries, type DashEntry, type DashIds, type DashTx } from "@/lib/dashboard-data";

const NEST = "subactivities(id, code, name, activities(id, code, name, programs(id, code, name))), expenditure_accounts(code)";
const ids = (e: any): DashIds => { const s = e?.subactivities, a = s?.activities, p = a?.programs;
  return { progId: p?.id ?? "-", progCode: p?.code ?? "-", progName: p?.name ?? "(tanpa program)", actId: a?.id ?? "-", actCode: a?.code ?? "-", actName: a?.name ?? "(tanpa kegiatan)", subId: s?.id ?? "-", subCode: s?.code ?? "-", subName: s?.name ?? "(tanpa sub kegiatan)", accCode: e?.expenditure_accounts?.code ?? "5.0.00" }; };
const m = (v: unknown) => parseRupiah(v) ?? "0.00";

/** Data tambahan Dashboard: agregasi per program/kegiatan/sub/jenis belanja, kas vs realisasi per triwulan, tahapan, peringatan, dan transaksi terbaru. */
export async function loadDashboardExtra(sb: SupabaseClient, vid: string, yearId: string) {
  const versions = await loadStageVersions(sb, yearId), cur = versions.find((v) => v.id === vid);
  const vids = versions.filter((v) => v.id === vid || (cur && v.sortOrder < cur.sortOrder)).map((v) => v.id), scope = vids.length ? vids : [vid], stageOf = new Map(versions.map((v) => [v.id, v.stageName]));
  const count = async (build: (q: any) => any) => { const r = await build(sb.from("transactions").select("id", { count: "exact", head: true }).in("budget_version_id", scope)); return r.error ? null : (r.count ?? 0) as number; };
  const [entries, txs, cashItems, rq, noSpm, noMethod, noProvider, recent] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("budget_entries").select(`amount, ${NEST}`).eq("budget_version_id", vid).order("id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("transactions").select(`amount, budget_version_id, budget_entries(${NEST})`).in("budget_version_id", scope).not("payment_date", "is", null).order("id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("cash_plan_items").select("period_quarter, planned_amount, cash_plans!inner(budget_version_id)").eq("cash_plans.budget_version_id", vid).order("id").range(f, t)),
    fetchAll<any>((f, t) => sb.rpc("realization_by_entry_quarter", { p_version: vid }).order("entry_id").order("quarter").range(f, t)).catch(() => [] as any[]),
    count((q) => q.not("payment_date", "is", null).is("payment_number", null)),
    count((q) => q.not("rup_package_id", "is", null).is("procurement_method_id", null)),
    count((q) => q.is("provider_id", null).or("rup_package_id.not.is.null,procurement_method_id.not.is.null")),   // null bila migrasi penyedia belum dijalankan
    sb.from("transactions").select("id, transaction_date, amount, payment_date, budget_entries(description, subactivities(code))").in("budget_version_id", scope).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(6)]);
  const dEntries: DashEntry[] = entries.map((e) => ({ ...ids(e), amount: m(e.amount) }));
  const dTx: DashTx[] = txs.map((t) => ({ ...ids(t.budget_entries), amount: m(t.amount), stage: stageOf.get(t.budget_version_id) ?? "-" }));
  const cashQ: [number, number][] = cashItems.map((c) => [Number(c.period_quarter), Number(c.planned_amount)]), realQ: [number, number][] = rq.map((r: any) => [Number(r.quarter), Number(r.amount)]);
  return { levels: aggregateLevels(dEntries, dTx), stages: byStage(dTx), quarters: quarterSeries(cashQ, realQ), hasCash: cashItems.length > 0,
    alerts: { noSpm, noMethod, noProvider },
    recent: ((recent.data ?? []) as any[]).map((r) => ({ id: r.id as string, date: r.transaction_date as string, amount: m(r.amount), recognized: !!r.payment_date, sub: (r.budget_entries?.subactivities?.code ?? "") as string, text: (r.budget_entries?.description ?? "") as string })) };
}
