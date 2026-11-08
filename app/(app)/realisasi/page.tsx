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
import { effectiveStart } from "@/lib/stage-rule";
import { TransactionForm } from "@/components/transaction-form";
import { RealisasiUpload } from "@/components/realisasi-upload";
import { StageDatesForm } from "@/components/stage-dates-form";
import { rp } from "@/lib/format";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { parseRupiah } from "@/lib/import/parse";
import { updateTransaction, deleteTransaction, resetTransactions } from "./actions";
import { deleteTxImportJob } from "./unggah-actions";

export const maxDuration = 60; // unggahan besar (pratinjau + penerapan) membutuhkan beberapa detik
const PAGE = 25;
type SP = { reset?: string; tab?: string; pay?: string; proses?: string; page?: string; error?: string; msg?: string };
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

// ---------- tab: daftar transaksi (kumulatif: tahapan terpilih + tahapan sebelumnya) ----------
const SEL = "id, budget_version_id, transaction_date, amount, notes, payment_date, payment_number, payment_status, procurement_method_id, procurement_methods(name), budget_entries(description, subactivities(code), expenditure_accounts(code)), rup_packages(rup_code)";
const label = (r: any) => r.budget_entries ? `${r.budget_entries.subactivities?.code ?? ""} / ${r.budget_entries.expenditure_accounts?.code ?? ""}: ${r.budget_entries.description}` : "-";
const ERRORS: Record<string, string> = {
  payment: "Perubahan ditolak. Periksa isian (tanggal, nilai, nomor) dan hak akses Anda.",
  year: "Tanggal harus berada pada tahun anggaran yang dipilih.",
  move: "Tanggal itu memindahkan transaksi ke tahapan lain, tetapi rekening (subkegiatan + rekening + sumber dana) atau kode RUP padanannya tidak ditemukan/tidak unik pada tahapan tujuan. Tambahkan/impor rekening itu pada tahapan tujuan (menu Kelola anggaran) lebih dulu.",
  rup: "Kode RUP tidak ditemukan pada tahapan transaksi ini. Sinkronkan RUP tahapan tersebut (menu Paket RUP), atau kosongkan.",
  limit: "Perubahan ditolak karena melampaui batas pagu/anggaran kas.",
  stage: "Tidak ada tahapan anggaran yang berlaku pada tanggal itu. Periksa panel Aturan tahapan anggaran.",
  delete: "Transaksi tidak dapat dihapus. Anda mungkin tidak berwenang." };
