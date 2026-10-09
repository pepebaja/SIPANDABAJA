import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadEntries } from "@/lib/server/entries";
import { AllocationForm } from "@/components/allocation-form";
import { parseRupiah } from "@/lib/import/parse";
import { remaining } from "@/lib/allocations";
import { rp } from "@/lib/format";
import { deleteAllocation } from "./actions";
export default async function RupDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params, sp = await searchParams, sb = await createClient();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: r } = await sb.from("rup_packages").select("id, rup_code, name, pagu, budget_version_id").eq("id", id).maybeSingle();
  if (!r) notFound();
  const [entries, mine, all] = await Promise.all([loadEntries(sb, r.budget_version_id),
    sb.from("package_budget_allocations").select("id, budget_entry_id, amount").eq("rup_package_id", id),
    sb.from("package_budget_allocations").select("budget_entry_id, amount, rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", r.budget_version_id).limit(10000)]);
  const money = (v: unknown) => parseRupiah(v) ?? "0.00", label = new Map(entries.map((e) => [e.id, e.label]));
  const usedBy = (eid: string) => (all.data ?? []).filter((a) => a.budget_entry_id === eid).map((a) => money(a.amount));
  const pkgLeft = remaining(money(r.pagu), (mine.data ?? []).map((a) => money(a.amount)));
  const options = entries.map((e) => ({ value: e.id, label: `${e.label} (sisa ${rp(remaining(e.amount, usedBy(e.id)))})` }));
  return (
    <section className="max-w-4xl space-y-5">
      <Link href="/rup" className="link text-sm">Kembali ke daftar RUP</Link>
      <div><h1 className="page-title">{r.name}</h1><p className="text-slate-600">Kode RUP {r.rup_code}, pagu {rp(r.pagu)}, belum dialokasikan {rp(pkgLeft)}</p></div>
      {sp.error && <p role="alert" className="alert alert-error">Penghapusan gagal. Anda mungkin tidak berwenang.</p>}
      {mine.data?.length ? <div className="table-wrap"><table><thead><tr><th>Rekening anggaran</th><th className="text-right">Alokasi</th><th>Aksi</th></tr></thead>
        <tbody>{mine.data.map((a) => <tr key={a.id}><td>{label.get(a.budget_entry_id) ?? a.budget_entry_id}</td><td className="text-right">{rp(a.amount)}</td>
          <td><form action={deleteAllocation}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="rup" value={id} /><button className="link">Hapus alokasi</button></form></td></tr>)}</tbody></table></div>
        : <p className="text-sm text-slate-600">Belum ada alokasi. Satu paket bisa memakai beberapa rekening, dan satu rekening bisa membiayai beberapa paket.</p>}
      {entries.length ? <AllocationForm rupId={id} options={options} /> : <p className="text-sm text-slate-600">Belum ada rekening anggaran pada versi ini. Impor anggaran lebih dulu.</p>}
    </section>);
}
