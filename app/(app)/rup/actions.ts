"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { fetchAll } from "@/lib/server/fetch-all";
import { can } from "@/lib/rbac";
import { rupSchema } from "@/lib/contracts";
import { readFirstSheetMatrix } from "@/lib/import/xlsx";
import { sha256 } from "@/lib/import/hash";
import { parseRupiah } from "@/lib/import/parse";
import { diffRup, findHeader, parseRupRows, type DiffRow, type ExistingRup, type MissingRup, type RupRowError, type RupRowWarning } from "@/lib/import/rup";
import { sumCents, fromCents, toCents } from "@/lib/money";
import type { FormState } from "../master/actions";

const DENIED = "Anda tidak berwenang mengubah paket RUP (hanya Super Admin, Admin OPD, dan PPBJ).";
const UUID = /^[0-9a-f-]{36}$/i;
const toObj = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ");

// ---------- manual: tambah / ubah / hapus ----------
export async function createRup(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) return { error: DENIED };
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan (menu Impor anggaran)." };
  const parsed = rupSchema.safeParse(toObj(fd));
  if (!parsed.success) return { error: issues(parsed.error) };
  const { error } = await (await createClient()).from("rup_packages").insert({ ...parsed.data, budget_version_id: ctx.versionId });
  if (error?.code === "23505") return { error: "Kode RUP sudah ada pada tahun/tahapan ini." };
  if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang." };
  revalidatePath("/rup"); return { ok: true };
}
/** Mengubah paket RUP (kode RUP boleh diperbaiki). Pagu yang diturunkan di bawah total alokasi diperbolehkan tetapi diberi peringatan, karena pergeseran anggaran memang bisa menurunkan pagu. */
export async function updateRup(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) return { error: DENIED };
  const id = String(fd.get("id") ?? ""); if (!UUID.test(id)) return { error: "Paket tidak valid." };
  const parsed = rupSchema.safeParse(toObj(fd));
  if (!parsed.success) return { error: issues(parsed.error) };
  const sb = await createClient();
  const { data, error } = await sb.from("rup_packages").update(parsed.data).eq("id", id).select("id");
  if (error?.code === "23505") return { error: "Kode RUP sudah dipakai paket lain pada tahun/tahapan ini." };
  if (error || !data?.length) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang." };
  const { data: al } = await sb.from("package_budget_allocations").select("amount").eq("rup_package_id", id);
  const used = sumCents((al ?? []).map((a) => parseRupiah(a.amount) ?? "0.00"));
  revalidatePath("/rup"); revalidatePath(`/rup/${id}`);
  return used > toCents(parsed.data.pagu ?? "0.00") ? { ok: true, warning: `Total alokasi (Rp ${fromCents(used)}) kini melebihi pagu paket. Kurangi alokasi pada rekening di bawah.` } : { ok: true };
}
export async function deleteRup(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) redirect("/rup?error=denied");
  const id = String(fd.get("id") ?? ""); if (!UUID.test(id)) redirect("/rup");
  const { data, error } = await (await createClient()).from("rup_packages").delete().eq("id", id).select("id");
  if (error || !data?.length) redirect(`/rup/${id}?error=delete`);
  revalidatePath("/rup"); revalidatePath("/paket"); redirect("/rup?deleted=1");
}

// ---------- unggah SIRUP ----------
export type RupImportState = {
  error?: string; jobId?: string; fileName?: string; total?: number; ok?: number; failed?: number; skipped?: number;
  errors?: RupRowError[]; warnings?: RupRowWarning[]; rows?: DiffRow[]; added?: number; changed?: number; unchanged?: number; missing?: MissingRup[];
  result?: { added: number; updated: number; unchanged: number; deleted: number; allocations_removed: number };
};
const MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 5000;

