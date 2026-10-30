import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { loadRealizationForm } from "@/lib/server/realization-form-data";
import { TransactionForm } from "@/components/transaction-form";
import { DOC_TYPES, KINDS } from "@/lib/transactions";
import { rp } from "@/lib/format";
import { loadRealizationTotals } from "@/lib/server/realization-totals";
import { verifyTransaction } from "./actions";
const PAGE = 25;
// Form memuat seluruh rekening/RUP/paket (paling berat). Dibuat terpisah dan di-stream agar tabel & ringkasan tampil lebih dulu.
async function RealisasiForm({ sb, vid, year }: { sb: SupabaseClient; vid: string; year: number }) {
  const form = await loadRealizationForm(sb, vid);
  return form.entries.length ? <TransactionForm year={year} entries={form.entries} rups={form.rups} packages={form.packages} allocByRup={form.allocByRup} hasCashPlan={form.hasCashPlan} /> : <p className="alert alert-warn">Belum ada rekening anggaran. Impor anggaran lebih dulu.</p>;
}
const FormSkeleton = () => <div className="card h-40 animate-pulse bg-slate-100" role="status" aria-label="Memuat formulir" />;
export default async function RealisasiPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; error?: string }> }) {
  const sp = await searchParams, ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), vid = ctx.versionId;
  const status = sp.status === "verified" || sp.status === "unverified" ? sp.status : "", page = Math.max(1, Number(sp.page) || 1);
  let q = sb.from("transactions").select("id, kind, doc_type, doc_number, transaction_date, amount, verification_status, budget_entries(description, subactivities(code), expenditure_accounts(code)), rup_packages(rup_code)", { count: "exact" })
    .eq("budget_version_id", vid).order("transaction_date", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (status) q = q.eq("verification_status", status);
  const [{ totals: t, overPaguCount }, tx, session] = await Promise.all([loadRealizationTotals(sb, vid), q, getSession()]);
  const canWrite = !!session && can(session.roles, "realization:write");
  const label = (r: any) => r.budget_entries ? `${r.budget_entries.subactivities?.code ?? ""} / ${r.budget_entries.expenditure_accounts?.code ?? ""}: ${r.budget_entries.description}` : "-";
  const pages = Math.max(1, Math.ceil((tx.count ?? 0) / PAGE)), href = (p: number, s = status) => `/realisasi?${new URLSearchParams({ ...(s ? { status: s } : {}), page: String(p) })}`;
  const cards: [string, string][] = [["Total pagu rekening", rp(t.pagu)], ["Realisasi terverifikasi", rp(t.verified)], ["Belum diverifikasi", rp(t.unverified)], ["Sisa pagu", rp(t.remaining)], ["Persentase realisasi", t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`]];
  return (
    <section className="max-w-6xl space-y-5">
      <div><h1 className="page-title">Input Realisasi <span className="page-sub">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        <p className="text-sm text-slate-600">Data bersumber dari arsip Anggaran (rekening, program, kegiatan, sub kegiatan, sumber dana, PPTK, pagu), arsip RUP (kode dan pagu paket), dan Anggaran kas. Satu kode RUP dapat dicatat berulang; sisa pagu dan kas dihitung otomatis. Persentase di bawah dihitung dari transaksi terverifikasi saja.</p>
        <p className="mt-1 text-sm"><Link className="link" href="/paket">Proses pengadaan (status, kontrak/SP, tenggat) &rarr;</Link></p></div>
      {canWrite && <Suspense fallback={<FormSkeleton />}><RealisasiForm sb={sb} vid={vid} year={ctx.year} /></Suspense>}
      {sp.error && <p role="alert" className="alert alert-error">Verifikasi gagal. Hanya admin yang dapat memverifikasi, dan transaksi harus belum terverifikasi.</p>}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{cards.map(([k, v]) => <div key={k} className="card p-3"><p className="text-xs text-slate-600">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>)}</div>
      <p className="text-sm text-slate-600">{t.txCount} transaksi, {t.unverifiedCount} belum diverifikasi. {overPaguCount > 0 && <b className="text-amber-900">Ada {overPaguCount} rekening dengan total transaksi melampaui pagu.</b>}</p>
      <nav className="flex flex-wrap gap-2" aria-label="Filter status">{[["", "Semua"], ["unverified", "Belum diverifikasi"], ["verified", "Terverifikasi"]].map(([v, l]) => <Link key={v} href={href(1, v)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${v === status ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"}`} aria-current={v === status ? "true" : undefined}>{l}</Link>)}</nav>
      {tx.error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat.</p> : !tx.data?.length ? <p className="text-slate-600">Belum ada transaksi{status ? " dengan status ini" : ""}.</p> : (
        <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Rekening</th><th>RUP</th><th>Jenis</th><th>Dokumen</th><th className="text-right">Nilai</th><th>Status</th></tr></thead>
          <tbody>{tx.data.map((r) => <tr key={r.id}><td>{r.transaction_date}</td><td>{label(r)}</td><td>{(r.rup_packages as any)?.rup_code ?? "-"}</td><td>{KINDS[r.kind]?.split(" ")[0]}</td><td>{DOC_TYPES[r.doc_type]} {r.doc_number ?? ""}</td><td className="text-right tabular-nums">{rp(r.amount)}</td>
            <td>{r.verification_status === "verified" ? "Terverifikasi" : <form action={verifyTransaction} className="flex items-center gap-2">Belum diverifikasi<input type="hidden" name="id" value={r.id} /><button className="link">Verifikasi</button></form>}</td></tr>)}</tbody></table></div>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
    </section>);
}
