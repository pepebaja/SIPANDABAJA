import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { loadEntries } from "@/lib/server/entries";
import { CashItemForm } from "@/components/cash-item-form";
import { cashWarnings, quarterTotals, type CashItem } from "@/lib/cash";
import { MONTHS } from "@/lib/allocations";
import { parseRupiah } from "@/lib/import/parse";
import { rp } from "@/lib/format";
import { deleteCashItem } from "./actions";
export default async function KasPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams, ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), vid = ctx.versionId, m = (v: unknown) => parseRupiah(v) ?? "0.00";
  const { data: plan } = await sb.from("cash_plans").select("id").eq("budget_version_id", vid).order("created_at").limit(1).maybeSingle();
  const [entries, items, pk, al] = await Promise.all([loadEntries(sb, vid),
    plan ? sb.from("cash_plan_items").select("id, budget_entry_id, period_month, planned_amount").eq("cash_plan_id", plan.id).order("period_month").limit(5000) : Promise.resolve({ data: [] as any[] }),
    sb.from("procurement_packages").select("id, name, due_date, rup_package_id").eq("budget_version_id", vid).limit(5000),
    sb.from("package_budget_allocations").select("rup_package_id, budget_entry_id, amount, rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", vid).limit(10000)]);
  const cash: CashItem[] = (items.data ?? []).map((i: any) => ({ entryId: i.budget_entry_id, month: i.period_month, planned: m(i.planned_amount) }));
  const pkgs = (pk.data ?? []).filter((p) => p.rup_package_id).map((p) => ({ id: p.id, name: p.name,
    dueMonth: p.due_date && Number(p.due_date.slice(0, 4)) === ctx.year ? Number(p.due_date.slice(5, 7)) : null,
    allocations: (al.data ?? []).filter((a) => a.rup_package_id === p.rup_package_id).map((a) => ({ entryId: a.budget_entry_id, amount: m(a.amount) })) }));
  const warnings = cashWarnings(entries.map((e) => ({ id: e.id, amount: m(e.amount) })), cash, pkgs), q = quarterTotals(cash);
  const label = new Map(entries.map((e) => [e.id, e.label]));
  return (
    <section className="max-w-5xl space-y-5">
      <div><h1 className="text-2xl font-semibold text-navy-800">Anggaran kas <span className="text-base font-normal text-slate-600">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        <p className="text-sm text-slate-600">Ini rencana kas yang Anda masukkan, bukan saldo kas bank. Peringatan hanya alat bantu pengendalian, bukan persetujuan atau penolakan pelaksanaan pengadaan.</p></div>
      {sp.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">Penghapusan gagal. Anda mungkin tidak berwenang.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{q.map((v, i) => <div key={i} className="rounded border bg-white p-3"><p className="text-xs text-slate-600">Triwulan {i + 1}</p><p className="font-semibold tabular-nums">{rp(v)}</p></div>)}</div>
      <div><h2 className="mb-1 font-semibold">Peringatan ({warnings.length})</h2>
        {warnings.length ? <ul className="space-y-1 text-sm">{warnings.map((w, i) => <li key={i} className="rounded bg-amber-50 p-2 text-amber-900"><b>{w.type === "exceeds_pagu" ? "Melebihi pagu" : w.type === "cash_not_ready" ? "Kas belum selaras" : "Tanpa jadwal"}:</b> {w.message}</li>)}</ul> : <p className="text-sm text-slate-600">Tidak ada peringatan dari data yang ada.</p>}</div>
      {items.data?.length ? <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-1">Rekening anggaran</th><th className="p-1">Bulan</th><th className="p-1 text-right">Rencana kas</th><th className="p-1">Aksi</th></tr></thead>
        <tbody>{items.data.map((i: any) => <tr key={i.id} className="border-b"><td className="p-1">{label.get(i.budget_entry_id) ?? "-"}</td><td className="p-1">{MONTHS[i.period_month - 1]}</td><td className="p-1 text-right">{rp(i.planned_amount)}</td>
          <td className="p-1"><form action={deleteCashItem}><input type="hidden" name="id" value={i.id} /><button className="underline">Hapus</button></form></td></tr>)}</tbody></table>
        : <p className="text-sm text-slate-600">Belum ada rencana kas. Isi lewat formulir di bawah.</p>}
      {entries.length ? <CashItemForm options={entries.map((e) => ({ value: e.id, label: e.label }))} /> : <p className="text-sm text-slate-600">Belum ada rekening anggaran. Impor anggaran lebih dulu.</p>}
    </section>);
}
