"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { transactionSchema } from "@/lib/transactions";
import { derive } from "@/lib/realization";
import { parseRupiah } from "@/lib/import/parse";
import type { FormState } from "../master/actions";
export async function addTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan." };
  const parsed = transactionSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const sb = await createClient();
  const { error } = await sb.from("transactions").insert({ ...parsed.data, budget_version_id: ctx.versionId });
  if (error?.code === "23505") return { error: "Dokumen yang sama (jenis, nomor, rekening) sudah tercatat." };
  if (error?.code === "P0001") return { error: error.message };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang mencatat realisasi." };
  revalidatePath("/realisasi");
  // Peringatan (bukan penolakan): total tercatat melampaui pagu rekening -> perlu diperiksa pejabat berwenang.
  const { data } = await sb.rpc("realization_by_entry", { p_version: ctx.versionId });
  const row = (data as { entry_id: string; pagu: number; verified: number; unverified: number }[] | null)?.find((r) => r.entry_id === parsed.data.budget_entry_id);
  const m = (v: number) => parseRupiah(v) ?? "0.00";
  const over = row && derive({ pagu: m(row.pagu), verified: m(row.verified), unverified: m(row.unverified), txCount: 0, unverifiedCount: 0 }).overPagu;
  return { ok: true, warning: over ? "Total transaksi pada rekening ini melampaui pagu. Mohon diperiksa pejabat berwenang." : undefined };
}
export async function verifyTransaction(fd: FormData): Promise<void> {
  const id = String(fd.get("id")); if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/realisasi");
  const { data, error } = await (await createClient()).from("transactions").update({ verification_status: "verified" }).eq("id", id).select("id");
  if (error || !data?.length) redirect("/realisasi?error=verify");
  revalidatePath("/realisasi");
}
