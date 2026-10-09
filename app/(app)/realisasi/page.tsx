import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { loadEntries } from "@/lib/server/entries";
import { TransactionForm } from "@/components/transaction-form";
import { derive, totals, type EntryRow } from "@/lib/realization";
import { DOC_TYPES, KINDS } from "@/lib/transactions";
import { parseRupiah } from "@/lib/import/parse";
import { rp } from "@/lib/format";
import { verifyTransaction } from "./actions";
const PAGE = 25;
export default async function RealisasiPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; error?: string }> }) {
  const sp = await searchParams, ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), vid = ctx.versionId, m = (v: unknown) => parseRupiah(v) ?? "0.00";
  const status = sp.status === "verified" || sp.status === "unverified" ? sp.status : "", page = Math.max(1, Number(sp.page) || 1);
  let q = sb.from("transactions").select("id, budget_entry_id, kind, doc_type, doc_number, transaction_date, amount, verification_status", { count: "exact" })
    .eq("budget_version_id", vid).order("transaction_date", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (status) q = q.eq("verification_status", status);
  const [{ data: agg }, entries, { data: pk }, tx] = await Promise.all([sb.rpc("realization_by_entry", { p_version: vid }), loadEntries(sb, vid),
    sb.from("procurement_packages").select("id, internal_code, name").eq("budget_version_id", vid).order("internal_code").limit(1000), q]);
  const rows: EntryRow[] = ((agg ?? []) as { pagu: number; verified: number; unverified: number; tx_count: number; unverified_count: number }[])
    .map((r) => ({ pagu: m(r.pagu), verified: m(r.verified), unverified: m(r.unverified), txCount: Number(r.tx_count), unverifiedCount: Number(r.unverified_count) }));
  const t = totals(rows), label = new Map(entries.map((e) => [e.id, e.label]));
  const pages = Math.max(1, Math.ceil((tx.count ?? 0) / PAGE)), href = (p: number, s = status) => `/realisasi?${new URLSearchParams({ ...(s ? { status: s } : {}), page: String(p) })}`;
  const cards: [string, string][] = [["Total pagu rekening", rp(t.pagu)], ["Realisasi terverifikasi", rp(t.verified)], ["Belum diverifikasi", rp(t.unverified)], ["Sisa pagu", rp(t.remaining)], ["Persentase realisasi", t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`]];
  return (
    <section className="max-w-6xl space-y-5">
      <div><h1 className="page-title">Realisasi belanja <span className="page-sub">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        <p className="text-sm text-slate-600">Sisa dan persentase dihitung dari transaksi terverifikasi saja. Nilai kontrak/SP tidak dihitung sebagai realisasi.</p></div>
      {sp.error && <p role="alert" className="alert alert-error">Verifikasi gagal. Hanya admin yang dapat memverifikasi, dan transaksi harus belum terverifikasi.</p>}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{cards.map(([k, v]) => <div key={k} className="card p-3"><p className="text-xs text-slate-600">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>)}</div>
      <p className="text-sm text-slate-600">{t.txCount} transaksi, {t.unverifiedCount} belum diverifikasi. {rows.filter((r) => derive(r).overPagu).length > 0 && <b className="text-amber-900">Ada {rows.filter((r) => derive(r).overPagu).length} rekening dengan total transaksi melampaui pagu.</b>}</p>
      <nav className="flex flex-wrap gap-2" aria-label="Filter status">{[["", "Semua"], ["unverified", "Belum diverifikasi"], ["verified", "Terverifikasi"]].map(([v, l]) => <Link key={v} href={href(1, v)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${v === status ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"}`} aria-current={v === status ? "true" : undefined}>{l}</Link>)}</nav>
      {tx.error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat.</p> : !tx.data?.length ? <p className="text-slate-600">Belum ada transaksi{status ? " dengan status ini" : ""}.</p> : (
        <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Rekening</th><th>Jenis</th><th>Dokumen</th><th className="text-right">Nilai</th><th>Status</th></tr></thead>
          <tbody>{tx.data.map((r) => <tr key={r.id}><td>{r.transaction_date}</td><td>{label.get(r.budget_entry_id) ?? "-"}</td><td>{KINDS[r.kind]?.split(" ")[0]}</td><td>{DOC_TYPES[r.doc_type]} {r.doc_number ?? ""}</td><td className="text-right tabular-nums">{rp(r.amount)}</td>
            <td>{r.verification_status === "verified" ? "Terverifikasi" : <form action={verifyTransaction} className="flex items-center gap-2">Belum diverifikasi<input type="hidden" name="id" value={r.id} /><button className="link">Verifikasi</button></form>}</td></tr>)}</tbody></table></div>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
      {entries.length ? <TransactionForm entries={entries.map((e) => ({ value: e.id, label: e.label }))} packages={(pk ?? []).map((p) => ({ value: p.id, label: `${p.internal_code} ${p.name}` }))} /> : <p className="text-sm text-slate-600">Belum ada rekening anggaran. Impor anggaran lebih dulu.</p>}
    </section>);
}