async function DaftarTab({ sb, vid, yearId, sp, canWrite }: { sb: SupabaseClient; vid: string; yearId: string; sp: SP; canWrite: boolean }) {
  const pay = sp.pay === "sudah" || sp.pay === "belum" ? sp.pay : "", proses = sp.proses === "pengadaan" || sp.proses === "non" ? sp.proses : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const versions = await loadStageVersions(sb, yearId), cur = versions.find((v) => v.id === vid);
  const ids = versions.filter((v) => v.id === vid || (cur && v.sortOrder < cur.sortOrder)).map((v) => v.id), stageOf = new Map(versions.map((v) => [v.id, v.stageName]));
  let q = sb.from("transactions").select(SEL, { count: "exact" }).in("budget_version_id", ids.length ? ids : [vid]).order("transaction_date", { ascending: false }).order("id").range((page - 1) * PAGE, page * PAGE - 1);
  if (pay) q = q.eq("payment_status", pay === "sudah" ? "sudah_spm_sp2d" : "belum_spm_sp2d");
  if (proses === "pengadaan") q = q.or("rup_package_id.not.is.null,procurement_method_id.not.is.null");
  if (proses === "non") q = q.is("rup_package_id", null).is("procurement_method_id", null);
  const tx: any = await q, rows: any[] = tx.data ?? [], pages = Math.max(1, Math.ceil((tx.count ?? 0) / PAGE));
  const qs = (o: Record<string, string>) => new URLSearchParams({ tab: "daftar", ...Object.fromEntries(Object.entries(o).filter(([, v]) => v)) });
  const href = (o: Partial<SP>) => `/realisasi?${qs({ pay, proses, ...o, page: "1" } as Record<string, string>)}`;
  const pageHref = (p: number) => `/realisasi?${qs({ pay, proses, page: String(p) })}`;
  const group = (title: string, key: "pay" | "proses", cur2: string, opts: [string, string][]) => (
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
      {opts.map(([v, l]) => <Link key={v} href={href({ [key]: v })} className={pill(v === cur2)} aria-current={v === cur2 ? "true" : undefined}>{l}</Link>)}</div>);
  return (
    <div className="space-y-3">
      {sp.error && <p role="alert" className="alert alert-error">{ERRORS[sp.error] ?? ERRORS.payment}{sp.msg ? ` ${sp.msg}` : ""}</p>}
      <p className="text-xs text-slate-600">Daftar ini <b>kumulatif</b>: memuat transaksi tahapan <b>{cur?.stageName}</b> beserta tahapan sebelumnya pada tahun yang sama. Tahapan transaksi ditentukan tanggal SPM/SP2D (Murni &lt; 16 Mar; Pergeseran 16 Mar-26 Okt; Perubahan 27 Okt-31 Des).</p>
      <div className="space-y-2" role="group" aria-label="Filter">
        {group("Pengakuan", "pay", pay, [["", "Semua"], ["sudah", "Diakui (ada tanggal)"], ["belum", "belum_spm_sp2d"]])}
        {group("Proses", "proses", proses, [["", "Semua"], ["pengadaan", "Pengadaan"], ["non", "Non-pengadaan"]])}
      </div>
      {tx.error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat.</p> : !rows.length ? <p className="text-slate-600">Belum ada transaksi{pay || proses ? " dengan filter ini" : ""}.</p> : (
        <div className="table-wrap"><table><thead><tr><th>Tgl transaksi</th><th>Tahapan</th><th>Tanggal / No SPM-SP2D</th><th>Rekening</th><th>RUP / metode</th><th className="text-right">Nilai</th>{canWrite && <th>Aksi</th>}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="whitespace-nowrap">{fmtDate(r.transaction_date)}</td>
              <td className="text-sm"><span className="badge badge-off">{stageOf.get(r.budget_version_id) ?? "-"}</span></td>
              <td className="min-w-40 text-sm">{r.payment_date || r.payment_number ? <>{r.payment_date ? fmtDate(r.payment_date) : <span className="text-slate-500">tanggal belum diisi</span>}<span className="block text-xs text-slate-600">{r.payment_number ?? "nomor belum diisi"}</span></> : <span className="badge badge-warn">belum_spm_sp2d</span>}{!r.payment_date && <span className="block text-xs text-slate-500">dicatat, belum diakui sebagai realisasi</span>}</td>
              <td className="min-w-48 text-sm">{label(r)}</td>
              <td className="text-sm">{r.rup_packages?.rup_code ? <>RUP {r.rup_packages.rup_code}</> : <span className="text-slate-500">{r.procurement_methods?.name ? "Tanpa RUP" : "Non-pengadaan"}</span>}{r.procurement_methods?.name && <span className="block text-xs text-slate-600">{r.procurement_methods.name}</span>}</td>
              <td className={`text-right tabular-nums ${Number(r.amount) < 0 ? "text-amber-800" : ""}`}>{rp(r.amount)}{Number(r.amount) < 0 && <span className="block text-xs">koreksi</span>}</td>
              {canWrite && <td className="min-w-44 text-sm">
                <details><summary className="link cursor-pointer text-xs">Ubah</summary>
                  <form action={updateTransaction} className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2"><input type="hidden" name="id" value={r.id} />
                    <label className="block text-xs">Tanggal transaksi<input type="date" name="transaction_date" defaultValue={r.transaction_date} className="mt-0.5 w-full py-1" /></label>
                    <label className="block text-xs">Nilai (minus = koreksi)<input name="amount" defaultValue={r.amount} inputMode="decimal" className="mt-0.5 w-full py-1" /></label>
                    <label className="block text-xs">Tanggal SPM/SP2D<input type="date" name="payment_date" defaultValue={r.payment_date ?? ""} className="mt-0.5 w-full py-1" /></label>
                    <label className="block text-xs">No SPM/SP2D (isi manual)<input name="payment_number" defaultValue={r.payment_number ?? ""} maxLength={100} className="mt-0.5 w-full py-1" /></label>
                    <label className="block text-xs">Kode RUP (boleh menyusul)<input name="rup_code" defaultValue={r.rup_packages?.rup_code ?? ""} maxLength={50} inputMode="numeric" className="mt-0.5 w-full py-1" /></label>
                    <label className="block text-xs">Catatan<input name="notes" defaultValue={r.notes ?? ""} maxLength={500} className="mt-0.5 w-full py-1" /></label>
                    <p className="text-[11px] text-slate-500">Perubahan langsung berlaku. Bila tanggal SPM/SP2D pindah tahapan, transaksi dipindah otomatis.</p>
                    <button className="btn btn-ghost btn-sm">Simpan</button></form></details>
                <form action={deleteTransaction} className="mt-1"><input type="hidden" name="id" value={r.id} /><button className="link text-xs text-red-700">Hapus</button></form></td>}</tr>))}</tbody></table></div>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={pageHref(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="link" href={pageHref(page + 1)}>Berikutnya</Link>}</nav>
    </div>);
}

