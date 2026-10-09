"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contractSchema } from "@/lib/contracts";
import { parseRupiah } from "@/lib/import/parse";
import { toCents } from "@/lib/money";
import type { FormState } from "../../master/actions";
const uuid = /^[0-9a-f-]{36}$/i;
export async function changeStatus(fd: FormData): Promise<void> {
  const id = String(fd.get("id")), status = String(fd.get("status"));
  if (!uuid.test(id)) redirect("/paket");
  const { data } = await (await createClient()).from("procurement_packages").update({ status }).eq("id", id).select("id");
  if (!data?.length) redirect(`/paket/${id}?error=status`);
  revalidatePath(`/paket/${id}`);
}
export async function linkRup(fd: FormData): Promise<void> {
  const id = String(fd.get("id")), rup = String(fd.get("rup_package_id") ?? "");
  if (!uuid.test(id) || (rup && !uuid.test(rup))) redirect("/paket");
  const { data } = await (await createClient()).from("procurement_packages").update({ rup_package_id: rup || null }).eq("id", id).select("id");
  if (!data?.length) redirect(`/paket/${id}?error=rup`);
  revalidatePath(`/paket/${id}`);
}
export async function addContract(_p: FormState, fd: FormData): Promise<FormState> {
  const packageId = String(fd.get("package_id"));
  if (!uuid.test(packageId)) return { error: "Paket tidak valid." };
  const parsed = contractSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ") };
  const sb = await createClient();
  const { data: pkg } = await sb.from("procurement_packages").select("pagu").eq("id", packageId).maybeSingle();
  if (!pkg) return { error: "Paket tidak ditemukan." };
  const { error } = await sb.from("contracts_or_orders").insert({ ...parsed.data, procurement_package_id: packageId });
  if (error) return { error: "Gagal menyimpan. Hanya admin, PPBJ, dan PPK yang dapat mencatat kontrak/SP." };
  revalidatePath(`/paket/${packageId}`);
  const cv = parsed.data.contract_value;
  // Peringatan, bukan penolakan: pemeriksaan akhir ada pada pejabat berwenang.
  return { ok: true, warning: cv && toCents(cv) > toCents(parseRupiah(pkg.pagu) ?? "0.00") ? "Nilai kontrak/SP melebihi pagu paket. Mohon diperiksa pejabat berwenang." : undefined };
}
