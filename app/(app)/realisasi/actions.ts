"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { can } from "@/lib/rbac";
import { transactionEditSchema, transactionSchema } from "@/lib/transactions";
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
/** Kembali ke Daftar transaksi dengan filter & halaman yang sama (parameter `back` dari formulir; hanya karakter aman). */
const back = (fd: FormData): string => { const b = String(fd.get("back") ?? ""); return /^tab=daftar(&[a-z]+=[0-9a-zA-Z_%.\-]*)*$/.test(b) ? `/realisasi?${b}` : "/realisasi?tab=daftar"; };
/**
 * Mengubah satu transaksi langsung di aplikasi: tanggal transaksi, nilai, catatan, Tanggal & No SPM/SP2D, dan Kode RUP (semua boleh menyusul).
 * Tidak ada verifikasi: perubahan langsung berlaku. Tahapan mengikuti tanggal SPM/SP2D (atau tanggal transaksi bila belum ada):
 * Murni < 16 Mar; Pergeseran 16 Mar - 26 Okt; Perubahan 27 Okt - 31 Des (dapat diatur admin). Bila tanggal pindah tahapan, transaksi
 * otomatis dipindah ke rekening/RUP padanannya di tahapan itu. Batas pagu/kas ditegakkan trigger database.
 */
export async function updateTransaction(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) redirect(`${back(fd)}&error=payment`);
  const p = transactionEditSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))); if (!p.success) redirect(`${back(fd)}&error=payment`);
  const sb = await createClient(), { id, payment_number, payment_date, rup_code, method_id, transaction_date, amount, notes } = p.data;
  const { data: row } = await sb.from("transactions").select("budget_version_id, budget_entry_id, rup_package_id, procurement_method_id, transaction_date, payment_date, payment_number").eq("id", id).maybeSingle();
  if (!row) redirect(`${back(fd)}&error=payment`);
  const patch: Record<string, unknown> = {};
  if (payment_number !== null) patch.payment_number = payment_number; if (payment_date !== null) patch.payment_date = payment_date;
  if (transaction_date !== null) patch.transaction_date = transaction_date; if (amount !== null) patch.amount = amount; if (notes !== undefined) patch.notes = notes || null;
  const ctx = await getBudgetContext(); let targetVid: string = row.budget_version_id as string;
  const newTx = (transaction_date ?? row.transaction_date) as string, newPay = (payment_date ?? row.payment_date) as string | null;
  if (ctx && (payment_date !== null || transaction_date !== null)) {
    if (Number(newTx.slice(0, 4)) !== ctx.year || (newPay && Number(newPay.slice(0, 4)) !== ctx.year)) redirect(`${back(fd)}&error=year`);
    const ref = referenceDate({ transactionDate: newTx, paymentDate: newPay }), ver = resolveVersion(await loadStageVersions(sb, ctx.yearId), ctx.year, ref.date);
    if (!ver) redirect(`${back(fd)}&error=stage`);
    if (ver.id !== row.budget_version_id) {
      // Pindah tahapan: cari rekening padanan (subkegiatan + rekening + sumber dana + uraian) dan RUP berkode sama pada tahapan tujuan.
      const { data: cur } = await sb.from("budget_entries").select("subactivity_id, account_id, funding_source_id, description").eq("id", row.budget_entry_id).maybeSingle();
      if (!cur) redirect(`${back(fd)}&error=move`);
      let q = sb.from("budget_entries").select("id, description").eq("budget_version_id", ver.id).eq("subactivity_id", cur.subactivity_id).eq("account_id", cur.account_id);
      q = cur.funding_source_id ? q.eq("funding_source_id", cur.funding_source_id) : q.is("funding_source_id", null);
      const { data: cands } = await q; let pick = cands ?? [];
      if (pick.length > 1) { const same = pick.filter((e) => e.description === cur.description); if (same.length) pick = same; }
      if (pick.length !== 1) redirect(`${back(fd)}&error=move`);
      patch.budget_version_id = ver.id; patch.budget_entry_id = pick[0]!.id; targetVid = ver.id;
      if (row.rup_package_id && !rup_code) {
        const { data: old } = await sb.from("rup_packages").select("rup_code").eq("id", row.rup_package_id).maybeSingle();
        const { data: nw } = old ? await sb.from("rup_packages").select("id").eq("budget_version_id", ver.id).eq("rup_code", old.rup_code).maybeSingle() : { data: null };
        if (!nw) redirect(`${back(fd)}&error=move`);
        patch.rup_package_id = nw.id;
      }
    }
  }
  // Kode RUP boleh menyusul/diubah: harus ada pada arsip RUP tahapan transaksi.
  if (rup_code) {
    const code = rup_code.replace(/\.0+$/, "");
    const { data: rp } = await sb.from("rup_packages").select("id, planned_method_id").eq("budget_version_id", targetVid).eq("rup_code", code).maybeSingle();
    if (!rp) redirect(`${back(fd)}&error=rup`);
    patch.rup_package_id = rp.id; if (!row.procurement_method_id && rp.planned_method_id) patch.procurement_method_id = rp.planned_method_id;
  }
  if (method_id) patch.procurement_method_id = method_id;   // metode pemilihan eksplisit dari formulir menggantikan metode bawaan RUP
  if (Object.keys(patch).length) { const { error } = await sb.from("transactions").update(patch).eq("id", id); if (error) redirect(`${back(fd)}&error=${error.code === "P0001" ? "limit" : "payment"}&msg=${encodeURIComponent(error.code === "P0001" ? error.message.slice(0, 200) : "")}`); }
  revalidatePath("/realisasi"); revalidatePath("/rup"); revalidatePath("/");
}

