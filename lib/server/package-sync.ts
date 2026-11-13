import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { loadStageVersions } from "./stage-versions";
import { deriveFromRealization, type SyncTx } from "@/lib/package-sync";
import { contractProfile, methodKind } from "@/lib/procurement-profile";
import { parseRupiah } from "@/lib/import/parse";
const m = (v: unknown) => parseRupiah(v) ?? "0.00";
/**
 * Menyelaraskan paket pengadaan dengan transaksi pada Input Realisasi (kode RUP yang sama, seluruh tahapan pada tahun anggaran):
 * paket "belum diproses" yang sudah punya realisasi dimajukan, tanggal proses/serah terima dan metode yang kosong diisi,
 * dan paket yang terbayar penuh diberi dokumen kontrak/SP dari realisasi. Aman dijalankan berulang (tidak menimpa isian yang ada).
 * Dipanggil otomatis setelah transaksi disimpan (rupCodes) dan lewat tombol "Sinkronkan dengan realisasi" (seluruh paket).
 */
export async function syncPackagesWithRealization(sb: SupabaseClient, yearId: string, opts: { rupCodes?: string[] } = {}): Promise<{ confirmed: number; filled: number; contracts: number }> {
  const vids = (await loadStageVersions(sb, yearId)).map((v) => v.id); if (!vids.length) return { confirmed: 0, filled: 0, contracts: 0 };
  const codes = opts.rupCodes?.filter(Boolean);
  const [sts, pkgs] = await Promise.all([
    sb.from("package_statuses").select("code, stage_group"),
    fetchAll<any>((f, t) => { let q = sb.from("procurement_packages").select("id, internal_code, status, pagu, is_recurring, process_start, process_end, handover_date, method_id, execution_mode, method:procurement_methods(code, name)").in("budget_version_id", vids).order("id").range(f, t); if (codes?.length) q = q.in("internal_code", codes); return q; })]);
  if (!pkgs.length) return { confirmed: 0, filled: 0, contracts: 0 };
  const group = new Map((sts.data ?? []).map((s) => [s.code as string, s.stage_group as string | null]));
  const txSel = (cols: string) => (f: number, t: number) => { let q = sb.from("transactions").select(`amount, transaction_date, payment_date, procurement_method_id, ${cols}rup_packages!inner(rup_code)`).in("budget_version_id", vids).order("id").range(f, t); if (codes?.length) q = q.in("rup_packages.rup_code", codes); return q; };
  const rows: any[] = await fetchAll<any>(txSel("provider_id, ")).catch(() => fetchAll<any>(txSel("")));
  const byCode = new Map<string, SyncTx[]>();
  for (const r of rows) { const c = r.rup_packages?.rup_code as string; (byCode.get(c) ?? byCode.set(c, []).get(c)!).push({ date: r.transaction_date, paymentDate: r.payment_date ?? null, amount: m(r.amount), methodId: r.procurement_method_id ?? null, providerId: r.provider_id ?? null }); }
  const withTx = pkgs.filter((p) => byCode.has(p.internal_code)); if (!withTx.length) return { confirmed: 0, filled: 0, contracts: 0 };
  const have = new Set((await fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("procurement_package_id").in("procurement_package_id", withTx.map((p) => p.id)).order("id").range(f, t))).map((c) => c.procurement_package_id as string));
  let confirmed = 0, filled = 0, contracts = 0;
  for (const p of withTx) {
    const r = deriveFromRealization({ status: p.status, group: group.get(p.status) ?? null, pagu: m(p.pagu), recurring: !!p.is_recurring, processStart: p.process_start, processEnd: p.process_end, handover: p.handover_date, methodId: p.method_id, hasContract: have.has(p.id) }, byCode.get(p.internal_code)!);
    if (!r) continue;
    if (Object.keys(r.patch).length) { const { error } = await sb.from("procurement_packages").update(r.patch).eq("id", p.id); if (error) continue; r.statusChanged ? confirmed++ : filled++; }
    if (r.contract) {
      const prof = contractProfile(methodKind(p.method)), { error } = await sb.from("contracts_or_orders").insert({ procurement_package_id: p.id, doc_type: prof.defaultDoc, provider_id: prof.showProvider ? r.contract.providerId : null, contract_value: r.contract.value, description: "Dibuat otomatis dari realisasi; lengkapi nomor dan tanggal dokumen" });
      if (!error) contracts++;
    }
  }
  return { confirmed, filled, contracts };
}
