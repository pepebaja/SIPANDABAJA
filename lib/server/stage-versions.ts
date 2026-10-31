import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageVersion } from "@/lib/stage-rule";

/** Semua versi anggaran pada satu tahun beserta tahapan dan tanggal mulai berlakunya. */
export async function loadStageVersions(sb: SupabaseClient, yearId: string): Promise<StageVersion[]> {
  let data: any[] | null; const first = await sb.from("budget_versions").select("id, version_no, effective_from, budget_stages(code, name, sort_order)").eq("budget_year_id", yearId);
  data = first.data; if (first.error) ({ data } = await sb.from("budget_versions").select("id, version_no, budget_stages(code, name, sort_order)").eq("budget_year_id", yearId)); // migrasi 20260112 belum dijalankan: tampilan tetap jalan
  return (data ?? []).map((v: any) => ({ id: v.id, versionNo: v.version_no, effectiveFrom: v.effective_from ?? null,
    stageCode: v.budget_stages?.code ?? "", stageName: v.budget_stages?.name ?? "", sortOrder: v.budget_stages?.sort_order ?? 0 })).sort((a, b) => a.sortOrder - b.sortOrder || a.versionNo - b.versionNo);
}
