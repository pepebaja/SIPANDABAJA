"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { can } from "@/lib/rbac";
import { paymentUpdateSchema, transactionSchema } from "@/lib/transactions";
import { referenceDate, resolveVersion } from "@/lib/stage-rule";
import type { FormState } from "../master/actions";

const MIGRASI = "Migrasi database 20260113 (realisasi sederhana) belum dijalankan di Supabase.";
/** Batas pagu rekening, anggaran kas kumulatif, dan pagu RUP ditegakkan oleh trigger database (check_transaction_limits); pesannya diteruskan apa adanya. */
export async function addTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) return { error: "Anda tidak berwenang mencatat realisasi (hanya Super Admin, Admin OPD, dan PPBJ)." };
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan." };
  const parsed = transactionSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  const d = parsed.data, sb = await createClient();
  // Tahapan ditentukan oleh tanggal (SPM/SP2D, atau transaksi bila belum ada). Pencatatan manual hanya untuk tahapan yang sedang dipilih.
  const ref = referenceDate({ transactionDate: d.transaction_date, paymentDate: d.payment_date }), ver = resolveVersion(await loadStageVersions(sb, ctx.yearId), ctx.year, ref.date);
  if (!ver) return { error: `Tidak ada tahapan anggaran yang berlaku pada ${ref.date}. Atur tanggal mulai berlaku tahapan di tab Unggah (panel Aturan tahapan anggaran).` };
  if (ver.id !== ctx.versionId) return { error: `Tanggal ${ref.date} termasuk tahapan ${ver.stageName}. Pilih tahapan ${ver.stageName} di bagian atas layar, atau periksa kembali tanggal SPM/SP2D.` };
  let dup = sb.from("transactions").select("id", { count: "exact", head: true }).eq("budget_version_id", ctx.versionId).eq("budget_entry_id", d.budget_entry_id).eq("transaction_date", d.transaction_date).eq("amount", d.amount);
  dup = d.rup_package_id ? dup.eq("rup_package_id", d.rup_package_id) : dup.is("rup_package_id", null);
  if (((await dup).count ?? 0) > 0) return { error: "Transaksi dengan tanggal, rekening, kode RUP, dan nilai yang sama sudah tercatat. Untuk melengkapi No SPM/SP2D, ubah lewat Daftar transaksi atau unggah ulang." };
  const { error } = await sb.from("transactions").insert({ ...d, budget_version_id: ctx.versionId });
  if (error?.code === "P0001") return { error: error.message };
  if (error?.code === "23502" || error?.code === "42703" || error?.message?.includes("schema cache")) return { error: MIGRASI };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang mencatat realisasi." };
  revalidatePath("/realisasi"); revalidatePath("/rup");
  return { ok: true };
}
export async function verifyTransaction(fd: FormData): Promise<void> {
  const id = String(fd.get("id")); if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/realisasi?tab=daftar");
  const { data, error } = await (await createClient()).from("transactions").update({ verification_status: "verified" }).eq("id", id).select("id");
  if (error || !data?.length) redirect("/realisasi?tab=daftar&error=verify");
  revalidatePath("/realisasi");
}
/** Melengkapi/memperbarui Tanggal & No SPM/SP2D satu transaksi. Terverifikasi: hanya bagian yang masih kosong (dijaga database). Tanggal yang memindahkan tahapan harus lewat Unggah. */
export async function updatePaymentInfo(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) redirect("/realisasi?tab=daftar&error=payment");
  const p = paymentUpdateSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))); if (!p.success) redirect("/realisasi?tab=daftar&error=payment");
  const sb = await createClient(), { id, payment_number, payment_date } = p.data;
  const { data: row } = await sb.from("transactions").select("budget_version_id, transaction_date, payment_date, payment_number").eq("id", id).maybeSingle();
  if (!row) redirect("/realisasi?tab=daftar&error=payment");
  const ctx = await getBudgetContext();
  if (payment_date && payment_date !== row.payment_date && ctx) {
    const ref = referenceDate({ transactionDate: row.transaction_date, paymentDate: payment_date }), ver = resolveVersion(await loadStageVersions(sb, ctx.yearId), ctx.year, ref.date);
    if (!ver || ver.id !== row.budget_version_id) redirect("/realisasi?tab=daftar&error=stage");
  }
  const patch: Record<string, unknown> = {}; if (payment_number !== null) patch.payment_number = payment_number; if (payment_date !== null) patch.payment_date = payment_date;
  if (Object.keys(patch).length) { const { error } = await sb.from("transactions").update(patch).eq("id", id); if (error) redirect("/realisasi?tab=daftar&error=payment"); }
  revalidatePath("/realisasi");
}
