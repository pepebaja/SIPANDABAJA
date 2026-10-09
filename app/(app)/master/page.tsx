import Link from "next/link";
import { MASTERS } from "@/lib/masters";
export default function MasterIndex() {
  return <section className="max-w-xl space-y-3"><h1 className="text-2xl font-semibold text-navy-800">Master data</h1>
    <ul className="space-y-1">{MASTERS.map((m) => <li key={m.slug}><Link className="text-teal-700 underline" href={`/master/${m.slug}`}>{m.title}</Link></li>)}</ul></section>;
}
