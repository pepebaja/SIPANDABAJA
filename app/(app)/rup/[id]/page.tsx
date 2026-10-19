import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadEntries } from "@/lib/server/entries";
import { AllocationForm } from "@/components/allocation-form";
import { parseRupiah } from "@/lib/import/parse";
import { remaining } from "@/lib/allocations";
import { rp } from "@/lib/format";
import { deleteAllocation } from "./actions";
import { deleteRup } from "../actions";
import { RupForm } from "@/components/rup-form";
import { ConfirmButton } from "@/components/confirm-button";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { toCents } from "@/lib/money";
export default async function RupDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params, sp = await searchParams, sb = await createClient();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: r } = await sb.from("rup_packages").select("id, rup_code, name, pagu, budget_version_id, procurement_type, planned_method_id").eq("id", id).maybeSingle();
  if (!r) notFound();
  const [session, { data: methods }, { count: linkedCount }] = await Promise.all([getSession(), sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name"),
    sb.from("procurement_packages").select("id", { count: "exact", head: true }).eq("rup_package_id", id)]);
  const canWrite = !!session && can(session.roles, "rup:write");
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
      {toCents(pkgLeft) < 0n && <p role="alert" className="alert alert-warn">Total alokasi melebihi pagu paket sebesar {rp(pkgLeft.replace("-", ""))}. Kurangi alokasi pada rekening di bawah (umumnya akibat pagu RUP diturunkan setelah pergeseran anggaran).</p>}
      {canWrite && (
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
          <RupForm methods={(methods ?? []).map((m) => ({ value: m.id, label: m.name }))} initial={{ id: r.id, rup_code: r.rup_code, name: r.name, procurement_type: r.procurement_type, planned_method_id: r.planned_method_id, pagu: String(parseRupiah(r.pagu) ?? "0.00") }} />
          <form action={deleteRup} className="card space-y-2 p-4 md:w-72"><input type="hidden" name="id" value={id} /><h2 className="font-semibold">Hapus paket RUP</h2>
            <p className="text-xs text-slate-600">Gunakan bila RUP dibatalkan/ditiadakan. {mine.data?.length ? `${mine.data.length} alokasi rekening ikut terhapus. ` : ""}{linkedCount ? `${linkedCount} paket pengadaan hanya dilepas tautan RUP-nya.` : ""}</p>
            <ConfirmButton className="btn btn-danger btn-sm" message={`Hapus paket RUP ${r.rup_code}? Tindakan ini tidak dapat dibatalkan (tercatat di log audit).`}>Hapus paket RUP</ConfirmButton></form>
        </div>)}
      {mine.data?.length ? <div className="table-wrap"><table><thead><tr><th>Rekening anggaran</th><th className="text-right">Alokasi</th><th>Aksi</th></tr></thead>
        <tbody>{mine.data.map((a) => <tr key={a.id}><td>{label.get(a.budget_entry_id) ?? a.budget_entry_id}</td><td className="text-right">{rp(a.amount)}</td>
          <td><form action={deleteAllocation}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="rup" value={id} /><button className="link">Hapus alokasi</button></form></td></tr>)}</tbody></table></div>
        : <p className="text-sm text-slate-600">Belum ada alokasi. Satu paket bisa memakai beberapa rekening, dan satu rekening bisa membiayai beberapa paket.</p>}
      {entries.length ? <AllocationForm rupId={id} options={options} /> : <p className="text-sm text-slate-600">Belum ada rekening anggaran pada versi ini. Impor anggaran lebih dulu.</p>}
    </section>);
}
