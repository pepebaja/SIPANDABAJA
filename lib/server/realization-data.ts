import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { parseRupiah } from "@/lib/import/parse";
import type { EntryRow } from "@/lib/realization";
export type EntryRealization = EntryRow & { entryId: string };
const m = (v: unknown) => parseRupiah(v) ?? "0.00";
/** Agregasi realisasi per rekening, dibaca per halaman agar benar untuk >1000 rekening. */
export async function loadRealization(sb: SupabaseClient, versionId: string): Promise<EntryRealization[]> {
  const rows = await fetchAll<any>((f, t) => sb.rpc("realization_by_entry", { p_version: versionId }).order("entry_id").range(f, t));
  return rows.map((r) => ({ entryId: r.entry_id, pagu: m(r.pagu), verified: m(r.verified), unverified: m(r.unverified), txCount: Number(r.tx_count), unverifiedCount: Number(r.unverified_count) }));
}
