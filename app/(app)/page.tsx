import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { loadRealizationTotals } from "@/lib/server/realization-totals";
import { fillMonths, rankMethods, type MethodRow } from "@/lib/dashboard";
import { rp } from "@/lib/format";
import { MonthlyChart } from "@/components/monthly-chart-lazy";
import { Icon, type IconName } from "@/components/icons";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { nowWib } from "@/lib/date";
import { fromCents, toCents } from "@/lib/money";

async function QuickLinks() {
  const s = await getSession();
  const items: [string, string, IconName][] = [["/laporan", "Laporan & dokumen", "printer"], ["/anggaran/impor", "Impor anggaran", "upload"], ["/panduan", "Panduan", "book"],
    ...(s && can(s.roles, "print-profile:write") ? [["/pengaturan", "Pengaturan", "settings"] as [string, string, IconName]] : [])];
  return <nav aria-label="Akses cepat" className="flex flex-wrap gap-2">{items.map(([h, l, i]) => <Link key={h} href={h} className="btn btn-ghost btn-sm"><Icon name={i} className="h-4 w-4" />{l}</Link>)}</nav>;
}
type Summary = { rup_count: number; pkg_processed: number; pkg_unprocessed: number; pkg_followup: number; result_total: number; contract_total: number; by_method: { name: string; count: number }[]; monthly: { month: number; verified: number }[] };
export default async function Home() {
  const ctx = await getBudgetContext(), sb = await createClient();
  if (!ctx?.versionId) return <section className="max-w-2xl space-y-2"><h1 className="page-title">Beranda</h1>
    <p className="text-slate-600">Belum ada versi anggaran untuk tahun/tahapan ini. Siapkan di menu <Link className="link" href="/anggaran/impor">Impor anggaran</Link>.</p><QuickLinks /></section>;
  const [{ data: s, error }, { totals: t }, mr] = await Promise.all([sb.rpc("dashboard_summary", { p_version: ctx.versionId }), loadRealizationTotals(sb, ctx.versionId), sb.rpc("dashboard_method_ranking", { p_version: ctx.versionId })]);
  if (error || !s) return <p role="alert" className="alert alert-error">Dashboard tidak dapat dimuat. Muat ulang halaman.</p>;
  const d = s as Summary;
  const ranking = mr.error || !Array.isArray(mr.data) ? null : rankMethods(mr.data as MethodRow[]);   // null = migrasi 20260118 belum dijalankan
  const pct = t.percent === null ? null : Math.min(100, Math.max(0, Number(t.percent)));
  const hero: [string, string, string][] = [
    ["Total pagu anggaran", rp(t.pagu), "/realisasi"], ["Realisasi kumulatif", rp(t.verified), "/realisasi"], ["Sisa anggaran", rp(t.remaining), "/realisasi"]];
  const cards: [string, string, string][] = [
    ["Paket RUP", String(d.rup_count), "/rup"], ["Paket sudah diproses", String(d.pkg_processed), "/paket?kelompok=sudah_diproses"], ["Paket belum diproses", String(d.pkg_unprocessed), "/paket?kelompok=belum_diproses"],
    ["Nilai hasil pemilihan", rp(d.result_total), "/paket"], ["Nilai kontrak/SP", rp(d.contract_total), "/paket"], ["Perlu tindak lanjut", String(d.pkg_followup), "/paket?filter=tindak-lanjut"]];
  return (
    <section className="max-w-7xl space-y-6">
      <div><p className="eyebrow">Ringkasan</p>
        <h1 className="page-title">Dashboard <span className="page-sub">Tahun {ctx.year} · {ctx.stageName}</span></h1>
        <p className="page-desc">Diperbarui {nowWib()}. Sumber: data yang dicatat di aplikasi ini. Realisasi bersifat kumulatif (tahapan terpilih + tahapan sebelumnya){t.unverifiedCount > 0 ? `; ${t.unverifiedCount} transaksi belum diverifikasi (${rp(t.unverified)}) tidak ikut dihitung` : ""}.</p></div>
      <QuickLinks />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {hero.map(([k, v, h], i) => <Link key={k} href={h} className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 p-5 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-glow">
          <span className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-300">{k}</p><p className="mt-2 font-display text-2xl font-bold tabular-nums">{v}</p>
          <p className="mt-3 text-xs font-semibold text-cyan-300 opacity-80 group-hover:opacity-100">{i === 0 ? "Lihat rincian" : "Buka realisasi"} →</p></Link>)}
        <Link href="/realisasi" className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-indigo-50 p-5 shadow-card transition hover:-translate-y-0.5">
          <p className="text-sm font-medium text-slate-600">Persentase realisasi</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-navy-800">{t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`}</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Persentase realisasi">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${pct ?? 0}%` }} /></div></Link>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">{cards.map(([k, v, h]) => <Link key={k} href={h} className="card p-4 transition hover:-translate-y-0.5 hover:border-cyan-400">
        <p className="text-sm text-slate-600">{k}</p><p className="mt-1 break-words font-display text-xl font-bold tabular-nums text-navy-800">{v}</p></Link>)}</div>
      <div className={ranking ? "" : "grid gap-6 lg:grid-cols-[2fr_1fr]"}>
        <div className="card p-5"><h2 className="mb-3">Realisasi per bulan</h2>
          {d.monthly.length ? <MonthlyChart data={fillMonths(d.monthly)} /> : <p className="text-slate-600">Belum ada transaksi pada tahun/tahapan ini.</p>}</div>
        {!ranking && <div className="card p-5"><h2 className="mb-3">Paket per metode pemilihan</h2>
          {d.by_method.length ? <ul className="divide-y divide-slate-100">{d.by_method.map((x) => <li key={x.name} className="flex items-center justify-between py-2.5"><span>{x.name}</span><b className="badge badge-info tabular-nums">{x.count}</b></li>)}</ul> : <p className="text-slate-600">Belum ada paket pengadaan.</p>}
          {mr.error && <p className="mt-3 text-xs text-slate-500">Peringkat realisasi per metode belum tersedia: jalankan migrasi database 20260118_peringkat_metode di Supabase.</p>}</div>}
      </div>
      {ranking && <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2>Peringkat metode pemilihan menurut realisasi</h2>
          <p className="text-xs text-slate-500">Jumlah paket pekerjaan dan realisasi diakui (kumulatif), tertinggi ke terendah</p></div>
        {ranking.length ? <div className="table-wrap shadow-none"><table><caption className="sr-only">Peringkat metode pemilihan menurut realisasi</caption>
          <thead><tr><th scope="col" className="w-16">Peringkat</th><th scope="col">Metode pemilihan</th><th scope="col" className="text-right">Jumlah paket</th><th scope="col" className="text-right">Transaksi</th><th scope="col" className="text-right">Realisasi</th><th scope="col" className="min-w-40">Porsi realisasi</th></tr></thead>
          <tbody>{ranking.map((x) => <tr key={x.name}>
            <td><span className={`badge tabular-nums ${x.rank === 1 && x.share > 0 ? "badge-ok" : "badge-off"}`}>{x.rank}</span></td>
            <td className="font-medium">{x.name}</td>
            <td className="text-right tabular-nums">{x.packages}</td>
            <td className="text-right tabular-nums">{x.transactions}</td>
            <td className="text-right font-semibold tabular-nums">{rp(x.realized)}</td>
            <td><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={x.share} aria-valuemin={0} aria-valuemax={100} aria-label={`Porsi realisasi ${x.name}`}><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${x.share}%` }} /></div>
              <span className="w-12 text-right text-xs tabular-nums text-slate-600">{x.share.toFixed(1).replace(".", ",")}%</span></div></td></tr>)}</tbody>
          <tfoot><tr className="font-semibold"><td colSpan={2} className="px-3.5 py-3">Total</td><td className="px-3.5 py-3 text-right tabular-nums">{ranking.reduce((a, x) => a + x.packages, 0)}</td><td className="px-3.5 py-3 text-right tabular-nums">{ranking.reduce((a, x) => a + x.transactions, 0)}</td><td className="px-3.5 py-3 text-right tabular-nums">{rp(fromCents(ranking.reduce((a, x) => a + toCents(x.realized), 0n)))}</td><td /></tr></tfoot></table></div>
          : <p className="text-slate-600">Belum ada paket pengadaan maupun realisasi pengadaan.</p>}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">Realisasi = transaksi pengadaan yang sudah bertanggal SPM/SP2D (kumulatif tahapan terpilih + sebelumnya). Metode diambil dari transaksi, lalu paket pengadaan, lalu rencana metode pada paket RUP; transaksi non-pengadaan tidak ikut. Paket berstatus tidak aktif tidak dihitung.</p></div>}
      <p className="text-xs leading-relaxed text-slate-500">Paket "diproses" = status berkelompok diproses atau selesai; "perlu tindak lanjut" = status bertanda tindak lanjut, belum bertaut RUP, atau lewat tenggat dan belum selesai. Pengelompokan status dapat diubah di master status.</p>
    </section>);
}
