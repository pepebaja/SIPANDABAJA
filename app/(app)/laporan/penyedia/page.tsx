import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { fetchAll } from "@/lib/server/fetch-all";
import { parseRupiah } from "@/lib/import/parse";
import { summarizeProviders, type ProvContract, type ProvTx } from "@/lib/provider-report";
import { formatRupiah } from "@/lib/format";
import { fromCents, sumCents } from "@/lib/money";
import { PrintButton } from "@/components/print-button";
export const metadata = { title: "Penyedia pelaksana pekerjaan" };
const rp = (v: string | null) => (v === null ? "-" : formatRupiah(v));

export default async function PenyediaReportPage() {
  const [s, ctx] = await Promise.all([getSession(), getBudgetContext()]); if (!s) return null;
  if (!ctx?.yearId) return <p className="alert alert-info max-w-xl">Belum ada tahun anggaran untuk konteks ini.</p>;
  const sb = await createClient(), ids = (await loadStageVersions(sb, ctx.yearId)).map((v) => v.id);   // satu tahun anggaran = seluruh tahapan
  if (!ids.length) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran pada tahun ini.</p>;
  const [tx, ct, missing] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("transactions").select("amount, payment_date, provider_id, providers(name), rup_packages(rup_code, name, pagu), procurement_methods(name)").in("budget_version_id", ids).not("provider_id", "is", null).order("id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("id, contract_value, provider_id, providers(name), procurement_packages!inner(budget_version_id, internal_code, name, pagu)").in("procurement_packages.budget_version_id", ids).not("provider_id", "is", null).order("id").range(f, t)),
    sb.from("transactions").select("id", { count: "exact", head: true }).in("budget_version_id", ids).is("provider_id", null).or("rup_package_id.not.is.null,procurement_method_id.not.is.null")]);
  const m = (v: unknown) => parseRupiah(v) ?? "0.00";
  const txs: ProvTx[] = tx.map((r) => ({ providerId: r.provider_id, providerName: r.providers?.name ?? "(tanpa nama)", code: r.rup_packages?.rup_code ?? null, rupName: r.rup_packages?.name ?? null, pagu: r.rup_packages ? m(r.rup_packages.pagu) : null, methodName: r.procurement_methods?.name ?? null, amount: m(r.amount), paid: !!r.payment_date }));
  const cts: ProvContract[] = ct.map((r) => ({ providerId: r.provider_id, providerName: r.providers?.name ?? "(tanpa nama)", code: r.procurement_packages?.internal_code ?? null, name: r.procurement_packages?.name ?? null, pagu: r.procurement_packages ? m(r.procurement_packages.pagu) : null, value: m(r.contract_value) }));
  const list = summarizeProviders(txs, cts), pkgTotal = new Set(list.flatMap((p) => p.packages.map((k) => k.code))).size, noProv = missing.count ?? 0;
  return (
    <section className="max-w-6xl space-y-4">
      <Link href="/laporan" className="no-print link text-sm">← Laporan &amp; dokumen</Link>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Laporan</p><h1 className="page-title">Penyedia pelaksana pekerjaan <span className="page-sub">Tahun anggaran {ctx.year}</span></h1>
        <p className="page-desc">Nama penyedia dan jumlah paket pekerjaan (kode RUP unik) yang dilaksanakan dalam satu tahun anggaran, mencakup seluruh tahapan. Sumber: penyedia pada transaksi realisasi dan pada kontrak paket.</p></div><div className="no-print"><PrintButton /></div></div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{([["Penyedia", String(list.length)], ["Paket pekerjaan", String(pkgTotal)], ["Nilai kontrak/SP", rp(fromCents(sumCents(list.map((p) => p.contract))))], ["Realisasi diakui", rp(fromCents(sumCents(list.map((p) => p.realized))))]] as const).map(([k, v]) => <div key={k} className="card p-3"><p className="text-xs text-slate-600">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>)}</div>
      {noProv > 0 && <p role="status" className="alert alert-warn no-print text-sm">{noProv} transaksi pengadaan belum diisi penyedianya sehingga belum masuk laporan ini. <Link className="link" href="/realisasi?tab=daftar&cek=tanpa_penyedia">Lengkapi di Daftar transaksi</Link>.</p>}
      {!list.length ? <p className="text-slate-600">Belum ada penyedia yang tercatat pada transaksi atau kontrak tahun ini. Pilih penyedia di Input Realisasi atau pada kontrak paket.</p> : (
        <div className="table-wrap"><table><caption className="sr-only">Penyedia dan jumlah paket pekerjaan</caption>
          <thead><tr><th scope="col" className="w-12">No</th><th scope="col">Penyedia</th><th scope="col" className="text-right">Jumlah paket</th><th scope="col" className="text-right">Transaksi</th><th scope="col" className="text-right">Nilai kontrak/SP</th><th scope="col" className="text-right">Realisasi diakui</th></tr></thead>
          <tbody>{list.map((p, i) => (
            <tr key={p.id} className="align-top"><td>{i + 1}</td>
              <td><details><summary className="cursor-pointer font-medium">{p.name}</summary>
                {p.packages.length ? <ul className="mt-2 space-y-1 text-xs text-slate-700">{p.packages.map((k) => <li key={k.code}><b className="tabular-nums">{k.code}</b> · {k.name || "-"}{k.methods.length ? ` · ${k.methods.join(", ")}` : ""} · pagu RUP {rp(k.pagu)}{Number(k.contract) > 0 ? ` · kontrak ${rp(k.contract)}` : ""} · realisasi {rp(k.realized)}</li>)}</ul> : <p className="mt-2 text-xs text-slate-600">Tidak ada transaksi berkode RUP.</p>}
                {p.txNoCode > 0 && <p className="mt-1 text-xs text-amber-800">{p.txNoCode} transaksi tanpa kode RUP tidak dihitung sebagai paket.</p>}</details></td>
              <td className="text-right font-semibold tabular-nums">{p.packageCount}</td><td className="text-right tabular-nums">{p.txCount}</td><td className="text-right tabular-nums">{Number(p.contract) > 0 ? rp(p.contract) : "-"}</td><td className="text-right tabular-nums">{rp(p.realized)}</td></tr>))}</tbody></table></div>)}
      <p className="text-xs text-slate-500">Jumlah paket = kode RUP berbeda yang tercatat pada transaksi atau kontrak penyedia tersebut; paket yang sama pada beberapa tahapan dihitung sekali. Klik nama penyedia untuk melihat daftar paketnya.</p>
    </section>);
}
