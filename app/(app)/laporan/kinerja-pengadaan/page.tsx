import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getPrintProfile } from "@/lib/server/print-profile";
import { fetchAll } from "@/lib/server/fetch-all";
import { parseRupiah } from "@/lib/import/parse";
import type { PerfPackage } from "@/lib/officer-performance";
import { PerformanceDeck } from "@/components/performance-deck";
export const metadata = { title: "Laporan kinerja pejabat pengadaan" };

export default async function KinerjaPengadaanPage() {
  const [s, ctx] = await Promise.all([getSession(), getBudgetContext()]); if (!s) return null;
  if (!ctx?.versionId) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini.</p>;
  const sb = await createClient(), vid = ctx.versionId, profile = await getPrintProfile(s);
  const [pk, ct, st] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("procurement_packages").select("id, internal_code, name, pagu, status, due_date, handover_date, process_start, process_end, obstacle_category, ppbj:officials!ppbj_id(name)").eq("budget_version_id", vid).order("internal_code").range(f, t)),
    fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("id, procurement_package_id, contract_value, procurement_packages!inner(budget_version_id)").eq("procurement_packages.budget_version_id", vid).order("id").range(f, t)),
    sb.from("package_statuses").select("code, name, stage_group")]);
  const sm = new Map((st.data ?? []).map((x: any) => [x.code, x])), cv = new Map<string, bigint>(), has = new Set<string>();
  for (const c of ct) { const v = parseRupiah(c.contract_value); if (v === null) continue; has.add(c.procurement_package_id); cv.set(c.procurement_package_id, (cv.get(c.procurement_package_id) ?? 0n) + BigInt(v.replace(".", ""))); }
  const pkgs: PerfPackage[] = pk.map((p) => ({ id: p.id, code: p.internal_code, name: p.name, officer: p.ppbj?.name ?? null, pagu: parseRupiah(p.pagu) ?? "0.00", status: p.status, statusName: sm.get(p.status)?.name ?? p.status, group: sm.get(p.status)?.stage_group ?? null,
    due: p.due_date, handover: p.handover_date, start: p.process_start, end: p.process_end, obstacle: p.obstacle_category,
    contract: has.has(p.id) ? `${(cv.get(p.id) ?? 0n) / 100n}.${String((cv.get(p.id) ?? 0n) % 100n).padStart(2, "0")}` : null }));
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);   // WIB
  return (
    <section className="space-y-4">
      <Link href="/laporan" className="no-print link text-sm">← Laporan &amp; dokumen</Link>
      <PerformanceDeck pkgs={pkgs} today={today} year={ctx.year} stageName={ctx.stageName} profile={profile} printer={{ name: s.profile.full_name, nip: s.profile.nip }} />
    </section>
  );
}
