"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contractSchema } from "@/lib/contracts";
import { parseRupiah } from "@/lib/import/parse";
import { toCents } from "@/lib/money";
import { contractWarnings, methodKind } from "@/lib/procurement-profile";
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
export async function updateDue(fd: FormData): Promise<void> {
  const id = String(fd.get("id")), due = String(fd.get("due_date") ?? "");
  if (!uuid.test(id) || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) redirect("/paket");
  const { data } = await (await createClient()).from("procurement_packages").update({ due_date: due || null }).eq("id", id).select("id");
  if (!data?.length) redirect(`/paket/${id}?error=due`);
  revalidatePath(`/paket/${id}`); revalidatePath("/paket");
}
export async function updateOfficials(fd: FormData): Promise<void> {
  const id = String(fd.get("id")), v = (k: string) => { const x = String(fd.get(k) ?? ""); return x && uuid.test(x) ? x : null; };
  if (!uuid.test(id)) redirect("/paket");
  const { data } = await (await createClient()).from("procurement_packages").update({ ppbj_id: v("ppbj_id"), ppk_id: v("ppk_id"), pptk_id: v("pptk_id") }).eq("id", id).select("id");
  if (!data?.length) redirect(`/paket/${id}?error=officials`);
  revalidatePath(`/paket/${id}`);
}
export async function addContract(_p: FormState, fd: FormData): Promise<FormState> {
  const packageId = String(fd.get("package_id"));
  if (!uuid.test(packageId)) return { error: "Paket tidak valid." };
  const parsed = contractSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ") };
  const sb = await createClient();
  const { data: pkg } = await sb.from("procurement_packages").select("pagu, method:procurement_methods(code, name)").eq("id", packageId).maybeSingle() as { data: any };
  if (!pkg) return { error: "Paket tidak ditemukan." };
  const { error } = await sb.from("contracts_or_orders").insert({ ...parsed.data, procurement_package_id: packageId });
  if (error) return { error: "Gagal menyimpan. Hanya admin, PPBJ, dan PPK yang dapat mencatat kontrak/SP." };
  revalidatePath(`/paket/${packageId}`);
  const cv = parsed.data.contract_value;
  // Peringatan, bukan penolakan: pemeriksaan akhir ada pada pejabat berwenang.
  const warn = [...contractWarnings(methodKind(pkg.method), parsed.data.doc_type, !!parsed.data.provider_id), ...(cv && toCents(cv) > toCents(parseRupiah(pkg.pagu) ?? "0.00") ? ["Nilai kontrak/SP melebihi pagu paket. Mohon diperiksa pejabat berwenang."] : [])];
  return { ok: true, warning: warn.length ? warn.join(" ") : undefined };
}

/** Jenis pengadaan, sifat paket (berulang), metode pemilihan, dan cara pelaksanaan paket. Mengubah metode menyesuaikan bentuk dokumen kontrak/SP. */
export async function updatePackageMeta(fd: FormData): Promise<void> {
  const id = String(fd.get("id")), v = (k: string) => { const x = String(fd.get(k) ?? ""); return x && uuid.test(x) ? x : null; };
  const type = String(fd.get("procurement_type") ?? ""), mode = String(fd.get("execution_mode") ?? "");
  if (!uuid.test(id) || !["barang", "konstruksi", "konsultansi", "jasa_lainnya"].includes(type) || !["penyedia", "swakelola"].includes(mode)) redirect(`/paket/${id}?error=meta`);
  const { data } = await (await createClient()).from("procurement_packages").update({ procurement_type: type, execution_mode: mode, method_id: v("method_id"), is_recurring: fd.get("is_recurring") === "on" }).eq("id", id).select("id");
  if (!data?.length) redirect(`/paket/${id}?error=meta`);
  revalidatePath(`/paket/${id}`); revalidatePath("/paket");
}
