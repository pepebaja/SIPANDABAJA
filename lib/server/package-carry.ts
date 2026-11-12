import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { loadStageVersions } from "./stage-versions";
import { modeOfMethod } from "@/lib/packages";
const INITIAL = "RENCANA";
const COPY = ["status", "execution_mode", "ppbj_id", "ppk_id", "pptk_id", "assigned_date", "docs_received_date", "process_start", "process_end", "due_date", "handover_date", "obstacle_category", "notes", "is_recurring"] as const;
const CONTRACT_COPY = ["provider_id", "doc_type", "doc_number", "doc_date", "selection_result_value", "contract_value", "verification_status", "description"] as const;
/** Tahapan sebelum tahapan ini pada tahun yang sama (urut dari yang paling awal): sortOrder lebih kecil, atau versi lebih lama pada tahapan yang sama. */
export async function earlierVersionIds(sb: SupabaseClient, yearId: string, versionId: string): Promise<string[]> {
  const vs = await loadStageVersions(sb, yearId), cur = vs.find((v) => v.id === versionId); if (!cur) return [];
  return vs.filter((v) => v.sortOrder < cur.sortOrder || (v.sortOrder === cur.sortOrder && v.versionNo < cur.versionNo)).sort((a, b) => a.sortOrder - b.sortOrder || a.versionNo - b.versionNo).map((v) => v.id);
}
/**
 * Membuat paket untuk setiap RUP tahapan ini yang belum punya paket. Bila paket dengan kode RUP yang sama sudah ada pada tahapan sebelumnya,
 * paket itu DIBAWA: status, pejabat, tanggal proses, tenggat, sifat berulang, dan seluruh kontrak/SP ikut disalin (paket yang sudah berjalan
 * atau selesai tidak kembali menjadi "Rencana"). Nama, pagu, dan jenis mengikuti RUP tahapan ini; metode mengikuti paket sebelumnya.
 * Paket yang masih "Rencana", belum punya kontrak, dan belum pernah dibawa disegarkan dari tahapan sebelumnya bila di sana sudah berjalan.
 */
export async function syncPackagesFromRup(sb: SupabaseClient, yearId: string, versionId: string): Promise<{ made: number; carried: number; refreshed: number }> {
  const earlier = await earlierVersionIds(sb, yearId, versionId);
  const [rups, have, prevAll] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, name, pagu, procurement_type, planned_method_id, method:procurement_methods(name)").eq("budget_version_id", versionId).order("rup_code").range(f, t)),
    fetchAll<any>((f, t) => sb.from("procurement_packages").select("id, rup_package_id, internal_code, status, carried_from").eq("budget_version_id", versionId).order("id").range(f, t)),
    earlier.length ? fetchAll<any>((f, t) => sb.from("procurement_packages").select("*").in("budget_version_id", earlier).order("id").range(f, t)) : Promise.resolve([] as any[])]);
  const order = new Map(earlier.map((id, i) => [id, i])), prev = new Map<string, any>();
  for (const p of [...prevAll].sort((a, b) => (order.get(a.budget_version_id) ?? 0) - (order.get(b.budget_version_id) ?? 0))) prev.set(p.internal_code, p);   // tahapan terbaru menimpa
  const used = new Set(have.map((h) => h.rup_package_id).filter(Boolean));
  const fresh = rups.filter((r) => !used.has(r.id)), haveByRup = new Map(have.map((h) => [h.rup_package_id, h]));
  const contractsOf = async (pkgIds: string[]) => (pkgIds.length ? fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("*").in("procurement_package_id", pkgIds).order("created_at").range(f, t)) : Promise.resolve([] as any[]));
  const copyContracts = async (pairs: [string, string][]) => {   // [paket lama, paket baru]
    const cs = await contractsOf(pairs.map((p) => p[0])), to = new Map(pairs), rows = cs.map((c) => ({ procurement_package_id: to.get(c.procurement_package_id), ...Object.fromEntries(CONTRACT_COPY.map((k) => [k, c[k] ?? null])) }));
    for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from("contracts_or_orders").insert(rows.slice(i, i + 200)); if (error) throw error; }
  };
  const base = (r: any, p: any) => ({ budget_version_id: versionId, rup_package_id: r.id, internal_code: r.rup_code, name: r.name, pagu: r.pagu, method_id: p?.method_id ?? r.planned_method_id, procurement_type: p?.procurement_type ?? r.procurement_type,
    execution_mode: p?.execution_mode ?? modeOfMethod(r.method?.name) });
  let carried = 0; const pairs: [string, string][] = [];
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200), rows = chunk.map((r) => { const p = prev.get(r.rup_code); return p ? { ...base(r, p), ...Object.fromEntries(COPY.map((k) => [k, p[k] ?? null]).filter(([k, v]) => v !== null || k === "obstacle_category")), carried_from: p.id } : base(r, null); });
    const { data, error } = await sb.from("procurement_packages").insert(rows).select("id, internal_code, carried_from"); if (error) throw error;
    for (const d of data ?? []) if (d.carried_from) { carried++; pairs.push([d.carried_from, d.id]); }
  }
  // Segarkan paket tahapan ini yang masih "Rencana" tanpa kontrak, bila di tahapan sebelumnya sudah berjalan.
  const cand = rups.map((r) => ({ r, h: haveByRup.get(r.id), p: prev.get(r.rup_code) })).filter((x) => x.h && x.p && !x.h.carried_from && x.h.status === INITIAL && x.p.status !== INITIAL);
  const existingContracts = new Set((await contractsOf(cand.map((x) => x.h.id))).map((c) => c.procurement_package_id)); let refreshed = 0;
  for (const x of cand.filter((y) => !existingContracts.has(y.h.id))) {
    const { error } = await sb.from("procurement_packages").update({ ...Object.fromEntries(COPY.map((k) => [k, x.p[k] ?? null]).filter(([k, v]) => v !== null || k === "obstacle_category")), method_id: x.p.method_id ?? x.r.planned_method_id, carried_from: x.p.id }).eq("id", x.h.id);
    if (error) throw error; refreshed++; pairs.push([x.p.id, x.h.id]);
  }
  if (pairs.length) await copyContracts(pairs);
  return { made: fresh.length, carried, refreshed };
}
