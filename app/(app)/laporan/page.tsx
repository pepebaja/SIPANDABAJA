import Link from "next/link";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { can } from "@/lib/rbac";
import { REPORTS } from "@/lib/report-types";
import { Icon } from "@/components/icons";
export const metadata = { title: "Laporan & dokumen" };
const DOCS: [string, string, string, string][] = [
  ["/panduan", "Panduan pengguna", "Cara memakai setiap menu, alur kerja, dan hak akses per peran. Dapat dicetak.", "book"],
  ["/dokumen/formulir-akun", "Formulir permohonan akun", "Formulir kosong bermaterai kop OPD untuk meminta akun pengguna baru beserta pernyataan penggunaan.", "file"],
  ["/api/templates/budget", "Template impor anggaran (Excel)", "Berkas Excel dengan kolom yang dibutuhkan untuk mengimpor anggaran.", "download"],
];
export default async function LaporanPage() {
  const [s, ctx] = await Promise.all([getSession(), getBudgetContext()]);
  if (!s) return null;
  const list = REPORTS.filter((r) => !r.permission || can(s.roles, r.permission));
  return (
    <section className="max-w-6xl space-y-8">
      <div><p className="eyebrow">Pusat dokumen</p><h1 className="page-title">Laporan &amp; dokumen {ctx && <span className="page-sub">Tahun {ctx.year} · {ctx.stageName}</span>}</h1>
        <p className="page-desc">Setiap laporan dapat dicetak (kop surat dan tanda tangan otomatis) atau diunduh sebagai Excel. Data mengikuti tahun/tahapan yang dipilih di bagian atas.</p></div>
      <div>
        <h2 className="mb-3">Laporan data</h2>
        <ul className="grid gap-4 md:grid-cols-2">{list.map((r) => (
          <li key={r.slug} className="card flex flex-col gap-4 p-5">
            <div><h3 className="font-display text-base font-bold text-navy-800">{r.title}</h3><p className="mt-1 text-sm text-slate-600">{r.description}</p></div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link href={`/laporan/${r.slug}`} className="btn btn-primary btn-sm"><Icon name="printer" className="h-4 w-4" />Lihat &amp; cetak</Link>
              <a href={`/api/laporan/${r.slug}`} className="btn btn-ghost btn-sm"><Icon name="download" className="h-4 w-4" />Excel</a>
            </div>
          </li>))}</ul>
      </div>
      <div>
        <h2 className="mb-3">Dokumen administrasi</h2>
        <ul className="grid gap-4 md:grid-cols-3">{DOCS.map(([href, t, d, icon]) => (
          <li key={href}><a href={href} className="card group flex h-full flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-glow">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-50 to-indigo-50 text-cyan-800"><Icon name={icon as "book"} /></span>
            <span className="font-display font-bold text-navy-800">{t}</span><span className="text-sm text-slate-600">{d}</span></a></li>))}</ul>
      </div>
    </section>
  );
}
