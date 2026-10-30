import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRupiah } from "@/lib/import/parse";
import { derive, totals, type Derived } from "@/lib/realization";
import { loadRealization } from "./realization-data";
const m = (v: unknown) => parseRupiah(v) ?? "0.00";

/** Total realisasi satu versi anggaran: 1 baris dari database (bukan seluruh rekening). */
export async function loadRealizationTotals(sb: SupabaseClient, versionId: string): Promise<{ totals: Derived; overPaguCount: number }> {
  const { data, error } = await sb.rpc("realization_totals", { p_version: versionId });
  const r = Array.isArray(data) ? data[0] : data;
  if (!error && r) return { totals: totals([{ pagu: m(r.pagu), verified: m(r.verified), unverified: m(r.unverified), txCount: Number(r.tx_count), unverifiedCount: Number(r.unverified_count) }]), overPaguCount: Number(r.over_pagu_count) };
  // Cadangan bila migrasi 20260111000000_performa.sql belum dijalankan: cara lama (lebih lambat, hasil sama).
  const rows = await loadRealization(sb, versionId);
  return { totals: totals(rows), overPaguCount: rows.filter((x) => derive(x).overPagu).length };
}
