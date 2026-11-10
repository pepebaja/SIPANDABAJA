import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { loadCashEntries } from "@/lib/server/cash-data";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { quarterOf, QUARTER_MONTHS, stageWindows } from "@/lib/stage-rule";
import { fetchAll } from "@/lib/server/fetch-all";
import { CashGrid } from "@/components/cash-grid";
import { CashUpload } from "@/components/cash-upload";
import { CashCopy } from "@/components/cash-copy";
import { Icon } from "@/components/icons";
import { cashWarnings, monthToQuarter, QUARTER_LABELS, quarterTotals, type CashItem } from "@/lib/cash";
import { parseRupiah } from "@/lib/import/parse";
import { fromCents, percent, toCents } from "@/lib/money";
import { can } from "@/lib/rbac";
import { rp } from "@/lib/format";
export const metadata = { title: "Anggaran kas" };

export default async function KasPage({ searchParams }: { searchParams: Promise<{ tahap?: string }> }) {
  const [ctx, s, sp] = await Promise.all([getBudgetContext(), getSession(), searchParams]);
  if (!s) return null;
  if (!ctx?.versionId) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), m = (v: unknown) => parseRupiah(v) ?? "0.00", canEdit = can(s.roles, "cash:write");
  // Satu form untuk semua tahapan: tahapan dipilih di halaman ini (?tahap=), bawaannya tahapan konteks. Tahapan menurut tanggal penetapan.
  const versions = await loadStageVersions(sb, ctx.yearId), windows = stageWindows(versions, ctx.year);
  const vid = sp.tahap && versions.some((v) => v.id === sp.tahap) ? sp.tahap : ctx.versionId, selV = versions.find((v) => v.id === vid), selW = windows.find((w) => w.id === vid) ?? null;
  const stageName = selV?.stageName ?? ctx.stageName, stageLabel = (w: { name: string; versionNo: number }) => (w.versionNo > 1 ? `${w.name} (versi ${w.versionNo})` : w.name);
  const cashCounts = await Promise.all((windows.length ? windows.map((w) => w.id) : [vid]).map(async (id) => [id, (await sb.from("cash_plan_items").select("id, cash_plans!inner(budget_version_id)", { count: "exact", head: true }).eq("cash_plans.budget_version_id", id)).count ?? 0] as const));
  const cashCount = new Map(cashCounts);
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
  // Penyesuaian kas: kas kumulatif tahapan ini harus menutup realisasi kumulatif (termasuk tahapan sebelumnya) pada tiap triwulan.
  const rq = await fetchAll<any>((f, t) => sb.rpc("realization_by_entry_quarter", { p_version: vid }).order("entry_id").order("quarter").range(f, t)).catch(() => [] as any[]);
  const realBy = new Map<string, bigint[]>(); for (const r of rq) { const a = realBy.get(r.entry_id) ?? [0n, 0n, 0n, 0n]; a[Number(r.quarter) - 1] = toCents(m(r.amount)); realBy.set(r.entry_id, a); }
  const realQ = [0n, 0n, 0n, 0n]; for (const a of realBy.values()) a.forEach((v, i) => { realQ[i]! += v; });
  const adjust = entries.flatMap((e) => { const rl = realBy.get(e.id); if (!rl) return []; let cc = 0n, rc = 0n;
    for (let k = 0; k < 4; k++) { cc += e.q[k] === null ? 0n : toCents(e.q[k]!); rc += rl[k]!; if (rc > cc) return [{ id: e.id, quarter: k + 1, cash: fromCents(cc), real: fromCents(rc) }]; } return []; });
  const warnings = cashWarnings(entries.map((e) => ({ id: e.id, amount: e.pagu })), cash, pkgs), q = quarterTotals(cash);
  const totalKas = fromCents(q.reduce((a, v) => a + toCents(v), 0n)), totalPagu = fromCents(entries.reduce((a, e) => a + toCents(e.pagu), 0n)), pct = percent(totalKas, totalPagu);
  const label = new Map(entries.map((e) => [e.id, `${e.subCode} / ${e.accCode}: ${e.desc}`]));
  const kind = (t: string) => (t === "exceeds_pagu" ? "Melebihi pagu" : t === "cash_not_ready" ? "Kas belum selaras" : "Tanpa jadwal");
  return (
    <section className="max-w-[90rem] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Penganggaran</p><h1 className="page-title">Anggaran kas <span className="page-sub">Tahun {ctx.year} · {stageName}</span></h1>
          <p className="page-desc">Rencana kas per <b>triwulan</b> untuk setiap Program, Kegiatan, Sub Kegiatan, dan Belanja. Ini rencana yang Anda masukkan, bukan saldo kas bank. Peringatan hanya alat bantu pengendalian.{sourceDoc && <> Sumber terakhir: <b>{sourceDoc}</b>.</>}</p></div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/templates/kas?tahap=${vid}`} className="btn btn-ghost btn-sm"><Icon name="download" className="h-4 w-4" />Template/ekspor Excel</a>
          <Link href="/laporan/anggaran-kas" className="btn btn-ghost btn-sm"><Icon name="printer" className="h-4 w-4" />Cetak laporan</Link>
        </div>
      </div>
      <div className="card space-y-3 p-4" aria-label="Tahapan anggaran">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base">Tahapan yang disusun kasnya</h2>
          <p className="text-xs text-slate-600">Satu form untuk Murni, Pergeseran, dan Perubahan. Tahapan transaksi ditentukan tanggal penetapan tahapan terhadap tanggal SPM/SP2D (atau tanggal transaksi).</p></div>
        <nav className="grid gap-2 md:grid-cols-3" aria-label="Pilih tahapan">
          {(windows.length ? windows : versions.map((v) => ({ id: v.id, name: v.stageName, versionNo: v.versionNo, start: "", end: "", code: v.stageCode }))).map((w) => {
            const n = cashCount.get(w.id) ?? 0, qa = w.start ? quarterOf(w.start) : null, qb = w.end ? quarterOf(w.end) : null, on = w.id === vid;
            return (<Link key={w.id} href={`/kas?tahap=${w.id}`} aria-current={on ? "page" : undefined} className={`rounded-xl border p-3 text-sm transition ${on ? "border-cyan-700 bg-cyan-50 ring-1 ring-cyan-700" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
              <span className="flex items-center justify-between gap-2 font-semibold text-navy-800">{stageLabel(w)}<span className={`badge ${n ? "badge-ok" : "badge-warn"}`}>{n ? `Kas terisi (${n} sel)` : "Kas belum disusun"}</span></span>
              {w.start && <span className="mt-1 block text-xs text-slate-600">Ditetapkan {w.start}; berlaku s.d. {w.end}{qa && qb ? ` · TW ${qa === qb ? qa : `${qa}-${qb}`}` : ""}</span>}
            </Link>); })}</nav>
        <p className="text-xs text-slate-600">Triwulan: <b>I</b> {QUARTER_MONTHS[0]} · <b>II</b> {QUARTER_MONTHS[1]} · <b>III</b> {QUARTER_MONTHS[2]} · <b>IV</b> {QUARTER_MONTHS[3]}. Contoh: transaksi 14 Maret masuk TW I tahapan Murni; transaksi 5 Oktober masuk TW IV tahapan Pergeseran (bila Perubahan baru ditetapkan 27 Oktober). Tanggal penetapan tahapan diatur di Input Realisasi &gt; Unggah (panel Aturan tahapan anggaran).
          {selW && !cashCount.get(vid) && <> <b className="text-amber-800">Kas tahapan {stageName} belum disusun: pembayaran bertanggal {selW.start} s.d. {selW.end} ditolak sampai kas diisi. Gunakan <i>Salin dari tahapan sebelumnya</i> lalu sesuaikan.</b></>}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {q.map((v, i) => <div key={i} className="card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{QUARTER_LABELS[i]}</p><p className="mt-1 font-display text-lg font-bold tabular-nums text-navy-800">{rp(v)}</p></div>)}
        <div className="rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 p-4 text-white shadow-card"><p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Total kas</p><p className="mt-1 font-display text-lg font-bold tabular-nums">{rp(totalKas)}</p></div>
        <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-indigo-50 p-4 shadow-card"><p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Kas / pagu</p><p className="mt-1 font-display text-lg font-bold tabular-nums text-navy-800">{pct === null ? "N/A" : `${pct.replace(".", ",")}%`}</p><p className="text-xs text-slate-600">Pagu {rp(totalPagu)}</p></div>
      </div>
      {!entries.length ? <p className="alert alert-info max-w-xl">Belum ada rekening anggaran. Impor anggaran lebih dulu di menu Impor anggaran.</p> : <>
        {canEdit ? <><CashCopy stageName={stageName} versionId={vid} /><CashUpload versionId={vid} /></> : <p className="alert alert-info max-w-3xl">Peran Anda hanya dapat melihat anggaran kas. Pengisian dilakukan Super Admin, Admin OPD, atau PPBJ.</p>}
        <details className="card p-4" open={adjust.length > 0 && adjust.length <= 8}>
          <summary className="cursor-pointer font-display font-bold text-navy-800">Penyesuaian kas terhadap realisasi ({adjust.length})</summary>
          <div className="mt-3 overflow-x-auto"><table className="cash-table"><thead><tr><th>Triwulan</th>{QUARTER_LABELS.slice(0, 4).map((t) => <th key={t} className="text-right">{t}</th>)}</tr></thead>
            <tbody><tr><td>Kas {stageName} (triwulan)</td>{q.slice(0, 4).map((v, i) => <td key={i} className="text-right tabular-nums">{rp(v)}</td>)}</tr>
              <tr><td>Realisasi (triwulan, kumulatif tahapan)</td>{realQ.map((v, i) => <td key={i} className="text-right tabular-nums">{rp(fromCents(v))}</td>)}</tr>
              <tr className="font-semibold"><td>Sisa kas kumulatif</td>{[0, 1, 2, 3].map((k) => { const c = q.slice(0, k + 1).reduce((a, v) => a + toCents(v), 0n) - realQ.slice(0, k + 1).reduce((a, v) => a + v, 0n); return <td key={k} className={`text-right tabular-nums ${c < 0n ? "text-red-700" : ""}`}>{rp(fromCents(c))}</td>; })}</tr></tbody></table></div>
          {adjust.length ? <><p className="mt-3 text-sm text-slate-700">Rekening berikut sudah terealisasi lebih besar daripada kas kumulatif tahapan {stageName} sampai triwulan tersebut. Sesuaikan kas (mis. triwulan yang sudah berjalan mengikuti realisasi) agar pembayaran berikutnya tidak tertolak.</p>
            <ul className="mt-2 space-y-1.5 text-sm">{adjust.slice(0, 30).map((a) => <li key={a.id} className="alert alert-warn py-2"><b>TW {a.quarter}:</b> {label.get(a.id) ?? ""}: kas kumulatif {rp(a.cash)} &lt; realisasi kumulatif {rp(a.real)}</li>)}{adjust.length > 30 && <li className="text-xs text-slate-600">dan {adjust.length - 30} lainnya.</li>}</ul></>
            : <p className="mt-2 text-sm text-slate-600">Kas kumulatif tahapan ini sudah menutup realisasi pada semua triwulan.</p>}
        </details>
        <details className="card p-4" open={warnings.length > 0 && warnings.length <= 8}>
          <summary className="cursor-pointer font-display font-bold text-navy-800">Peringatan ({warnings.length})</summary>
          {warnings.length ? <ul className="mt-3 space-y-1.5 text-sm">{warnings.slice(0, 50).map((w, i) => <li key={i} className="alert alert-warn py-2"><b>{kind(w.type)}:</b> {w.type === "exceeds_pagu" ? `${label.get(w.refId) ?? ""}: ${w.message}` : w.message}</li>)}{warnings.length > 50 && <li className="text-xs text-slate-600">Menampilkan 50 peringatan pertama dari {warnings.length}.</li>}</ul>
            : <p className="mt-2 text-sm text-slate-600">Tidak ada peringatan.</p>}
        </details>
        <div><h2 className="mb-1">{canEdit ? "Input manual per triwulan" : "Rincian per triwulan"}</h2>
          {canEdit && <p className="mb-3 text-sm text-slate-600">Ketik nilai pada kolom TW I-IV (format 1.500.000,00 atau 1500000). Tombol <b>÷4</b> membagi pagu rata. Perubahan baru tersimpan setelah menekan <b>Simpan perubahan</b>; sel yang dikosongkan menghapus nilai triwulan itu.</p>}
          <CashGrid key={vid} entries={entries} canEdit={canEdit} versionId={vid} /></div></>}
    </section>
  );
}
