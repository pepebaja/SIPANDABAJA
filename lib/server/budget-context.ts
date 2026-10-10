import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CONTEXT_COOKIE, decodeContext, pickYear } from "@/lib/context";
export type ActiveContext = { year: number; yearId: string; stageId: string; stageName: string; versionId: string | null };
/** Konteks tahun/tahapan aktif + versi anggaran terbaru (divalidasi lewat RLS). */
export async function getBudgetContext(): Promise<ActiveContext | null> {
  const sb = await createClient();
  const saved = decodeContext((await cookies()).get(CONTEXT_COOKIE)?.value);
  const [{ data: years }, { data: stages }] = await Promise.all([
    sb.from("budget_years").select("id, year").eq("is_active", true).order("year"),
    sb.from("budget_stages").select("id, name").eq("is_active", true).order("sort_order")]);
  const y = pickYear(years ?? [], saved?.yearId);
  const s = stages?.find((r) => r.id === saved?.stageId) ?? stages?.[0];
  if (!y || !s) return null;
  const { data: v } = await sb.from("budget_versions").select("id").eq("budget_year_id", y.id).eq("budget_stage_id", s.id)
    .order("version_no", { ascending: false }).limit(1).maybeSingle();
  return { year: y.year, yearId: y.id, stageId: s.id, stageName: s.name, versionId: v?.id ?? null };
}
