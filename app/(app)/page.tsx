import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { loadRealizationTotals } from "@/lib/server/realization-totals";
import { fillMonths, rankMethods, type MethodRow } from "@/lib/dashboard";
import { rp } from "@/lib/format";
import { MonthlyChart } from "@/components/monthly-chart-lazy";
import { Donut, QuarterChart } from "@/components/dashboard-charts-lazy";
import { DashboardExplorer } from "@/components/dashboard-explorer";
import { ProviderRanking } from "@/components/provider-ranking";
import { loadProviderStats } from "@/lib/server/provider-data";
import { loadDashboardExtra } from "@/lib/server/dashboard-extra";
import { Suspense } from "react";
import { quarterOf } from "@/lib/stage-rule";
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

function Skel({ h = "h-64" }: { h?: string }) { return <div className={`${h} animate-pulse rounded-2xl bg-slate-100`} role="status" aria-label="Memuat" />; }
/** Bagian analitik (di-stream agar kartu utama tampil lebih dulu). Semua kartu dan baris dapat diklik menuju data terfilter. */
async function Insights({ sb, vid, yearId, unverified, unverifiedCount, overPagu, followup }: { sb: Awaited<ReturnType<typeof createClient>>; vid: string; yearId: string; unverified: string; unverifiedCount: number; overPagu: number; followup: number }) {
  const [x, prov] = await Promise.all([loadDashboardExtra(sb, vid, yearId), loadProviderStats(sb, yearId)]), nowQ = quarterOf(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)) ?? 1;   // triwulan berjalan (WIB)
  const tiles: { label: string; n: number | null; hint: string; href: string; bad: boolean }[] = [
    { label: "Belum diakui", n: unverifiedCount, hint: `${rp(unverified)} belum bertanggal SPM/SP2D`, href: "/realisasi?tab=daftar&cek=tanpa_tgl", bad: unverifiedCount > 0 },
    { label: "No SPM/SP2D kosong", n: x.alerts.noSpm, hint: "sudah bertanggal, nomor belum diisi", href: "/realisasi?tab=daftar&cek=tanpa_no", bad: (x.alerts.noSpm ?? 0) > 0 },
    { label: "Metode belum diisi", n: x.alerts.noMethod, hint: "berkode RUP tanpa metode pemilihan", href: "/realisasi?tab=daftar&cek=tanpa_metode", bad: (x.alerts.noMethod ?? 0) > 0 },
    { label: "Penyedia belum diisi", n: x.alerts.noProvider, hint: "transaksi pengadaan tanpa penyedia", href: "/realisasi?tab=daftar&cek=tanpa_penyedia", bad: (x.alerts.noProvider ?? 0) > 0 },
    { label: "Melampaui pagu", n: overPagu, hint: "rekening dengan realisasi > pagu", href: "/realisasi", bad: overPagu > 0 },
    { label: "Paket tindak lanjut", n: followup, hint: "paket pengadaan perlu ditindaklanjuti", href: "/paket?filter=tindak-lanjut", bad: followup > 0 }];
  return (
    <>
      <div className="space-y-2"><h2 className="text-base">Perlu perhatian</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{tiles.map((t) => <Link key={t.label} href={t.href} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-card ${t.bad ? "border-amber-300 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/50"}`}>
          <p className="text-xs font-semibold text-slate-600">{t.label}</p><p className={`mt-1 font-display text-2xl font-bold tabular-nums ${t.bad ? "text-amber-800" : "text-emerald-700"}`}>{t.n === null ? "-" : t.n}</p>
          <p className="mt-1 text-xs text-slate-600">{t.n === null ? "tersedia setelah migrasi penyedia" : t.bad ? t.hint : "Semua lengkap"}</p></Link>)}</div></div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5"><h2 className="mb-1">Anggaran kas vs realisasi per triwulan</h2><p className="mb-3 text-xs text-slate-500">Kas milik tahapan terpilih; kas triwulan sebelumnya yang belum terpakai dapat dipakai pada triwulan berikutnya, tetapi kas triwulan berikutnya tidak dapat dipakai lebih awal.</p>
          {x.hasCash ? <QuarterChart data={x.quarters} currentQuarter={nowQ} /> : <p className="alert alert-warn text-sm">Anggaran kas tahapan ini belum disusun. <Link className="link" href="/kas">Susun anggaran kas</Link>.</p>}</div>
        <div className="card p-5"><h2 className="mb-1">Realisasi menurut tahapan</h2><p className="mb-3 text-xs text-slate-500">Tahapan ditentukan otomatis oleh Tanggal SPM/SP2D.</p>
          {x.stages.length ? <Donut center="Total realisasi" data={x.stages.map((s) => ({ name: s.name, value: Number(s.value) }))} /> : <p className="text-slate-600">Belum ada realisasi diakui.</p>}</div>
      </div>
      <div className="card p-5"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2>Jelajahi anggaran dan serapan</h2><p className="text-xs text-slate-500">Klik baris untuk membuka Daftar transaksi dengan filter yang sama</p></div>
        <DashboardExplorer levels={x.levels} /></div>
      <div className="card p-5"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2>Peringkat penyedia</h2><p className="text-xs text-slate-500">Penyedia pelaksana pekerjaan seluruh tahapan pada tahun anggaran ini</p></div>
        <ProviderRanking list={prov.list} /></div>
      <div className="card p-5"><div className="mb-3 flex items-baseline justify-between"><h2>Transaksi terbaru</h2><Link href="/realisasi?tab=daftar" className="link text-sm">Lihat semua →</Link></div>
        {x.recent.length ? <ul className="divide-y divide-slate-100">{x.recent.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0 truncate"><span className="tabular-nums text-slate-500">{r.date}</span> · <b className="tabular-nums text-navy-800">{r.sub}</b> {r.text}</span>
          <span className="flex shrink-0 items-center gap-2"><span className={`badge ${r.recognized ? "badge-ok" : "badge-warn"}`}>{r.recognized ? "diakui" : "belum diakui"}</span><b className="tabular-nums">{rp(r.amount)}</b></span></li>)}</ul> : <p className="text-slate-600">Belum ada transaksi.</p>}</div>
    </>);
}
type Summary = { rup_count: number; pkg_processed: number; pkg_unprocessed: number; pkg_followup: number; result_total: number; contract_total: number; by_method: { name: string; count: number }[]; monthly: { month: number; verified: number }[] };
export default async function Home() {
  const ctx = await getBudgetContext(), sb = await createClient();
  if (!ctx?.versionId) return <section className="max-w-2xl space-y-2"><h1 className="page-title">Beranda</h1>
    <p className="text-slate-600">Belum ada versi anggaran untuk tahun/tahapan ini. Siapkan di menu <Link className="link" href="/anggaran/impor">Impor anggaran</Link>.</p><QuickLinks /></section>;
  const [{ data: s, error }, { totals: t, overPaguCount }, mr] = await Promise.all([sb.rpc("dashboard_summary", { p_version: ctx.versionId }), loadRealizationTotals(sb, ctx.versionId), sb.rpc("dashboard_method_ranking", { p_version: ctx.versionId })]);
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
      <Suspense fallback={<div className="space-y-6"><Skel h="h-28" /><Skel h="h-80" /><Skel h="h-96" /></div>}>
        <Insights sb={sb} vid={ctx.versionId} yearId={ctx.yearId} unverified={t.unverified} unverifiedCount={t.unverifiedCount} overPagu={overPaguCount} followup={d.pkg_followup} /></Suspense>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5"><h2 className="mb-3">Realisasi per bulan</h2>
          {d.monthly.length ? <MonthlyChart data={fillMonths(d.monthly)} /> : <p className="text-slate-600">Belum ada transaksi pada tahun/tahapan ini.</p>}</div>
        <div className="card p-5"><h2 className="mb-3">Status paket pengadaan</h2>
          {d.pkg_processed + d.pkg_unprocessed > 0 ? <Donut unit="" center="Total paket" data={[{ name: "Sudah diproses", value: d.pkg_processed }, { name: "Belum diproses", value: d.pkg_unprocessed }].filter((x) => x.value > 0)} /> : <p className="text-slate-600">Belum ada paket.</p>}
          <Link href="/paket" className="link mt-2 inline-block text-sm">Buka daftar paket →</Link></div>
      </div>
      {!ranking && <div className="card p-5"><h2 className="mb-3">Paket per metode pemilihan</h2>
        {d.by_method.length ? <ul className="divide-y divide-slate-100">{d.by_method.map((x) => <li key={x.name} className="flex items-center justify-between py-2.5"><span>{x.name}</span><b className="badge badge-info tabular-nums">{x.count}</b></li>)}</ul> : <p className="text-slate-600">Belum ada paket pengadaan.</p>}
        {mr.error && <p className="mt-3 text-xs text-slate-500">Peringkat realisasi per metode belum tersedia: jalankan migrasi database 20260118_peringkat_metode di Supabase.</p>}</div>}
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
