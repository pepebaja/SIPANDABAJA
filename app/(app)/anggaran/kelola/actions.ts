"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { parseRupiah } from "@/lib/import/parse";

const UUID = /^[0-9a-f-]{36}$/i, BACK = "/anggaran/kelola";
const keyOf = (sub: string, acc: string, fund: string, desc: string) => [sub, acc, fund, desc.toLowerCase().replace(/\s+/g, " ").trim()].join("|");
async function guard() { const s = await getSession(); if (!s || !can(s.roles, "budget:import")) redirect(`${BACK}?error=denied`); }
const done = () => { revalidatePath(BACK); revalidatePath("/realisasi"); revalidatePath("/kas"); revalidatePath("/"); };

/** Menambah rekening anggaran (subkegiatan + rekening + sumber dana + uraian + pagu) pada tahapan aktif. */
export async function addBudgetEntry(fd: FormData): Promise<void> {
  await guard();
  const ctx = await getBudgetContext(); if (!ctx?.versionId) redirect(`${BACK}?error=version`);
  const sub = String(fd.get("subactivity_id") ?? ""), acc = String(fd.get("account_id") ?? ""), fund = String(fd.get("funding_source_id") ?? ""), desc = String(fd.get("description") ?? "").trim(), amount = parseRupiah(String(fd.get("amount") ?? ""));
  if (![sub, acc, fund].every((x) => UUID.test(x)) || !desc || amount === null || amount.startsWith("-")) redirect(`${BACK}?error=input`);
  const sb = await createClient();
  const [a, b, c] = await Promise.all([sb.from("subactivities").select("code").eq("id", sub).maybeSingle(), sb.from("expenditure_accounts").select("code").eq("id", acc).maybeSingle(), sb.from("funding_sources").select("code").eq("id", fund).maybeSingle()]);
  if (!a.data || !b.data || !c.data) redirect(`${BACK}?error=input`);
  const { error } = await sb.from("budget_entries").insert({ budget_version_id: ctx.versionId, subactivity_id: sub, account_id: acc, funding_source_id: fund, description: desc.slice(0, 500), amount, entry_key: keyOf(a.data.code, b.data.code, c.data.code, desc) });
  if (error) redirect(`${BACK}?error=${error.code === "23505" ? "dup" : "save"}`);
  done(); redirect(`${BACK}?ok=add`);
}

/** Mengubah uraian dan pagu rekening anggaran. Pagu tidak boleh lebih kecil daripada realisasi kumulatif atau alokasi paket RUP yang sudah ada. */
export async function updateBudgetEntry(fd: FormData): Promise<void> {
  await guard();
  const id = String(fd.get("id") ?? ""), desc = String(fd.get("description") ?? "").trim(), amount = parseRupiah(String(fd.get("amount") ?? ""));
  if (!UUID.test(id) || !desc || amount === null || amount.startsWith("-")) redirect(`${BACK}?error=input`);
  const sb = await createClient();
  const { data: e } = await sb.from("budget_entries").select("budget_version_id, subactivities(code), expenditure_accounts(code), funding_sources(code)").eq("id", id).maybeSingle() as { data: any };
  if (!e) redirect(`${BACK}?error=save`);
  const { data: r } = await sb.rpc("realization_by_entry", { p_version: e.budget_version_id }).eq("entry_id", id);
  const real = Array.isArray(r) ? r[0]?.verified : null;
  if (real !== null && real !== undefined && Number(amount) < Number(real)) redirect(`${BACK}?error=below`);
  const { error } = await sb.from("budget_entries").update({ description: desc.slice(0, 500), amount, entry_key: keyOf(e.subactivities?.code ?? "", e.expenditure_accounts?.code ?? "", e.funding_sources?.code ?? "", desc) }).eq("id", id);
  if (error) redirect(`${BACK}?error=${error.code === "23505" ? "dup" : "save"}`);
  done(); redirect(`${BACK}?ok=edit`);
}

/** Menghapus rekening anggaran yang belum dipakai (tanpa transaksi, anggaran kas, atau alokasi paket RUP). */
export async function deleteBudgetEntry(fd: FormData): Promise<void> {
  await guard();
  const id = String(fd.get("id") ?? ""); if (!UUID.test(id)) redirect(BACK);
  const sb = await createClient();
  const [tx, cash, al] = await Promise.all([sb.from("transactions").select("id", { count: "exact", head: true }).eq("budget_entry_id", id), sb.from("cash_plan_items").select("id", { count: "exact", head: true }).eq("budget_entry_id", id), sb.from("package_budget_allocations").select("id", { count: "exact", head: true }).eq("budget_entry_id", id)]);
  if ((tx.count ?? 0) > 0) redirect(`${BACK}?error=used-tx`);
  if ((cash.count ?? 0) > 0) redirect(`${BACK}?error=used-cash`);
  if ((al.count ?? 0) > 0) redirect(`${BACK}?error=used-alloc`);
  const { data, error } = await sb.from("budget_entries").delete().eq("id", id).select("id");
  if (error || !data?.length) redirect(`${BACK}?error=save`);
  done(); redirect(`${BACK}?ok=del`);
}
