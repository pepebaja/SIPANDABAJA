import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Mencari rekening anggaran padanan pada tahapan (versi) tujuan: subkegiatan + rekening + sumber dana yang sama; bila ada beberapa,
 * uraian yang sama dipakai. Dipakai saat tanggal transaksi menentukan tahapan yang berbeda dari tahapan yang sedang dipilih.
 */
export async function mapEntryToVersion(sb: SupabaseClient, entryId: string, targetVid: string): Promise<{ id: string } | { error: string }> {
  const { data: cur } = await sb.from("budget_entries").select("budget_version_id, subactivity_id, account_id, funding_source_id, description").eq("id", entryId).maybeSingle();
  if (!cur) return { error: "Rekening anggaran tidak ditemukan." };
  if (cur.budget_version_id === targetVid) return { id: entryId };
  let q = sb.from("budget_entries").select("id, description").eq("budget_version_id", targetVid).eq("subactivity_id", cur.subactivity_id).eq("account_id", cur.account_id);
  q = cur.funding_source_id ? q.eq("funding_source_id", cur.funding_source_id) : q.is("funding_source_id", null);
  const { data: cands } = await q; let pick = cands ?? [];
  if (pick.length > 1) { const same = pick.filter((e) => e.description === cur.description); if (same.length) pick = same; }
  return pick.length === 1 ? { id: pick[0]!.id } : { error: "Rekening (subkegiatan + rekening + sumber dana) padanan tidak ditemukan atau tidak unik pada tahapan tujuan. Tambahkan/impor rekening itu pada tahapan tujuan (menu Kelola anggaran) lebih dulu." };
}
