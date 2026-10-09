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
      <div className="space-y-3"><h1 className="text-2xl font-semibold text-navy-800">Paket RUP <span className="text-base font-normal text-slate-600">Tahun {ctx.year}, {ctx.stageName}</span></h1>
        {error ? <p role="alert" className="text-red-800">Data tidak dapat dimuat.</p> : !data?.length ? <p className="text-slate-600">Belum ada paket RUP. Tambahkan lewat formulir.</p> : (
          <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Kode RUP</th><th className="p-2">Nama</th><th className="p-2">Jenis</th><th className="p-2 text-right">Pagu</th><th className="p-2">Verifikasi</th></tr></thead>
            <tbody>{data.map((r) => <tr key={r.id} className="border-b"><td className="p-2">{r.rup_code}</td><td className="p-2">{r.name}</td><td className="p-2">{TYPES[r.procurement_type]}</td><td className="p-2 text-right tabular-nums">{rp(r.pagu)}</td><td className="p-2">{r.verification_status === "verified" ? "Terverifikasi" : "Belum diverifikasi"}</td></tr>)}</tbody></table>)}
        {(count ?? 0) > 100 && <p className="text-xs text-slate-600">Menampilkan 100 dari {count} paket.</p>}</div>
      <RupForm methods={(m ?? []).map((r) => ({ value: r.id, label: r.name }))} />
    </section>);
}