// ---------- tab: riwayat unggahan ----------
async function RiwayatTab({ sb, canAdmin, year, reset }: { sb: SupabaseClient; canAdmin: boolean; year: number; reset?: string }) {
  const resetBox = canAdmin && (
    <details className="card p-4"><summary className="cursor-pointer font-semibold text-red-800">Reset data realisasi tahun {year}</summary>
      <form action={resetTransactions} className="mt-3 space-y-3 text-sm">
        <p>Menghapus <b>seluruh transaksi realisasi tahun {year}</b> (semua tahapan) untuk memulai pencatatan ulang dari Januari s.d. hari ini. Anggaran, RUP, paket, dan kas tidak ikut terhapus. Tindakan ini tidak dapat dibatalkan, tetapi jejaknya ada di Log audit.</p>
        <p><a className="btn btn-ghost btn-sm" href="/api/realisasi/cadangan">1. Unduh cadangan (Excel, format template)</a></p>
        <label className="flex items-center gap-2"><input type="checkbox" name="backup" required />Saya sudah mengunduh cadangan</label>
        <label className="block">2. Ketik <b>RESET {year}</b> untuk mengonfirmasi<input name="confirm" required autoComplete="off" className="mt-1 block w-60" /></label>
        <button className="btn btn-dark">Reset seluruh transaksi {year}</button></form></details>);
  const resetMsg = reset === undefined ? null : reset === "denied" ? "Hanya Super Admin/Admin OPD yang dapat mereset." : reset === "confirm" ? "Konfirmasi tidak sesuai: ketik persis RESET dan tahun, serta centang cadangan." : reset === "error" ? "Reset gagal. Coba lagi atau hubungi admin." : `Reset selesai: ${reset} transaksi dihapus. Silakan unggah ulang data dari template.`;
  const { data: jobs } = await sb.from("import_jobs").select("id, file_name, status, total_rows, ok_rows, error_rows, created_by, created_at").eq("kind", "transactions").order("created_at", { ascending: false }).limit(30);
  const list = jobs ?? [], ids = list.map((j) => j.id), uids = [...new Set(list.map((j) => j.created_by).filter(Boolean))] as string[];
  const [stats, people] = await Promise.all([
    ids.length ? sb.rpc("import_job_stats", { p_jobs: ids }) : Promise.resolve({ data: [] as any[] }),
    uids.length ? sb.from("profiles").select("id, full_name").in("id", uids) : Promise.resolve({ data: [] as any[] })]);
  const st = new Map((stats.data ?? []).map((x: any) => [x.job_id, x])), who = new Map((people.data ?? []).map((p: any) => [p.id, p.full_name]));
  if (!list.length) return <div className="space-y-4">{resetMsg && <p role="status" className="alert alert-info">{resetMsg}</p>}<p className="text-slate-600">Belum ada unggahan realisasi.</p>{resetBox}</div>;
  return (
    <div className="space-y-4">{resetMsg && <p role="status" className="alert alert-info">{resetMsg}</p>}<div className="table-wrap"><table><thead><tr><th>Waktu</th><th>File</th><th>Diunggah oleh</th><th>Baris</th><th>Status</th><th className="text-right">Tercatat</th><th>Tindakan</th></tr></thead>
      <tbody>{list.map((j) => { const s: any = st.get(j.id), n = Number(s?.tx_count ?? 0); return (
        <tr key={j.id}><td className="whitespace-nowrap text-sm">{fmtDateTime(j.created_at)}</td><td className="text-sm">{j.file_name}</td><td className="text-sm">{who.get(j.created_by) ?? "-"}</td>
          <td className="text-sm">{j.ok_rows} valid{j.error_rows ? `, ${j.error_rows} bermasalah` : ""} dari {j.total_rows}</td>
          <td>{j.status === "confirmed" ? <span className="badge badge-ok">Diterapkan</span> : <span className="badge badge-off">Belum diterapkan</span>}</td>
          <td className="text-right text-sm tabular-nums">{j.status === "confirmed" ? <>{n} transaksi<br /><span className="text-xs text-slate-500">{rp(parseRupiah(s?.total) ?? "0.00")}</span></> : "-"}</td>
          <td className="text-sm">{j.status !== "confirmed" ? <form action={deleteTxImportJob}><input type="hidden" name="jobId" value={j.id} /><button className="link">Hapus</button></form> : "-"}</td></tr>); })}</tbody></table></div>{resetBox}</div>);
}

