"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { can } from "@/lib/rbac";
import { parseRupiah } from "@/lib/import/parse";
import { toCents } from "@/lib/money";
import { transactionSaveSchema, transactionSchema } from "@/lib/transactions";
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
  // Penyedia: pilih dari master, atau ketik nama baru (dicocokkan tanpa membedakan huruf/spasi/tanda baca agar tidak dobel).
  const { new_provider_name, ...row } = d; let providerId = row.provider_id;
  if (providerId) { const { data: pv } = await sb.from("providers").select("is_active").eq("id", providerId).maybeSingle(); if (!pv?.is_active) return { error: "Penyedia yang dipilih tidak ditemukan atau nonaktif." }; }
  else if (new_provider_name) {
    const r = await sb.rpc("ensure_provider", { p_name: new_provider_name });
    if (r.error) return { error: r.error.code === "P0001" ? r.error.message : r.error.code === "42883" ? "Migrasi database 20260119 (penyedia pada transaksi) belum dijalankan di Supabase." : "Penyedia baru gagal disimpan. Anda mungkin tidak berwenang." };
    providerId = r.data as string;
  }
  const { error } = await sb.from("transactions").insert({ ...row, provider_id: providerId, budget_version_id: ctx.versionId });
  if (error?.code === "P0001") return { error: error.message };
  if (error?.code === "23502" || error?.code === "42703" || error?.message?.includes("schema cache")) return { error: MIGRASI };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang mencatat realisasi." };
  revalidatePath("/realisasi"); revalidatePath("/rup");
  return { ok: true };
}
const NO_AUTH = "Anda tidak berwenang mengubah realisasi (hanya Super Admin, Admin OPD, dan PPBJ).";
/**
 * Menyimpan perubahan satu transaksi dari dialog "Ubah" (hasil dan galat ditampilkan di dalam dialog, filter/halaman daftar tidak hilang).
 * Tidak ada verifikasi: perubahan langsung berlaku. Tahapan mengikuti tanggal SPM/SP2D (atau tanggal transaksi bila belum ada):
 * Murni < 16 Mar; Pergeseran 16 Mar - 26 Okt; Perubahan 27 Okt - 31 Des (dapat diatur admin). Bila tanggal pindah tahapan, transaksi
 * otomatis dipindah ke rekening/RUP padanannya di tahapan itu. Batas pagu/kas ditegakkan trigger database.
 */
