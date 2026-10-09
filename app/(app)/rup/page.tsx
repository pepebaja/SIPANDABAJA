import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { RupForm } from "@/components/rup-form";
import { rp } from "@/lib/format";
const TYPES: Record<string, string> = { barang: "Barang", konstruksi: "Konstruksi", konsultansi: "Konsultansi", jasa_lainnya: "Jasa lainnya" };
export default async function RupPage() {
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient();
  const [{ data, count, error }, { data: m }] = await Promise.all([
    sb.from("rup_packages").select("id, rup_code, name, procurement_type, pagu, verification_status", { count: "exact" }).eq("budget_version_id", ctx.versionId).order("rup_code").limit(100),
    sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name")]);
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3"><h1 className="page-title">Paket RUP <span className="page-sub">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        {error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat.</p> : !data?.length ? <p className="text-slate-600">Belum ada paket RUP. Tambahkan lewat formulir.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Kode RUP</th><th>Nama</th><th>Jenis</th><th className="text-right">Pagu</th><th>Verifikasi</th></tr></thead>
            <tbody>{data.map((r) => <tr key={r.id}><td><Link className="link" href={`/rup/${r.id}`}>{r.rup_code}</Link></td><td>{r.name}</td><td>{TYPES[r.procurement_type]}</td><td className="text-right tabular-nums">{rp(r.pagu)}</td><td>{r.verification_status === "verified" ? "Terverifikasi" : "Belum diverifikasi"}</td></tr>)}</tbody></table></div>)}
        {(count ?? 0) > 100 && <p className="text-xs text-slate-600">Menampilkan 100 dari {count} paket.</p>}</div>
      <RupForm methods={(m ?? []).map((r) => ({ value: r.id, label: r.name }))} />
    </section>);
}
