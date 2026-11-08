"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { fetchAll } from "@/lib/server/fetch-all";
import { modeOfMethod, packageCreateSchema } from "@/lib/packages";
import type { FormState } from "../master/actions";

/** Membuat satu paket dari kode RUP yang diisi. Kode paket = kode RUP; nama, pagu, metode, dan PPTK (dari anggaran yang dialokasikan ke RUP) terisi otomatis. */
export async function createPackage(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan (menu Impor anggaran)." };
  const parsed = packageCreateSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const sb = await createClient();
  const { data: r } = await sb.from("rup_packages").select("id, rup_code, name, pagu, planned_method_id, method:procurement_methods(name)").eq("budget_version_id", ctx.versionId).eq("rup_code", parsed.data.rup_code).maybeSingle() as { data: any };
  if (!r) return { error: `Kode RUP ${parsed.data.rup_code} tidak ditemukan pada tahun/tahapan ini. Periksa kodenya atau impor/sinkronkan RUP lebih dulu.` };
  let pptk = parsed.data.pptk_id;
  if (!pptk) {
    const { data: al } = await sb.from("package_budget_allocations").select("entry:budget_entries(pptk_id)").eq("rup_package_id", r.id) as { data: any[] | null };
    const ids = [...new Set((al ?? []).map((x) => x.entry?.pptk_id).filter(Boolean))]; if (ids.length === 1) pptk = ids[0];
  }
  const { error } = await sb.from("procurement_packages").insert({ budget_version_id: ctx.versionId, rup_package_id: r.id, internal_code: r.rup_code, name: r.name, pagu: r.pagu, method_id: r.planned_method_id, execution_mode: modeOfMethod(r.method?.name),
    ppbj_id: parsed.data.ppbj_id, ppk_id: parsed.data.ppk_id, pptk_id: pptk, due_date: parsed.data.due_date });
  if (error?.code === "23505") return { error: `Paket untuk kode RUP ${r.rup_code} sudah ada.` };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang membuat paket." };
  revalidatePath("/paket"); redirect("/paket");
}

/** Membuat paket sekaligus untuk SEMUA paket RUP yang belum punya paket (status awal Rencana); pejabat dan tenggat dilengkapi kemudian. */
export async function generatePackagesFromRup(): Promise<void> {
  const ctx = await getBudgetContext(); if (!ctx?.versionId) redirect("/paket?error=version");
  const sb = await createClient();
  const [rups, have] = await Promise.all([
    fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, name, pagu, planned_method_id, method:procurement_methods(name)").eq("budget_version_id", ctx.versionId!).order("rup_code").range(f, t)),
    fetchAll<any>((f, t) => sb.from("procurement_packages").select("id, rup_package_id").eq("budget_version_id", ctx.versionId!).order("id").range(f, t))]);
  const used = new Set(have.map((h) => h.rup_package_id).filter(Boolean)), rows = rups.filter((r) => !used.has(r.id)).map((r) => ({ budget_version_id: ctx.versionId!, rup_package_id: r.id, internal_code: r.rup_code, name: r.name, pagu: r.pagu, method_id: r.planned_method_id, execution_mode: modeOfMethod(r.method?.name) }));
  for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from("procurement_packages").insert(rows.slice(i, i + 200)); if (error) redirect("/paket?error=generate"); }
  revalidatePath("/paket"); redirect(`/paket?made=${rows.length}`);
}
