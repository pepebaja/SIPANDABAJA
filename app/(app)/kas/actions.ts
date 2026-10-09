"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { cashItemSchema } from "@/lib/allocations";
import type { FormState } from "../master/actions";
export async function saveCashItem(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan." };
  const parsed = cashItemSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const sb = await createClient();
  let { data: plan } = await sb.from("cash_plans").select("id").eq("budget_version_id", ctx.versionId).order("created_at").limit(1).maybeSingle();
  if (!plan) { const r = await sb.from("cash_plans").insert({ budget_version_id: ctx.versionId, name: "Rencana kas" }).select("id").single(); plan = r.data; }
  if (!plan) return { error: "Gagal menyiapkan rencana kas. Anda mungkin tidak berwenang." };
  const { error } = await sb.from("cash_plan_items").upsert({ ...parsed.data, cash_plan_id: plan.id }, { onConflict: "cash_plan_id,budget_entry_id,period_month" });
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang." };
  revalidatePath("/kas"); return { ok: true };
}
export async function deleteCashItem(fd: FormData): Promise<void> {
  const id = String(fd.get("id")); if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/kas");
  const { data } = await (await createClient()).from("cash_plan_items").delete().eq("id", id).select("id");
  if (!data?.length) redirect("/kas?error=1");
  revalidatePath("/kas");
}