export async function stageRupImport(_p: RupImportState, fd: FormData): Promise<RupImportState> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) return { error: DENIED };
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return { error: "Versi anggaran untuk tahun/tahapan ini belum disiapkan (menu Impor anggaran)." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file .xlsx terlebih dahulu." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Hanya file .xlsx yang didukung. Bila SIRUP memberi PDF, salin datanya ke template Excel dari menu ini." };
  if (file.size > MAX_BYTES) return { error: "Ukuran file maksimal 5 MB." };
  const buf = await file.arrayBuffer(), bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { error: "Isi file bukan format .xlsx yang valid." };
  let matrix; try { matrix = await readFirstSheetMatrix(buf); } catch { return { error: "File tidak dapat dibaca. Pastikan bukan file rusak atau berpassword." }; }
  if (!matrix.length) return { error: "Tidak ada data pada sheet pertama." };
  if (matrix.length > MAX_ROWS + 30) return { error: `Maksimal ${MAX_ROWS} baris per unggahan.` };
  const h = findHeader(matrix); if ("error" in h) return { error: h.error };

  const sb = await createClient(), vid = ctx.versionId;
  const [methods, existingRaw, allocs, linkedRows] = await Promise.all([
    fetchAll<any>((a, b) => sb.from("procurement_methods").select("id, code, name").eq("is_active", true).order("id").range(a, b)),
    fetchAll<any>((a, b) => sb.from("rup_packages").select("id, rup_code, name, procurement_type, planned_method_id, pagu").eq("budget_version_id", vid).order("id").range(a, b)),
    fetchAll<any>((a, b) => sb.from("package_budget_allocations").select("id, rup_package_id, amount, rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", vid).order("id").range(a, b)),
    fetchAll<any>((a, b) => sb.from("procurement_packages").select("id, rup_package_id").eq("budget_version_id", vid).not("rup_package_id", "is", null).order("id").range(a, b))]);
  const res = parseRupRows(matrix, h.map, methods);
  if (!res.valid.length && !res.errors.length) return { error: "Tidak ada baris data di bawah judul kolom." };

  const existing: ExistingRup[] = existingRaw.map((r: any) => ({ ...r, pagu: parseRupiah(r.pagu) ?? "0.00" }));
  const perPkg = new Map<string, string[]>(), cnt = new Map<string, number>(), linked = new Map<string, number>();
  for (const a of allocs) { perPkg.set(a.rup_package_id, [...(perPkg.get(a.rup_package_id) ?? []), parseRupiah(a.amount) ?? "0.00"]); cnt.set(a.rup_package_id, (cnt.get(a.rup_package_id) ?? 0) + 1); }
  for (const l of linkedRows) linked.set(l.rup_package_id, (linked.get(l.rup_package_id) ?? 0) + 1);
  const used = new Map([...perPkg].map(([k, v]) => [k, fromCents(sumCents(v))]));
  const diff = diffRup(res.valid, res.rowOf, existing, used, cnt, linked);

  const checksum = sha256(bytes);
  const { data: prior } = await sb.from("import_jobs").select("id, status").eq("kind", "rup_packages").eq("budget_version_id", vid).eq("checksum", checksum).maybeSingle();
  if (prior?.status === "confirmed") return { error: "File ini sudah pernah diterapkan. Bila ada perubahan di SIRUP, unduh ulang data terbarunya (isi file akan berbeda)." };
  const failedRows = new Set(res.errors.map((e) => e.row)).size;
  const payload = { file_name: file.name.slice(0, 200), total_rows: res.valid.length + failedRows, ok_rows: res.valid.length, error_rows: failedRows, staged_rows: res.valid, status: "staged", confirmed_by: null, confirmed_at: null };
  let jobId = prior?.id as string | undefined;
  if (jobId) {
    await sb.from("import_errors").delete().eq("import_job_id", jobId);
    const { error } = await sb.from("import_jobs").update(payload).eq("id", jobId);
    if (error) return { error: "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang." };
  } else {
    const { data, error } = await sb.from("import_jobs").insert({ ...payload, kind: "rup_packages", budget_version_id: vid, checksum }).select("id").single();
    if (error || !data) return { error: "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang." };
    jobId = data.id;
  }
  if (res.errors.length) await sb.from("import_errors").insert(res.errors.slice(0, 1000).map((e) => ({ import_job_id: jobId, row_no: e.row, field: e.field, message: e.message, hint: e.hint })));
  revalidatePath("/rup");
  return { jobId, fileName: file.name, total: payload.total_rows, ok: res.valid.length, failed: failedRows, skipped: res.skipped, errors: res.errors.slice(0, 200), warnings: res.warnings.slice(0, 200),
    rows: diff.rows.slice(0, 300), added: diff.added, changed: diff.changed, unchanged: diff.unchanged, missing: diff.missing.slice(0, 200) };
}

export async function confirmRupImport(_p: RupImportState, fd: FormData): Promise<RupImportState> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) return { error: DENIED };
  const jobId = String(fd.get("jobId") ?? ""); if (!UUID.test(jobId)) return { error: "Job impor tidak valid." };
  const { data, error } = await (await createClient()).rpc("confirm_rup_import", { p_job: jobId, p_delete_missing: fd.get("delete_missing") === "on", p_skip_errors: fd.get("skip") === "on" });
  if (error) return { error: error.message.includes("function") ? "Migrasi database 20260109 (sinkronisasi RUP) belum dijalankan di Supabase." : error.message };
  revalidatePath("/rup"); revalidatePath("/paket");
  return { result: data as NonNullable<RupImportState["result"]> };
}
export async function deleteRupImportJob(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "rup:write")) return;
  const id = String(fd.get("jobId") ?? ""); if (!UUID.test(id)) return;
  await (await createClient()).from("import_jobs").delete().eq("id", id).eq("kind", "rup_packages").neq("status", "confirmed");
  revalidatePath("/rup");
}