// ---------- rekap per tahapan (berkelanjutan: Murni -> Pergeseran -> Perubahan) ----------
const dayBefore = (d: string) => new Date(Date.parse(d + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
async function StageRecap({ sb, yearId, year, vid }: { sb: SupabaseClient; yearId: string; year: number; vid: string }) {
  const versions = await loadStageVersions(sb, yearId);
  const totals = await Promise.all(versions.map((v) => loadRealizationTotals(sb, v.id)));
  return (
    <div className="grid gap-2 md:grid-cols-3" role="list" aria-label="Rekap realisasi per tahapan">
      {versions.map((v, i) => {
        const st = effectiveStart(v, year) ?? `${year}-01-01`, nxt = versions[i + 1] ? effectiveStart(versions[i + 1]!, year) : null, end = nxt ? dayBefore(nxt) : `${year}-12-31`, on = v.id === vid, t = totals[i]!.totals;
        const prior = versions.slice(0, i).map((x) => x.stageName);
        return (
          <div key={v.id} role="listitem" className={`card p-3 ${on ? "ring-2 ring-cyan-600" : ""}`} aria-current={on ? "true" : undefined}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{v.stageName}</p>
            <p className="text-xs text-slate-600">{i === 0 ? `Transaksi s.d. ${fmtDate(end)}` : `${prior.join(" + ")} + transaksi ${fmtDate(st)} s.d. ${fmtDate(end)}`}</p>
            <p className="mt-1 font-semibold tabular-nums">{rp(t.verified)}</p>
            <p className="text-xs text-slate-600">{t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`} dari pagu {rp(t.pagu)}{t.unverified !== "0.00" && <> · dalam proses {rp(t.unverified)}</>}</p>
          </div>);
      })}
    </div>);
}

export default async function RealisasiPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams, ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), vid = ctx.versionId;
  const [{ totals: t, overPaguCount }, session, un] = await Promise.all([loadRealizationTotals(sb, vid), getSession(), sb.rpc("realization_unmapped", { p_version: vid })]);
  const unmapped = (Array.isArray(un.data) ? un.data[0] : un.data) as { tx_count: number; amount: string } | null;
  const canWrite = !!session && can(session.roles, "realization:write"), canAdmin = !!session && can(session.roles, "budget-setup:write");
  const tabs: [string, string][] = canWrite ? [["unggah", "Unggah Excel/CSV"], ["manual", "Input manual"], ["daftar", "Daftar transaksi"], ["riwayat", "Riwayat unggahan"]] : [["daftar", "Daftar transaksi"]];
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : "daftar";
  const cards: [string, string][] = [["Total pagu rekening", rp(t.pagu)], ["Realisasi diakui (kumulatif)", rp(t.verified)], ["belum_spm_sp2d (belum diakui)", rp(t.unverified)], ["Sisa pagu", rp(t.remaining)], ["Persentase realisasi", t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`]];
  return (
    <section className="max-w-6xl space-y-5">
      <div><h1 className="page-title">Input Realisasi <span className="page-sub">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        <p className="text-sm text-slate-600">Realisasi bersifat <b>berkelanjutan</b>: angka tahapan <b>{ctx.stageName}</b> memuat realisasi tahapan sebelumnya terhadap pagu tahapan ini. Transaksi dapat diubah dan dihapus kapan saja; tidak ada verifikasi.
          {" "}Kode RUP pada transaksi otomatis menautkannya ke paket pengadaan (menu Paket pengadaan).</p></div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{cards.map(([k, v]) => <div key={k} className="card p-3"><p className="text-xs text-slate-600">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>)}</div>
      <p className="text-sm text-slate-600">{t.txCount} transaksi (kumulatif), {t.unverifiedCount} di antaranya berstatus belum_spm_sp2d karena belum ada Tanggal SPM/SP2D: belum diakui sebagai realisasi, tetapi tetap menahan pagu. Isi Tanggal SPM/SP2D di Daftar transaksi untuk mengakuinya. {overPaguCount > 0 && <b className="text-amber-900">Ada {overPaguCount} rekening dengan realisasi melampaui pagu.</b>}</p>
      {!!unmapped && Number(unmapped.tx_count) > 0 && <p role="alert" className="alert alert-warn text-sm">{unmapped.tx_count} transaksi tahapan sebelumnya ({rp(parseRupiah(unmapped.amount) ?? "0.00")}) belum terhitung di tahapan ini karena rekening/subkegiatannya tidak ada pada anggaran {ctx.stageName}. Tambahkan rekening padanannya di menu <Link className="link" href="/anggaran/kelola">Kelola anggaran</Link>.</p>}
      <Suspense fallback={<Skeleton h="h-24" />}><StageRecap sb={sb} yearId={ctx.yearId} year={ctx.year} vid={vid} /></Suspense>
      <p className="text-xs text-slate-600">Pilih tahapan di bagian atas layar untuk melihat rekapnya. Rekap berkelanjutan: Pergeseran = Murni + transaksi 16 Mar s.d. 26 Okt; Perubahan = Murni + Pergeseran + transaksi 27 Okt s.d. 31 Des.</p>
      {canWrite && <div className="grid gap-3 md:grid-cols-2" role="group" aria-label="Cara mencatat realisasi">
        {([["manual", "Input manual", "Isi formulir satu per satu mengikuti fitur yang ada. Tanggal SPM/SP2D boleh dikosongkan: transaksi berstatus belum_spm_sp2d (belum diakui sebagai realisasi) dan diakui setelah tanggalnya diisi."], ["unggah", "Unggah template Excel/CSV", "Untuk banyak baris sekaligus. Realisasi diakui bila tanggal_spm_sp2d terisi (tahapan Murni/Pergeseran/Perubahan mengikuti tanggal itu); baris tanpa tanggal tetap dicatat sebagai belum_spm_sp2d. Kesalahan tanggal dan data lain diberi tahu sebelum disimpan."]] as const).map(([k, l, d]) =>
          <Link key={k} href={`/realisasi?tab=${k}`} className={`card block p-4 transition ${tab === k ? "ring-2 ring-cyan-600" : "hover:bg-slate-50"}`} aria-current={tab === k ? "page" : undefined}><p className="font-semibold">{l}</p><p className="mt-1 text-sm text-slate-600">{d}</p></Link>)}</div>}
      {tabs.length > 1 && <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" aria-label="Daftar dan riwayat">{tabs.filter(([k]) => k === "daftar" || k === "riwayat").map(([k, l]) => <Link key={k} href={`/realisasi?tab=${k}`} className={pill(k === tab)} aria-current={k === tab ? "page" : undefined}>{l}</Link>)}</nav>}
      {tab === "unggah" && <Suspense fallback={<Skeleton h="h-72" />}><UnggahTab sb={sb} yearId={ctx.yearId} year={ctx.year} canSetStage={canAdmin} /></Suspense>}
      {tab === "manual" && <Suspense fallback={<Skeleton />}><ManualTab sb={sb} vid={vid} year={ctx.year} /></Suspense>}
      {tab === "daftar" && <Suspense fallback={<Skeleton h="h-72" />}><DaftarTab sb={sb} vid={vid} yearId={ctx.yearId} sp={sp} canWrite={canWrite} /></Suspense>}
      {tab === "riwayat" && <Suspense fallback={<Skeleton h="h-72" />}><RiwayatTab sb={sb} canAdmin={canAdmin} year={ctx.year} reset={sp.reset} /></Suspense>}
    </section>);
}
