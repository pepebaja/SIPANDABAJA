import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { totals } from "@/lib/realization";
import { fillMonths } from "@/lib/dashboard";
import { parseRupiah } from "@/lib/import/parse";
import { rp } from "@/lib/format";
import { MonthlyChart } from "@/components/monthly-chart";
type Summary = { rup_count: number; pkg_processed: number; pkg_unprocessed: number; pkg_followup: number; result_total: number; contract_total: number; by_method: { name: string; count: number }[]; monthly: { month: number; verified: number }[] };
export default async function Home() {
  const ctx = await getBudgetContext(), sb = await createClient(), m = (v: unknown) => parseRupiah(v) ?? "0.00";
  if (!ctx?.versionId) return <section className="max-w-2xl space-y-2"><h1 className="text-2xl font-semibold text-navy-800">Beranda</h1>
    <p className="text-slate-600">Belum ada versi anggaran untuk tahun/tahapan ini. Siapkan di menu <Link className="underline" href="/anggaran/impor">Impor anggaran</Link>.</p></section>;
  const [{ data: s, error }, { data: agg }] = await Promise.all([sb.rpc("dashboard_summary", { p_version: ctx.versionId }), sb.rpc("realization_by_entry", { p_version: ctx.versionId })]);
  if (error || !s) return <p role="alert" className="text-red-800">Dashboard tidak dapat dimuat. Muat ulang halaman.</p>;
  const d = s as Summary;
  const t = totals(((agg ?? []) as { pagu: number; verified: number; unverified: number; tx_count: number; unverified_count: number }[]).map((r) => ({ pagu: m(r.pagu), verified: m(r.verified), unverified: m(r.unverified), txCount: Number(r.tx_count), unverifiedCount: Number(r.unverified_count) })));
  const cards: [string, string, string][] = [
    ["Total pagu anggaran", rp(t.pagu), "/realisasi"], ["Paket RUP", String(d.rup_count), "/rup"], ["Paket sudah diproses", String(d.pkg_processed), "/paket"], ["Paket belum diproses", String(d.pkg_unprocessed), "/paket"],
    ["Nilai hasil pemilihan", rp(d.result_total), "/paket"], ["Nilai kontrak/SP", rp(d.contract_total), "/paket"], ["Realisasi terverifikasi", rp(t.verified), "/realisasi?status=verified"],
    ["Sisa anggaran", rp(t.remaining), "/realisasi"], ["Persentase realisasi", t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`, "/realisasi"], ["Perlu tindak lanjut", String(d.pkg_followup), "/paket"]];
  return (
    <section className="max-w-6xl space-y-6">
      <div><h1 className="text-2xl font-semibold text-navy-800">Dashboard <span className="text-base font-normal text-slate-600">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        <p className="text-sm text-slate-600">Diperbarui {new Date().toLocaleString("id-ID")}. Sumber: data yang dicatat di aplikasi ini. Realisasi hanya dari transaksi terverifikasi{t.unverifiedCount > 0 ? `; ${t.unverifiedCount} transaksi belum diverifikasi (${rp(t.unverified)}) tidak ikut dihitung` : ""}.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map(([k, v, h]) => <Link key={k} href={h} className="rounded border bg-white p-4 hover:border-teal-600"><p className="text-xs text-slate-600">{k}</p><p className="mt-1 text-lg font-semibold tabular-nums">{v}</p></Link>)}</div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded border bg-white p-4"><h2 className="mb-2 font-semibold">Realisasi terverifikasi per bulan</h2>
          {d.monthly.length ? <MonthlyChart data={fillMonths(d.monthly)} /> : <p className="text-sm text-slate-600">Belum ada transaksi terverifikasi pada tahun/tahapan ini.</p>}</div>
        <div className="rounded border bg-white p-4"><h2 className="mb-2 font-semibold">Paket per metode pemilihan</h2>
          {d.by_method.length ? <ul className="space-y-1 text-sm">{d.by_method.map((x) => <li key={x.name} className="flex justify-between"><span>{x.name}</span><b className="tabular-nums">{x.count}</b></li>)}</ul> : <p className="text-sm text-slate-600">Belum ada paket pengadaan.</p>}</div>
      </div>
      <p className="text-xs text-slate-500">Paket "diproses" = status berkelompok diproses atau selesai; "perlu tindak lanjut" = status bertanda tindak lanjut, belum bertaut RUP, atau lewat tenggat dan belum selesai. Pengelompokan status dapat diubah di master status.</p>
    </section>);
}