export async function saveTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) return { error: NO_AUTH };
  const p = transactionSaveSchema.safeParse(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))); if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
  const d = p.data, sb = await createClient(), ctx = await getBudgetContext(); if (!ctx) return { error: "Konteks anggaran belum dipilih." };
  const { data: row } = await sb.from("transactions").select("budget_version_id, budget_entry_id, rup_package_id, procurement_method_id, provider_id, transaction_date, amount, payment_date, payment_number, notes").eq("id", d.id).maybeSingle();
  if (!row) return { error: "Transaksi tidak ditemukan atau sudah dihapus. Muat ulang halaman." };
  const patch: Record<string, unknown> = {}, same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  if (!same(d.transaction_date, row.transaction_date)) patch.transaction_date = d.transaction_date;
  if (toCents(parseRupiah(row.amount) ?? "0") !== toCents(d.amount)) patch.amount = d.amount;
  if (!same(d.payment_date, row.payment_date)) patch.payment_date = d.payment_date;
  if (!same(d.payment_number, row.payment_number)) patch.payment_number = d.payment_number;
  if (!same(d.notes, row.notes)) patch.notes = d.notes;
  if (!same(d.provider_id, row.provider_id)) patch.provider_id = d.provider_id;
  let targetVid = row.budget_version_id as string;
  if ("transaction_date" in patch || "payment_date" in patch) {
    if (Number(d.transaction_date.slice(0, 4)) !== ctx.year || (d.payment_date && Number(d.payment_date.slice(0, 4)) !== ctx.year)) return { error: `Tanggal harus berada pada tahun anggaran ${ctx.year}.` };
    const ref = referenceDate({ transactionDate: d.transaction_date, paymentDate: d.payment_date }), ver = resolveVersion(await loadStageVersions(sb, ctx.yearId), ctx.year, ref.date);
    if (!ver) return { error: "Tidak ada tahapan anggaran yang berlaku pada tanggal itu. Periksa panel Aturan tahapan anggaran (tab Unggah)." };
    if (ver.id !== row.budget_version_id) {
      // Pindah tahapan: cari rekening padanan (subkegiatan + rekening + sumber dana + uraian) pada tahapan tujuan.
      const noMove = { error: `Tanggal itu memindahkan transaksi ke tahapan ${ver.stageName}, tetapi rekening (subkegiatan + rekening + sumber dana) atau kode RUP padanannya tidak ditemukan/tidak unik di sana. Tambahkan/impor rekening itu pada tahapan tujuan (menu Kelola anggaran) lebih dulu.` };
      const { data: cur } = await sb.from("budget_entries").select("subactivity_id, account_id, funding_source_id, description").eq("id", row.budget_entry_id).maybeSingle();
      if (!cur) return noMove;
      let q = sb.from("budget_entries").select("id, description").eq("budget_version_id", ver.id).eq("subactivity_id", cur.subactivity_id).eq("account_id", cur.account_id);
      q = cur.funding_source_id ? q.eq("funding_source_id", cur.funding_source_id) : q.is("funding_source_id", null);
      const { data: cands } = await q; let pick = cands ?? [];
      if (pick.length > 1) { const same2 = pick.filter((e) => e.description === cur.description); if (same2.length) pick = same2; }
      if (pick.length !== 1) return noMove;
      patch.budget_version_id = ver.id; patch.budget_entry_id = pick[0]!.id; targetVid = ver.id;
    }
  }
  // Kode RUP & metode: RUP harus ada pada arsip RUP tahapan transaksi; metode kosong + RUP berencana metode -> mengikuti rencana RUP.
  let wantMethod = d.method_id;
  if (d.rup_code) {
    const { data: rp } = await sb.from("rup_packages").select("id, planned_method_id").eq("budget_version_id", targetVid).eq("rup_code", d.rup_code.replace(/\.0+$/, "")).maybeSingle();
    if (!rp) return { error: "Kode RUP tidak ditemukan pada tahapan transaksi ini. Sinkronkan RUP tahapan tersebut (menu Paket RUP), periksa kodenya, atau kosongkan." };
    if (rp.id !== row.rup_package_id) patch.rup_package_id = rp.id;
    wantMethod = wantMethod ?? rp.planned_method_id ?? null;
  } else if (row.rup_package_id) patch.rup_package_id = null;
  if (!same(wantMethod, row.procurement_method_id)) patch.procurement_method_id = wantMethod;
  if (d.provider_id) { const { data: pv } = await sb.from("providers").select("is_active").eq("id", d.provider_id).maybeSingle(); if (!pv?.is_active && d.provider_id !== row.provider_id) return { error: "Penyedia yang dipilih tidak ditemukan atau nonaktif." }; }
  if (!Object.keys(patch).length) return { ok: true };
  const { error } = await sb.from("transactions").update(patch).eq("id", d.id);
  if (error?.code === "P0001") return { error: error.message };
  if (error && (error.code === "42703" || error.message?.includes("schema cache"))) return { error: "Migrasi database 20260119 (penyedia pada transaksi) belum dijalankan di Supabase." };
  if (error) return { error: "Perubahan ditolak. Periksa isian dan hak akses Anda." };
  revalidatePath("/realisasi"); revalidatePath("/rup"); revalidatePath("/");
  return { ok: true };
}

/** Menghapus satu transaksi (jejak tetap ada di Log audit). Dapat dilakukan Super Admin, Admin OPD, dan PPBJ. */
export async function removeTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) return { error: NO_AUTH };
  const id = String(fd.get("id") ?? ""); if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Transaksi tidak valid." };
  const { data, error } = await (await createClient()).from("transactions").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "Transaksi tidak dapat dihapus. Anda mungkin tidak berwenang atau data sudah terhapus." };
  revalidatePath("/realisasi"); revalidatePath("/rup"); revalidatePath("/");
  return { ok: true };
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
