import Link from "next/link";
import { MASTERS } from "@/lib/masters";
import { Icon } from "@/components/icons";
export const metadata = { title: "Master data" };
export default function MasterIndex() {
  return (
    <section className="max-w-5xl space-y-5">
      <div><p className="eyebrow">Pengelolaan</p><h1 className="page-title">Master data</h1><p className="page-desc">Referensi yang dipakai di seluruh aplikasi: program, kegiatan, sumber dana, pejabat, penyedia, dan lainnya.</p></div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{MASTERS.map((m) => (
        <li key={m.slug}><Link href={`/master/${m.slug}`} className="card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-glow">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-50 to-indigo-50 text-cyan-800"><Icon name="database" /></span>
          <span className="font-semibold text-navy-800">{m.title}</span></Link></li>))}</ul>
    </section>);
}
