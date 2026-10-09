"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { packageSchema } from "@/lib/packages";
import type { FormState } from "../master/actions";
export async function createPackage(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan (menu Impor anggaran)." };
  const parsed = packageSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${String(i.path[0] ?? "")}: ${i.message}`).join("; ") };
  const { error } = await (await createClient()).from("procurement_packages").insert({ ...parsed.data, budget_version_id: ctx.versionId });
  if (error?.code === "23505") return { error: "Kode paket sudah dipakai pada tahun/tahapan ini." };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang membuat paket." };
  redirect("/paket");
}
