import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getPrintProfile } from "@/lib/server/print-profile";
import { fetchAll } from "@/lib/server/fetch-all";
import { parseRupiah } from "@/lib/import/parse";
import { fromCents, sumCents } from "@/lib/money";
import { progressOf, type PerfPackage } from "@/lib/officer-performance";
import { isEPurchasing, type EpItem } from "@/lib/epurchasing-analysis";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { reportCompleteness } from "@/lib/report-completeness";
import { PerformanceDeck } from "@/components/performance-deck";
export const metadata = { title: "Laporan kinerja pejabat pengadaan" };

export default async function KinerjaPengadaanPage() {
  const [s, ctx] = await Promise.all([getSession(), getBudgetContext()]); if (!s) return null;
  if (!ctx?.versionId) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini.</p>;
  const sb = await createClient(), vid = ctx.versionId, profile = await getPrintProfile(s);
  const versions = await loadStageVersions(sb, ctx.yearId), curV = versions.find((v) => v.id === vid);
  const vids = versions.filter((v) => v.id === vid || (curV && v.sortOrder < curV.sortOrder)).map((v) => v.id);   // realisasi kumulatif tahapan
  const [pk, ct, st, rups, rtx] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("procurement_packages").select("id, internal_code, name, pagu, status, due_date, handover_date, process_start, process_end, obstacle_category, is_recurring, rup_package_id, ppbj:officials!ppbj_id(name), method:procurement_methods(code, name), rup:rup_packages(rup_code, name, pagu, planned:procurement_methods!planned_method_id(code, name))").eq("budget_version_id", vid).order("internal_code").range(f, t)),
    fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("id, procurement_package_id, contract_value, procurement_packages!inner(budget_version_id)").eq("procurement_packages.budget_version_id", vid).order("id").range(f, t)),
    sb.from("package_statuses").select("code, name, stage_group"),
    fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, name, pagu, planned:procurement_methods!planned_method_id(code, name)").eq("budget_version_id", vid).order("rup_code").range(f, t)),
    fetchAll<any>((f, t) => sb.from("transactions").select("amount, rup_packages!inner(rup_code)").in("budget_version_id", vids.length ? vids : [vid]).not("payment_date", "is", null).not("rup_package_id", "is", null).order("id").range(f, t))]);
  const realBy = new Map<string, string[]>(); for (const x of rtx) { const c = x.rup_packages?.rup_code; if (c) (realBy.get(c) ?? realBy.set(c, []).get(c)!).push(parseRupiah(x.amount) ?? "0.00"); }
  const realOf = (code: string) => fromCents(sumCents(realBy.get(code) ?? []));
  const sm = new Map((st.data ?? []).map((x: any) => [x.code, x])), cv = new Map<string, bigint>(), has = new Set<string>();
  for (const c of ct) { const v = parseRupiah(c.contract_value); if (v === null) continue; has.add(c.procurement_package_id); cv.set(c.procurement_package_id, (cv.get(c.procurement_package_id) ?? 0n) + BigInt(v.replace(".", ""))); }
  const pkgs: PerfPackage[] = pk.map((p) => ({ id: p.id, code: p.internal_code, name: p.name, officer: p.ppbj?.name ?? null, pagu: parseRupiah(p.pagu) ?? "0.00", status: p.status, statusName: sm.get(p.status)?.name ?? p.status, group: sm.get(p.status)?.stage_group ?? null,
    due: p.due_date, recurring: !!p.is_recurring, handover: p.handover_date, start: p.process_start, end: p.process_end, obstacle: p.obstacle_category,
    contract: has.has(p.id) ? `${(cv.get(p.id) ?? 0n) / 100n}.${String((cv.get(p.id) ?? 0n) % 100n).padStart(2, "0")}` : null }));
  const NONE = "Belum ditentukan", linked = new Set(pk.map((p: any) => p.rup_package_id).filter(Boolean));
  const epItems: EpItem[] = [
    ...pk.map((p: any): EpItem => { const code = p.rup?.rup_code ?? p.internal_code, mt = p.method ?? p.rup?.planned ?? null, pl = p.rup?.planned ?? null;
      return { code, name: p.name, officer: p.ppbj?.name ?? null, hasPackage: true, cancelled: progressOf({ status: p.status, group: sm.get(p.status)?.stage_group ?? null }) === "batalTunda", methodName: mt?.name ?? NONE, isEp: !!mt && isEPurchasing(mt),
        plannedName: pl?.name ?? null, plannedIsEp: !!pl && isEPurchasing(pl), pagu: parseRupiah(p.rup?.pagu ?? p.pagu) ?? "0.00", contract: has.has(p.id) ? `${(cv.get(p.id) ?? 0n) / 100n}.${String((cv.get(p.id) ?? 0n) % 100n).padStart(2, "0")}` : null, realized: realOf(code) }; }),
    ...rups.filter((r: any) => !linked.has(r.id)).map((r: any): EpItem => ({ code: r.rup_code, name: r.name, officer: null, hasPackage: false, cancelled: false, methodName: r.planned?.name ?? NONE, isEp: !!r.planned && isEPurchasing(r.planned),
      plannedName: r.planned?.name ?? null, plannedIsEp: !!r.planned && isEPurchasing(r.planned), pagu: parseRupiah(r.pagu) ?? "0.00", contract: null, realized: realOf(r.rup_code) }))];
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);   // WIB
  const methodNone = new Map(epItems.filter((e) => e.hasPackage).map((e) => [e.code, e.methodName === NONE])), gaps = reportCompleteness(pkgs.map((p) => ({ ...p, methodMissing: methodNone.get(p.code) ?? false })), today), totalGap = gaps.reduce((a, g) => a + g.missing, 0);
  const completeness = (
    <details className="card no-print p-4" open={totalGap > 0}>
      <summary className="cursor-pointer font-display font-bold text-navy-800">Kelengkapan data laporan {totalGap > 0 ? `(${totalGap} isian perlu dilengkapi)` : "(lengkap)"}</summary>
      <p className="mt-2 text-sm text-slate-600">Laporan dihitung dari data paket. Isian yang kosong membuat bagian laporan terkait tidak terhitung atau muncul sebagai "(Belum ditetapkan)". Klik jumlah untuk membuka daftar paket yang perlu dilengkapi, lalu gunakan tombol <b>Ubah</b>. Tombol <b>Sinkronkan dengan realisasi</b> di Paket pengadaan mengisi sebagian otomatis dari Input Realisasi.</p>
      <div className="table-wrap mt-3 shadow-none"><table><caption className="sr-only">Kelengkapan data laporan kinerja</caption><thead><tr><th scope="col">Isian</th><th scope="col">Dipakai pada</th><th scope="col">Cara melengkapi</th><th scope="col" className="text-right">Kosong</th></tr></thead>
        <tbody>{gaps.map((g) => <tr key={g.key}><td className="font-medium">{g.label}</td><td className="text-sm">{g.affects}</td><td className="text-sm text-slate-600">{g.how}</td>
          <td className="text-right tabular-nums">{g.missing > 0 ? <a className="link font-semibold text-amber-800" href={`/paket?lengkapi=${g.key}`}>{g.missing} dari {g.of}</a> : <span className="text-emerald-700">lengkap ({g.of})</span>}</td></tr>)}</tbody></table></div>
    </details>
  );
  return (
    <section className="space-y-4">
      <Link href="/laporan" className="no-print link text-sm">← Laporan &amp; dokumen</Link>
      {completeness}
      <PerformanceDeck pkgs={pkgs} epItems={epItems} today={today} year={ctx.year} stageName={ctx.stageName} profile={profile} printer={{ name: s.profile.full_name, nip: s.profile.nip }} />
    </section>
  );
}
