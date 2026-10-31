import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { loadRealizationForm } from "@/lib/server/realization-form-data";
import { loadRealizationTotals } from "@/lib/server/realization-totals";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { TransactionForm } from "@/components/transaction-form";
import { RealisasiUpload } from "@/components/realisasi-upload";
import { StageDatesForm } from "@/components/stage-dates-form";
import { rp } from "@/lib/format";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { parseRupiah } from "@/lib/import/parse";
import { updatePaymentInfo, verifyTransaction } from "./actions";
import { deleteTxImportJob, verifyTxImportJob } from "./unggah-actions";

export const maxDuration = 60; // unggahan besar (pratinjau + penerapan) membutuhkan beberapa detik
const PAGE = 25;
type SP = { tab?: string; status?: string; pay?: string; proses?: string; page?: string; error?: string };
const pill = (on: boolean) => `rounded-full border px-4 py-1.5 text-sm font-semibold transition ${on ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;
const Skeleton = ({ h = "h-40" }: { h?: string }) => <div className={`card ${h} animate-pulse bg-slate-100`} role="status" aria-label="Memuat" />;

// ---------- tab: input manual (memuat seluruh rekening/RUP/paket; di-stream) ----------
async function ManualTab({ sb, vid, year }: { sb: SupabaseClient; vid: string; year: number }) {
  const form = await loadRealizationForm(sb, vid);
  return form.entries.length ? <TransactionForm year={year} entries={form.entries} rups={form.rups} methods={form.methods} allocByRup={form.allocByRup} hasCashPlan={form.hasCashPlan} />
    : <p className="alert alert-warn">Belum ada rekening anggaran. Impor anggaran lebih dulu.</p>;
}

// ---------- tab: unggah ----------
async function UnggahTab({ sb, yearId, year, canSetStage }: { sb: SupabaseClient; yearId: string; year: number; canSetStage: boolean }) {
  const versions = await loadStageVersions(sb, yearId);
  return <div className="space-y-5"><RealisasiUpload /><StageDatesForm year={year} versions={versions} canEdit={canSetStage} /></div>;
}

// ---------- tab: daftar transaksi ----------
const LEGACY = "id, transaction_date, amount, verification_status, budget_entries(description, subactivities(code), expenditure_accounts(code)), rup_packages(rup_code)";
const FULL = `${LEGACY}, payment_date, payment_number, payment_status, procurement_method_id, procurement_methods(name)`;
const label = (r: any) => r.budget_entries ? `${r.budget_entries.subactivities?.code ?? ""} / ${r.budget_entries.expenditure_accounts?.code ?? ""}: ${r.budget_entries.description}` : "-";
async function DaftarTab({ sb, vid, sp, canWrite }: { sb: SupabaseClient; vid: string; sp: SP; canWrite: boolean }) {
  const status = sp.status === "verified" || sp.status === "unverified" ? sp.status : "", pay = sp.pay === "sudah" || sp.pay === "belum" ? sp.pay : "", proses = sp.proses === "pengadaan" || sp.proses === "non" ? sp.proses : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const build = (cols: string, filters: boolean) => {
    let q = sb.from("transactions").select(cols, { count: "exact" }).eq("budget_version_id", vid).order("transaction_date", { ascending: false }).order("id").range((page - 1) * PAGE, page * PAGE - 1);
    if (status) q = q.eq("verification_status", status);
    if (filters && pay) q = q.eq("payment_status", pay);
    if (filters && proses === "pengadaan") q = q.or("rup_package_id.not.is.null,procurement_method_id.not.is.null");
    if (filters && proses === "non") q = q.is("rup_package_id", null).is("procurement_method_id", null);
    return q;
  };
  let tx: any = await build(FULL, true), legacy = false;
  if (tx.error) { tx = await build(LEGACY, false); legacy = true; }       // migrasi 20260113 belum dijalankan: tetap tampil
  const rows: any[] = tx.data ?? [], pages = Math.max(1, Math.ceil((tx.count ?? 0) / PAGE));
  const qs = (o: Record<string, string>) => new URLSearchParams({ tab: "daftar", ...Object.fromEntries(Object.entries(o).filter(([, v]) => v)) });
  const href = (o: Partial<SP>) => `/realisasi?${qs({ status, pay, proses, ...o, page: "1" } as Record<string, string>)}`;
  const pageHref = (p: number) => `/realisasi?${qs({ status, pay, proses, page: String(p) })}`;
  const group = (title: string, key: "status" | "pay" | "proses", cur: string, opts: [string, string][]) => (
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
      {opts.map(([v, l]) => <Link key={v} href={href({ [key]: v })} className={pill(v === cur)} aria-current={v === cur ? "true" : undefined}>{l}</Link>)}</div>);
  return (
    <div className="space-y-3">
      {sp.error === "payment" && <p role="alert" className="alert alert-error">Perubahan SPM/SP2D ditolak. Transaksi terverifikasi hanya dapat dilengkapi bagian yang masih kosong.</p>}
      {sp.error === "stage" && <p role="alert" className="alert alert-error">Tanggal SPM/SP2D itu masuk tahapan anggaran yang lain. Pemindahan tahapan dilakukan lewat tab Unggah (baris yang sama diunggah ulang dengan tanggal baru).</p>}
      <div className="space-y-2" role="group" aria-label="Filter">
        {group("Verifikasi", "status", status, [["", "Semua"], ["unverified", "Belum diverifikasi"], ["verified", "Terverifikasi"]])}
        {!legacy && group("SPM/SP2D", "pay", pay, [["", "Semua"], ["sudah", "Sudah ada"], ["belum", "Belum ada"]])}
        {!legacy && group("Proses", "proses", proses, [["", "Semua"], ["pengadaan", "Pengadaan"], ["non", "Non-pengadaan"]])}
      </div>
      {tx.error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat.</p> : !rows.length ? <p className="text-slate-600">Belum ada transaksi{status || pay || proses ? " dengan filter ini" : ""}.</p> : (
        <div className="table-wrap"><table><thead><tr><th>Tgl transaksi</th>{!legacy && <th>Tanggal / No SPM-SP2D</th>}<th>Rekening</th><th>RUP / metode</th><th className="text-right">Nilai</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => { const locked = r.verification_status === "verified" && r.payment_date && r.payment_number; return (
            <tr key={r.id}><td className="whitespace-nowrap">{fmtDate(r.transaction_date)}</td>
              {!legacy && <td className="min-w-44 text-sm">
                {r.payment_date || r.payment_number ? <>{r.payment_date ? fmtDate(r.payment_date) : <span className="text-slate-500">tanggal belum diisi</span>}<span className="block text-xs text-slate-600">{r.payment_number ?? "nomor belum diisi"}</span></> : <span className="text-slate-500">belum ada SPM/SP2D</span>}
                {canWrite && !locked && <details className="mt-1"><summary className="link cursor-pointer text-xs">{r.payment_date && r.payment_number ? "Ubah" : "Lengkapi"}</summary>
                  <form action={updatePaymentInfo} className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2"><input type="hidden" name="id" value={r.id} />
                    {(!r.payment_date || r.verification_status !== "verified") && <label className="block text-xs">Tanggal SPM/SP2D<input type="date" name="payment_date" defaultValue={r.payment_date ?? ""} className="mt-0.5 w-full py-1" /></label>}
                    {(!r.payment_number || r.verification_status !== "verified") && <label className="block text-xs">No SPM/SP2D<input name="payment_number" defaultValue={r.payment_number ?? ""} maxLength={100} className="mt-0.5 w-full py-1" /></label>}
                    <button className="btn btn-ghost btn-sm">Simpan</button></form></details>}</td>}
              <td className="min-w-48 text-sm">{label(r)}</td>
              <td className="text-sm">{r.rup_packages?.rup_code ? <>RUP {r.rup_packages.rup_code}</> : <span className="text-slate-500">{r.procurement_methods?.name ? "Tanpa RUP" : "Non-pengadaan"}</span>}{r.procurement_methods?.name && <span className="block text-xs text-slate-600">{r.procurement_methods.name}</span>}</td>
              <td className={`text-right tabular-nums ${Number(r.amount) < 0 ? "text-amber-800" : ""}`}>{rp(r.amount)}{Number(r.amount) < 0 && <span className="block text-xs">koreksi</span>}</td>
              <td>{r.verification_status === "verified" ? <span className="badge badge-ok">Terverifikasi</span> : <form action={verifyTransaction} className="flex items-center gap-2"><span className="badge badge-warn">Belum</span><input type="hidden" name="id" value={r.id} /><button className="link">Verifikasi</button></form>}</td></tr>); })}</tbody></table></div>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={pageHref(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="link" href={pageHref(page + 1)}>Berikutnya</Link>}</nav>
    </div>);
}

// ---------- tab: riwayat unggahan ----------
async function RiwayatTab({ sb, canVerify }: { sb: SupabaseClient; canVerify: boolean }) {
  const { data: jobs } = await sb.from("import_jobs").select("id, file_name, status, total_rows, ok_rows, error_rows, created_by, created_at").eq("kind", "transactions").order("created_at", { ascending: false }).limit(30);
  const list = jobs ?? [], ids = list.map((j) => j.id), uids = [...new Set(list.map((j) => j.created_by).filter(Boolean))] as string[];
  const [stats, people] = await Promise.all([
    ids.length ? sb.rpc("import_job_stats", { p_jobs: ids }) : Promise.resolve({ data: [] as any[] }),
    uids.length ? sb.from("profiles").select("id, full_name").in("id", uids) : Promise.resolve({ data: [] as any[] })]);
  const st = new Map((stats.data ?? []).map((x: any) => [x.job_id, x])), who = new Map((people.data ?? []).map((p: any) => [p.id, p.full_name]));
  if (!list.length) return <p className="text-slate-600">Belum ada unggahan realisasi.</p>;
  return (
    <div className="table-wrap"><table><thead><tr><th>Waktu</th><th>File</th><th>Diunggah oleh</th><th>Baris</th><th>Status</th><th className="text-right">Tercatat</th><th>Tindakan</th></tr></thead>
      <tbody>{list.map((j) => { const s: any = st.get(j.id), n = Number(s?.tx_count ?? 0), un = Number(s?.unverified_count ?? 0); return (
        <tr key={j.id}><td className="whitespace-nowrap text-sm">{fmtDateTime(j.created_at)}</td><td className="text-sm">{j.file_name}</td><td className="text-sm">{who.get(j.created_by) ?? "-"}</td>
          <td className="text-sm">{j.ok_rows} valid{j.error_rows ? `, ${j.error_rows} bermasalah` : ""} dari {j.total_rows}</td>
          <td>{j.status === "confirmed" ? <span className="badge badge-ok">Diterapkan</span> : <span className="badge badge-off">Belum diterapkan</span>}</td>
          <td className="text-right text-sm tabular-nums">{j.status === "confirmed" ? <>{n} transaksi<br /><span className="text-xs text-slate-500">{rp(parseRupiah(s?.total) ?? "0.00")}</span></> : "-"}</td>
          <td className="text-sm">{j.status !== "confirmed"
            ? <form action={deleteTxImportJob}><input type="hidden" name="jobId" value={j.id} /><button className="link">Hapus</button></form>
            : un > 0 ? (canVerify ? <form action={verifyTxImportJob}><input type="hidden" name="jobId" value={j.id} /><button className="link">Verifikasi {un} transaksi</button></form> : <span className="text-slate-600">{un} menunggu verifikasi admin</span>)
            : n > 0 ? <span className="text-emerald-700">Semua terverifikasi</span> : "-"}</td></tr>); })}</tbody></table></div>);
}

export default async function RealisasiPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams, ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), vid = ctx.versionId;
  const [{ totals: t, overPaguCount }, session] = await Promise.all([loadRealizationTotals(sb, vid), getSession()]);
  const canWrite = !!session && can(session.roles, "realization:write"), canAdmin = !!session && can(session.roles, "budget-setup:write");
  const tabs: [string, string][] = canWrite ? [["unggah", "Unggah Excel/CSV"], ["manual", "Input manual"], ["daftar", "Daftar transaksi"], ["riwayat", "Riwayat unggahan"]] : [["daftar", "Daftar transaksi"]];
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : tabs[0]![0];
  const cards: [string, string][] = [["Total pagu rekening", rp(t.pagu)], ["Realisasi terverifikasi", rp(t.verified)], ["Belum diverifikasi", rp(t.unverified)], ["Sisa pagu", rp(t.remaining)], ["Persentase realisasi", t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`]];
  return (
    <section className="max-w-6xl space-y-5">
      <div><h1 className="page-title">Input Realisasi <span className="page-sub">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        <p className="text-sm text-slate-600">Catat realisasi paling cepat dengan <b>unggah Excel/CSV</b>: sistem menentukan tahapan anggaran dari tanggal SPM/SP2D (atau tanggal transaksi) dan menautkan kode RUP. Angka di bawah untuk tahapan yang dipilih di bagian atas layar; persentase dihitung dari transaksi terverifikasi.
          {" "}<Link className="link" href="/paket">Proses pengadaan &rarr;</Link></p></div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{cards.map(([k, v]) => <div key={k} className="card p-3"><p className="text-xs text-slate-600">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>)}</div>
      <p className="text-sm text-slate-600">{t.txCount} transaksi, {t.unverifiedCount} belum diverifikasi. {overPaguCount > 0 && <b className="text-amber-900">Ada {overPaguCount} rekening dengan total transaksi melampaui pagu.</b>}</p>
      {sp.error && <p role="alert" className="alert alert-error">Verifikasi gagal. Hanya admin yang dapat memverifikasi, dan transaksi harus belum terverifikasi.</p>}
      {tabs.length > 1 && <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" aria-label="Bagian Input Realisasi">{tabs.map(([k, l]) => <Link key={k} href={`/realisasi?tab=${k}`} className={pill(k === tab)} aria-current={k === tab ? "page" : undefined}>{l}</Link>)}</nav>}
      {tab === "unggah" && <Suspense fallback={<Skeleton h="h-72" />}><UnggahTab sb={sb} yearId={ctx.yearId} year={ctx.year} canSetStage={canAdmin} /></Suspense>}
      {tab === "manual" && <Suspense fallback={<Skeleton />}><ManualTab sb={sb} vid={vid} year={ctx.year} /></Suspense>}
      {tab === "daftar" && <Suspense fallback={<Skeleton h="h-72" />}><DaftarTab sb={sb} vid={vid} sp={sp} canWrite={canWrite} /></Suspense>}
      {tab === "riwayat" && <Suspense fallback={<Skeleton h="h-72" />}><RiwayatTab sb={sb} canVerify={canAdmin} /></Suspense>}
    </section>);
}
