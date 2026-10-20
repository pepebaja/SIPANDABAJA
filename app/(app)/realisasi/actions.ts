"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { transactionSchema } from "@/lib/transactions";
import type { FormState } from "../master/actions";

/** Batas pagu rekening, anggaran kas kumulatif, dan pagu RUP ditegakkan oleh trigger database (check_transaction_limits); pesannya diteruskan apa adanya. */
export async function addTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) return { error: "Anda tidak berwenang mencatat realisasi (hanya Super Admin, Admin OPD, dan PPBJ)." };
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan." };
  const parsed = transactionSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const { error } = await (await createClient()).from("transactions").insert({ ...parsed.data, budget_version_id: ctx.versionId });
  if (error?.code === "23505") return { error: "Dokumen yang sama (jenis, nomor, rekening) sudah tercatat." };
  if (error?.code === "P0001") return { error: error.message };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang mencatat realisasi." };
  revalidatePath("/realisasi"); revalidatePath("/rup");
  return { ok: true };
}
export async function verifyTransaction(fd: FormData): Promise<void> {
  const id = String(fd.get("id")); if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/realisasi");
  const { data, error } = await (await createClient()).from("transactions").update({ verification_status: "verified" }).eq("id", id).select("id");
  if (error || !data?.length) redirect("/realisasi?error=verify");
  revalidatePath("/realisasi");
}
