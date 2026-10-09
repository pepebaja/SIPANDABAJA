"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { allocationSchema } from "@/lib/allocations";
import type { FormState } from "../../master/actions";
export async function addAllocation(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = allocationSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const { error } = await (await createClient()).from("package_budget_allocations").insert(parsed.data);
  if (error?.code === "P0001") return { error: error.message };               // aturan batas dari trigger database
  if (error?.code === "23505") return { error: "Rekening ini sudah dialokasikan ke paket ini." };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang." };
  revalidatePath(`/rup/${parsed.data.rup_package_id}`); return { ok: true };
}
export async function deleteAllocation(fd: FormData): Promise<void> {
  const id = String(fd.get("id")), rup = String(fd.get("rup")), ok = /^[0-9a-f-]{36}$/i;
  if (!ok.test(id) || !ok.test(rup)) redirect("/rup");
  const { data } = await (await createClient()).from("package_budget_allocations").delete().eq("id", id).select("id");
  if (!data?.length) redirect(`/rup/${rup}?error=1`);
  revalidatePath(`/rup/${rup}`);
}
