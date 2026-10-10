import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickYear } from "@/lib/context";

export type ContextOptions = { years: { id: string; label: string }[]; stages: { id: string; label: string }[]; defaultYearId: string; defaultStageId: string };
/** Pilihan tahun/tahapan untuk halaman login (sebelum ada sesi). Hanya angka tahun dan nama tahapan yang dibuka. */
export async function loadContextOptions(savedYearId?: string, savedStageId?: string): Promise<ContextOptions | null> {
  try {
    const admin = createAdminClient();
    const { data: org } = await admin.from("organizations").select("id").limit(1).maybeSingle();
    if (!org) return null;
    const [y, s] = await Promise.all([
      admin.from("budget_years").select("id, year").eq("organization_id", org.id).eq("is_active", true).order("year"),
      admin.from("budget_stages").select("id, name").eq("organization_id", org.id).eq("is_active", true).order("sort_order")]);
    if (!y.data?.length || !s.data?.length) return null;
    const year = pickYear(y.data, savedYearId)!, stage = s.data.find((x) => x.id === savedStageId) ?? s.data[0]!;
    return { years: y.data.map((r) => ({ id: r.id, label: String(r.year) })), stages: s.data.map((r) => ({ id: r.id, label: r.name })), defaultYearId: year.id, defaultStageId: stage.id };
  } catch { return null; }
}
