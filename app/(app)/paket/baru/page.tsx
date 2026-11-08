import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { fetchAll } from "@/lib/server/fetch-all";
import { can } from "@/lib/rbac";
import { PackageForm, type RupInfo } from "@/components/package-form";
import { parseRupiah } from "@/lib/import/parse";
const TYPE: Record<string, string> = { barang: "Barang", konstruksi: "Pekerjaan konstruksi", konsultansi: "Jasa konsultansi", jasa_lainnya: "Jasa lainnya" };
export const metadata = { title: "Tambah paket pengadaan" };
export default async function NewPackage() {
  const [ctx, s] = await Promise.all([getBudgetContext(), getSession()]), sb = await createClient();
  if (!ctx?.versionId || !s) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini.</p>;
  const vid = ctx.versionId;
  const [rups, have, allocs, o] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, name, pagu, procurement_type, method:procurement_methods(name)").eq("budget_version_id", vid).order("rup_code").range(f, t)),
    fetchAll<any>((f, t) => sb.from("procurement_packages").select("id, rup_package_id").eq("budget_version_id", vid).order("id").range(f, t)),
    fetchAll<any>((f, t) => sb.from("package_budget_allocations").select("id, rup_package_id, entry:budget_entries(pptk_id, subactivities(code), expenditure_accounts(code)), rup:rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", vid).order("id").range(f, t)),
    sb.from("officials").select("id, name, nip, official_type").eq("is_active", true).order("name").limit(1000)]);
  const used = new Set(have.map((h) => h.rup_package_id).filter(Boolean)), byRup = new Map<string, any[]>();
  for (const a of allocs) byRup.set(a.rup_package_id, [...(byRup.get(a.rup_package_id) ?? []), a.entry]);
  const info: RupInfo[] = rups.map((r) => {
    const es = (byRup.get(r.id) ?? []).filter(Boolean), pt = [...new Set(es.map((e) => e.pptk_id).filter(Boolean))] as string[];
    return { code: r.rup_code, name: r.name, pagu: parseRupiah(r.pagu) ?? "0.00", type: TYPE[r.procurement_type] ?? r.procurement_type, method: r.method?.name ?? null, pptkId: pt.length === 1 ? pt[0]! : null,
      entries: [...new Set(es.map((e) => `${e.subactivities?.code ?? ""} / ${e.expenditure_accounts?.code ?? ""}`))].slice(0, 6), hasPackage: used.has(r.id) };
  });
  const by = (t: string) => (o.data ?? []).filter((r) => r.official_type === t).map((r) => ({ value: r.id, label: r.nip ? `${r.name} - NIP ${r.nip}` : r.name }));
  return <section className="space-y-4"><h1 className="page-title">Tambah paket pengadaan</h1>
    <PackageForm rups={info} ppbj={by("ppbj")} ppk={by("ppk")} pptk={by("pptk")} canManage={can(s.roles, "budget-setup:write")} /></section>;
}