/** Menghapus satu transaksi (jejak tetap ada di Log audit). Dapat dilakukan Super Admin, Admin OPD, dan PPBJ. */
export async function deleteTransaction(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) redirect(`${back(fd)}&error=payment`);
  const id = String(fd.get("id") ?? ""); if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/realisasi?tab=daftar");
  const { data, error } = await (await createClient()).from("transactions").delete().eq("id", id).select("id");
  if (error || !data?.length) redirect(`${back(fd)}&error=delete`);
  revalidatePath("/realisasi"); revalidatePath("/rup"); revalidatePath("/");
}

/**
 * Mereset (menghapus) SELURUH transaksi realisasi pada tahun anggaran aktif untuk memulai pencatatan ulang dari awal.
 * Hanya Super Admin/Admin OPD; wajib mengetik "RESET <tahun>" dan mengakui sudah mengunduh cadangan. Jejak tetap ada di Log audit.
 */
export async function resetTransactions(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "budget-setup:write")) redirect("/realisasi?tab=riwayat&reset=denied");
  const ctx = await getBudgetContext(); if (!ctx) redirect("/realisasi?tab=riwayat&reset=denied");
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== `RESET ${ctx.year}` || fd.get("backup") !== "on") redirect("/realisasi?tab=riwayat&reset=confirm");
  const sb = await createClient();
  const { data: vs } = await sb.from("budget_versions").select("id").eq("budget_year_id", ctx.yearId), ids = (vs ?? []).map((v) => v.id as string);
  if (!ids.length) redirect("/realisasi?tab=riwayat&reset=0");
  const { data, error } = await sb.from("transactions").delete().in("budget_version_id", ids).select("id");
  if (error) redirect("/realisasi?tab=riwayat&reset=error");
  await sb.from("import_jobs").delete().eq("kind", "transactions");          // riwayat unggahan realisasi ikut dibersihkan (bila diizinkan)
  revalidatePath("/realisasi"); revalidatePath("/rup"); revalidatePath("/");
  redirect(`/realisasi?tab=riwayat&reset=${data?.length ?? 0}`);
}
