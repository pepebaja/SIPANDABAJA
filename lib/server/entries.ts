import type { SupabaseClient } from "@supabase/supabase-js";
export type EntryOpt = { id: string; label: string; amount: string };
/** Maks. 1000 rekening teratas (batas API); cukup untuk satu OPD, perlu pencarian bila lebih. */
export async function loadEntries(sb: SupabaseClient, versionId: string): Promise<EntryOpt[]> {
  const { data } = await sb.from("budget_entries").select("id, description, amount, subactivities(code), expenditure_accounts(code)").eq("budget_version_id", versionId).order("entry_key").limit(1000);
  return (data ?? []).map((r: any) => ({ id: r.id, amount: String(r.amount), label: `${r.subactivities?.code ?? ""} / ${r.expenditure_accounts?.code ?? ""}: ${r.description}` }));
}
