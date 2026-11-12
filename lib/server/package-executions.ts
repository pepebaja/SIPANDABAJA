import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRupiah } from "@/lib/import/parse";
import type { Execution } from "@/lib/package-executions";
/**
 * Seluruh transaksi realisasi suatu paket pada satu tahun anggaran: ditautkan lewat kode RUP yang sama di semua tahapan (paket yang berjalan
 * sejak Murni tetap memuat pelaksanaan Murni/Pergeseran di Perubahan) atau lewat tautan langsung ke paket. Urut tanggal.
 */
export async function loadPackageExecutions(sb: SupabaseClient, pkg: { id: string; internal_code: string; budget_version_id: string }): Promise<Execution[]> {
  const { data: v } = await sb.from("budget_versions").select("budget_year_id").eq("id", pkg.budget_version_id).maybeSingle();
  const { data: vs } = v ? await sb.from("budget_versions").select("id").eq("budget_year_id", v.budget_year_id) : { data: [] as { id: string }[] };
  const vids = (vs ?? []).map((x) => x.id);
  const { data: rups } = vids.length ? await sb.from("rup_packages").select("id").eq("rup_code", pkg.internal_code).in("budget_version_id", vids) : { data: [] as { id: string }[] };
  const ids = (rups ?? []).map((r) => r.id), cond = [`procurement_package_id.eq.${pkg.id}`, ...(ids.length ? [`rup_package_id.in.(${ids.join(",")})`] : [])].join(",");
  const run = (sel: string) => sb.from("transactions").select(sel).or(cond).order("transaction_date").order("created_at").limit(2000);
  let res: any = await run("id, transaction_date, amount, payment_date, payment_number, description, providers(name)");
  if (res.error) res = await run("id, transaction_date, amount, payment_date, payment_number");   // migrasi 20260119/20260122 belum dijalankan
  return ((res.data ?? []) as any[]).map((t) => ({ id: t.id, date: t.transaction_date, amount: parseRupiah(t.amount) ?? "0.00", paymentDate: t.payment_date ?? null, paymentNumber: t.payment_number ?? null, description: t.description ?? null, provider: t.providers?.name ?? null }));
}
