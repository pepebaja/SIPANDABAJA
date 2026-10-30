import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CONTEXT_COOKIE, decodeContext, pickContext } from "@/lib/context";
export type ActiveContext = { year: number; yearId: string; stageId: string; stageName: string; versionId: string | null };

/**
 * Data dasar yang dibutuhkan layout DAN halaman: tahun, tahapan, nama OPD, dan (spekulatif) versi anggaran bagi pilihan tersimpan.
 * Dibungkus cache() agar hanya satu putaran ke database per permintaan, semua kueri berjalan paralel.
 */
export const getContextBase = cache(async () => {
  const sb = await createClient();
  const saved = decodeContext((await cookies()).get(CONTEXT_COOKIE)?.value);
  const [{ data: years }, { data: stages }, { data: org }, spec] = await Promise.all([
    sb.from("budget_years").select("id, year").eq("is_active", true).order("year"),
    sb.from("budget_stages").select("id, code, name").eq("is_active", true).order("sort_order"),
    sb.from("organizations").select("name").maybeSingle(),
    saved ? sb.from("budget_versions").select("id").eq("budget_year_id", saved.yearId).eq("budget_stage_id", saved.stageId).order("version_no", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null })]);
  return { years: years ?? [], stages: stages ?? [], orgName: org?.name ?? "", saved, specVersionId: (spec.data as { id: string } | null)?.id ?? null };
});

/** Konteks tahun/tahapan aktif + versi anggaran terbaru (divalidasi lewat RLS). Satu kali per permintaan. */
export const getBudgetContext = cache(async (): Promise<ActiveContext | null> => {
  const b = await getContextBase();
  const { y, s } = pickContext(b.years, b.stages, b.saved);
  if (!y || !s) return null;
  let versionId: string | null;
  if (b.saved && b.saved.yearId === y.id && b.saved.stageId === s.id) versionId = b.specVersionId; // kueri spekulatif sudah menjawab
  else {
    const { data: v } = await (await createClient()).from("budget_versions").select("id").eq("budget_year_id", y.id).eq("budget_stage_id", s.id)
      .order("version_no", { ascending: false }).limit(1).maybeSingle();
    versionId = v?.id ?? null;
  }
  return { year: y.year, yearId: y.id, stageId: s.id, stageName: s.name, versionId };
});
