import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { loadCashEntries } from "@/lib/server/cash-data";
import { fetchAll } from "@/lib/server/fetch-all";
import { CashGrid } from "@/components/cash-grid";
import { CashUpload } from "@/components/cash-upload";
import { Icon } from "@/components/icons";
import { cashWarnings, monthToQuarter, QUARTER_LABELS, quarterTotals, type CashItem } from "@/lib/cash";
import { parseRupiah } from "@/lib/import/parse";
import { fromCents, percent, toCents } from "@/lib/money";
import { can } from "@/lib/rbac";
import { rp } from "@/lib/format";
export const metadata = { title: "Anggaran kas" };

export default async function KasPage() {
  const [ctx, s] = await Promise.all([getBudgetContext(), getSession()]);
  if (!s) return null;
  if (!ctx?.versionId) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), vid = ctx.versionId, m = (v: unknown) => parseRupiah(v) ?? "0.00", canEdit = can(s.roles, "cash:write");
  let loaded: Awaited<ReturnType<typeof loadCashEntries>>;
  try { loaded = await loadCashEntries(sb, vid); } catch {
    return <div role="alert" className="alert alert-warn max-w-2xl space-y-1"><p className="font-semibold">Anggaran kas belum dapat dimuat.</p>
      <p>Kemungkinan besar migrasi database <b>20260107000000_cash_quarterly.sql</b> belum dijalankan. Buka Supabase &gt; SQL Editor, tempel isi berkas itu (folder <code>supabase/migrations</code>), klik Run, lalu muat ulang halaman ini.</p></div>;
  }
  const { entries, sourceDoc } = loaded;
  const [pk, al] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("procurement_packages").select("id, name, due_date, rup_package_id").eq("budget_version_id", vid).order("id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("package_budget_allocations").select("id, rup_package_id, budget_entry_id, amount, rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", vid).order("id").range(f, t))]);
  const cash: CashItem[] = entries.flatMap((e) => e.q.map((v, i) => (v === null ? null : { entryId: e.id, quarter: i + 1, planned: v })).filter((x): x is CashItem => x !== null));
  const pkgs = pk.filter((p) => p.rup_package_id).map((p) => ({ id: p.id as string, name: p.name as string,
    dueQuarter: p.due_date && Number(p.due_date.slice(0, 4)) === ctx.year ? monthToQuarter(Number(p.due_date.slice(5, 7))) : null,
    allocations: al.filter((a) => a.rup_package_id === p.rup_package_id).map((a) => ({ entryId: a.budget_entry_id as string, amount: m(a.amount) })) }));
  const warnings = cashWarnings(entries.map((e) => ({ id: e.id, amount: e.pagu })), cash, pkgs), q = quarterTotals(cash);
  const totalKas = fromCents(q.reduce((a, v) => a + toCents(v), 0n)), totalPagu = fromCents(entries.reduce((a, e) => a + toCents(e.pagu), 0n)), pct = percent(totalKas, totalPagu);
  const label = new Map(entries.map((e) => [e.id, `${e.subCode} / ${e.accCode}: ${e.desc}`]));
  const kind = (t: string) => (t === "exceeds_pagu" ? "Melebihi pagu" : t === "cash_not_ready" ? "Kas belum selaras" : "Tanpa jadwal");
  return (
    <section className="max-w-[90rem] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Penganggaran</p><h1 className="page-title">Anggaran kas <span className="page-sub">Tahun {ctx.year} · {ctx.stageName}</span></h1>
          <p className="page-desc">Rencana kas per <b>triwulan</b> untuk setiap Program, Kegiatan, Sub Kegiatan, dan Belanja. Ini rencana yang Anda masukkan, bukan saldo kas bank. Peringatan hanya alat bantu pengendalian.{sourceDoc && <> Sumber terakhir: <b>{sourceDoc}</b>.</>}</p></div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/templates/kas" className="btn btn-ghost btn-sm"><Icon name="download" className="h-4 w-4" />Template/ekspor Excel</a>
          <Link href="/laporan/anggaran-kas" className="btn btn-ghost btn-sm"><Icon name="printer" className="h-4 w-4" />Cetak laporan</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {q.map((v, i) => <div key={i} className="card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{QUARTER_LABELS[i]}</p><p className="mt-1 font-display text-lg font-bold tabular-nums text-navy-800">{rp(v)}</p></div>)}
        <div className="rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 p-4 text-white shadow-card"><p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Total kas</p><p className="mt-1 font-display text-lg font-bold tabular-nums">{rp(totalKas)}</p></div>
        <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-indigo-50 p-4 shadow-card"><p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Kas / pagu</p><p className="mt-1 font-display text-lg font-bold tabular-nums text-navy-800">{pct === null ? "N/A" : `${pct.replace(".", ",")}%`}</p><p className="text-xs text-slate-600">Pagu {rp(totalPagu)}</p></div>
      </div>
      {!entries.length ? <p className="alert alert-info max-w-xl">Belum ada rekening anggaran. Impor anggaran lebih dulu di menu Impor anggaran.</p> : <>
        {canEdit ? <CashUpload /> : <p className="alert alert-info max-w-3xl">Peran Anda hanya dapat melihat anggaran kas. Pengisian dilakukan Super Admin, Admin OPD, atau PPBJ.</p>}
        <details className="card p-4" open={warnings.length > 0 && warnings.length <= 8}>
          <summary className="cursor-pointer font-display font-bold text-navy-800">Peringatan ({warnings.length})</summary>
          {warnings.length ? <ul className="mt-3 space-y-1.5 text-sm">{warnings.slice(0, 50).map((w, i) => <li key={i} className="alert alert-warn py-2"><b>{kind(w.type)}:</b> {w.type === "exceeds_pagu" ? `${label.get(w.refId) ?? ""}: ${w.message}` : w.message}</li>)}{warnings.length > 50 && <li className="text-xs text-slate-600">Menampilkan 50 peringatan pertama dari {warnings.length}.</li>}</ul>
            : <p className="mt-2 text-sm text-slate-600">Tidak ada peringatan.</p>}
        </details>
        <div><h2 className="mb-1">{canEdit ? "Input manual per triwulan" : "Rincian per triwulan"}</h2>
          {canEdit && <p className="mb-3 text-sm text-slate-600">Ketik nilai pada kolom TW I-IV (format 1.500.000,00 atau 1500000). Tombol <b>÷4</b> membagi pagu rata. Perubahan baru tersimpan setelah menekan <b>Simpan perubahan</b>; sel yang dikosongkan menghapus nilai triwulan itu.</p>}
          <CashGrid entries={entries} canEdit={canEdit} /></div></>}
    </section>
  );
}
