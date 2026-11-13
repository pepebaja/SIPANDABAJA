"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { fetchAll } from "@/lib/server/fetch-all";
import { modeOfMethod, packageCreateSchema, packageEditSchema } from "@/lib/packages";
import { getSession } from "@/lib/server/session";
import { syncPackagesFromRup } from "@/lib/server/package-carry";
import { syncPackagesWithRealization } from "@/lib/server/package-sync";
import { can } from "@/lib/rbac";
import type { FormState } from "../master/actions";

/** Membuat satu paket dari kode RUP yang diisi. Kode paket = kode RUP; nama, pagu, metode, dan PPTK (dari anggaran yang dialokasikan ke RUP) terisi otomatis. */
export async function createPackage(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan (menu Impor anggaran)." };
  const parsed = packageCreateSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const sb = await createClient();
  const { data: r } = await sb.from("rup_packages").select("id, rup_code, name, pagu, procurement_type, planned_method_id, method:procurement_methods(name)").eq("budget_version_id", ctx.versionId).eq("rup_code", parsed.data.rup_code).maybeSingle() as { data: any };
  if (!r) return { error: `Kode RUP ${parsed.data.rup_code} tidak ditemukan pada tahun/tahapan ini. Periksa kodenya atau impor/sinkronkan RUP lebih dulu.` };
  let pptk = parsed.data.pptk_id;
  if (!pptk) {
    const { data: al } = await sb.from("package_budget_allocations").select("entry:budget_entries(pptk_id)").eq("rup_package_id", r.id) as { data: any[] | null };
    const ids = [...new Set((al ?? []).map((x) => x.entry?.pptk_id).filter(Boolean))]; if (ids.length === 1) pptk = ids[0];
  }
  const { error } = await sb.from("procurement_packages").insert({ budget_version_id: ctx.versionId, rup_package_id: r.id, internal_code: r.rup_code, name: r.name, pagu: r.pagu, method_id: r.planned_method_id, procurement_type: r.procurement_type, execution_mode: modeOfMethod(r.method?.name),
    ppbj_id: parsed.data.ppbj_id, ppk_id: parsed.data.ppk_id, pptk_id: pptk, due_date: parsed.data.due_date });
  if (error?.code === "23505") return { error: `Paket untuk kode RUP ${r.rup_code} sudah ada.` };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang membuat paket." };
  revalidatePath("/paket"); redirect("/paket");
}

/**
 * Membuat paket untuk SEMUA RUP yang belum punya paket. Paket dengan kode RUP yang sudah berjalan pada tahapan sebelumnya dibawa beserta
 * status, pejabat, tanggal, dan kontrak/SP-nya (bukan kembali menjadi Rencana); paket "Rencana" tanpa kontrak disegarkan dari tahapan sebelumnya.
 */
export async function generatePackagesFromRup(): Promise<void> {
  const ctx = await getBudgetContext(); if (!ctx?.versionId) redirect("/paket?error=version");
  let r; try { r = await syncPackagesFromRup(await createClient(), ctx.yearId, ctx.versionId); } catch { redirect("/paket?error=generate"); }
  revalidatePath("/paket"); revalidatePath("/"); redirect(`/paket?made=${r.made}&carried=${r.carried}&refreshed=${r.refreshed}`);
}

const NO_AUTH = "Anda tidak berwenang mengubah paket (hanya Super Admin, Admin OPD, dan PPBJ).";
/** Mengubah data paket dari daftar paket (nama, pagu, metode, mode, status, tenggat, pejabat). Hasil dan galat ditampilkan di dialog. */
export async function updatePackage(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) return { error: NO_AUTH };
  const p = packageEditSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))); if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
  const { id, ...d } = p.data, sb = await createClient();
  const { data: st } = await sb.from("package_statuses").select("code").eq("code", d.status).eq("is_active", true).maybeSingle();
  if (!st) return { error: "Status paket tidak dikenal atau nonaktif." };
  const { data, error } = await sb.from("procurement_packages").update(d).eq("id", id).select("id");
  if (error?.code === "P0001") return { error: error.message };
  if (error || !data?.length) return { error: "Perubahan ditolak. Paket tidak ditemukan atau Anda tidak berwenang." };
  revalidatePath("/paket"); revalidatePath(`/paket/${id}`); revalidatePath("/");
  return { ok: true };
}

/** Menghapus paket yang belum punya transaksi maupun kontrak/SP (aturan ditegakkan database). */
export async function deletePackage(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) return { error: NO_AUTH };
  const id = String(fd.get("id") ?? ""); if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Paket tidak valid." };
  const { error } = await (await createClient()).rpc("delete_procurement_package", { p_id: id });
  if (error?.code === "P0001") return { error: error.message };
  if (error?.code === "42883") return { error: "Migrasi database 20260121 (hapus paket) belum dijalankan di Supabase." };
  if (error) return { error: "Paket tidak dapat dihapus. Anda mungkin tidak berwenang." };
  revalidatePath("/paket"); revalidatePath("/");
  return { ok: true };
}

/** Menyelaraskan seluruh paket dengan data Input Realisasi (status, tanggal proses/serah terima, metode, dan dokumen kontrak dari realisasi). */
export async function syncWithRealization(): Promise<void> {
  const s = await getSession(); const ctx = await getBudgetContext();
  if (!s || !can(s.roles, "rup:write") || !ctx?.yearId) redirect("/paket?error=sync");
  let r; try { r = await syncPackagesWithRealization(await createClient(), ctx.yearId); } catch { redirect("/paket?error=sync"); }
  revalidatePath("/paket"); revalidatePath("/laporan/kinerja-pengadaan"); revalidatePath("/");
  redirect(`/paket?sync=${r.confirmed}-${r.filled}-${r.contracts}`);
}
