"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { loadCashEntries, toEntryRefs } from "@/lib/server/cash-data";
import { extractPdfLines } from "@/lib/server/pdf-lines";
import { readFirstSheet } from "@/lib/import/xlsx";
import { sha256 } from "@/lib/import/hash";
import { parseRupiah } from "@/lib/import/parse";
import { buildEntryIndex, parseCashPdfLines, validateCashRows, type CashParse, type CashRowError, type PreviewRow, type Quarters } from "@/lib/cash-import";
import { can } from "@/lib/rbac";

const DENIED = "Anda tidak berwenang mengubah anggaran kas.";
const MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 5000;
const UUID = /^[0-9a-f-]{36}$/i;

async function ensurePlan(sb: Awaited<ReturnType<typeof createClient>>, versionId: string): Promise<string | null> {
  const { data: plan } = await sb.from("cash_plans").select("id").eq("budget_version_id", versionId).order("created_at").limit(1).maybeSingle();
  if (plan) return plan.id;
  const r = await sb.from("cash_plans").insert({ budget_version_id: versionId, name: "Anggaran kas" }).select("id").single();
  return r.data?.id ?? null;
}

// ---------- input manual ----------
export type GridState = { ok?: boolean; error?: string; saved?: number };
export async function saveCashGrid(changes: { entryId: string; q: (string | null)[] }[]): Promise<GridState> {
  const s = await getSession(); if (!s || !can(s.roles, "cash:write")) return { error: DENIED };
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return { error: "Versi anggaran belum disiapkan." };
  if (!Array.isArray(changes) || !changes.length) return { error: "Tidak ada perubahan." };
  if (changes.length > MAX_ROWS) return { error: `Maksimal ${MAX_ROWS} baris per penyimpanan.` };
  const parsed: { id: string; q: Quarters }[] = [];
  for (const c of changes) {
    if (!UUID.test(c.entryId) || !Array.isArray(c.q) || c.q.length !== 4) return { error: "Data perubahan tidak valid." };
    const q = c.q.map((v) => { if (v === null || String(v).trim() === "") return null; return parseRupiah(String(v)); }) as Quarters;
    if (c.q.some((v, i) => v !== null && String(v).trim() !== "" && q[i] === null)) return { error: "Ada angka dengan format tidak valid." };
    if (q.some((v) => v?.startsWith("-"))) return { error: "Nilai kas tidak boleh negatif." };
    parsed.push({ id: c.entryId, q });
  }
  const sb = await createClient();
  const ids = [...new Set(parsed.map((p) => p.id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("budget_entries").select("id").eq("budget_version_id", ctx.versionId).in("id", ids.slice(i, i + 200));
    if ((data?.length ?? 0) !== ids.slice(i, i + 200).length) return { error: "Ada rekening yang bukan bagian dari tahun/tahapan ini. Muat ulang halaman." };
  }
  const planId = await ensurePlan(sb, ctx.versionId); if (!planId) return { error: DENIED };
  const upserts = parsed.flatMap((p) => p.q.map((v, i) => (v === null ? null : { cash_plan_id: planId, budget_entry_id: p.id, period_quarter: i + 1, planned_amount: v })).filter((x) => x !== null));
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await sb.from("cash_plan_items").upsert(upserts.slice(i, i + 500), { onConflict: "cash_plan_id,budget_entry_id,period_quarter" });
    if (error) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang." };
  }
  for (let qn = 1; qn <= 4; qn++) {
    const clear = parsed.filter((p) => p.q[qn - 1] === null).map((p) => p.id);
    for (let i = 0; i < clear.length; i += 200) {
      const { error } = await sb.from("cash_plan_items").delete().eq("cash_plan_id", planId).eq("period_quarter", qn).in("budget_entry_id", clear.slice(i, i + 200));
      if (error) return { error: "Gagal menghapus nilai yang dikosongkan." };
    }
  }
  revalidatePath("/kas");
  return { ok: true, saved: parsed.length };
}

// ---------- unggah Excel / PDF ----------
export type CashImportState = {
  error?: string; jobId?: string; fileName?: string; fileKind?: "xlsx" | "pdf"; total?: number; ok?: number; failed?: number; skipped?: number; over?: number;
  errors?: CashRowError[]; preview?: PreviewRow[]; applied?: number;
};
export async function stageCashImport(_p: CashImportState, fd: FormData): Promise<CashImportState> {
  const s = await getSession(); if (!s || !can(s.roles, "cash:write")) return { error: DENIED };
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return { error: "Versi anggaran untuk tahun/tahapan ini belum disiapkan." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file .xlsx atau .pdf terlebih dahulu." };
  const name = file.name.toLowerCase(), kind = name.endsWith(".xlsx") ? "xlsx" : name.endsWith(".pdf") ? "pdf" : null;
  if (!kind) return { error: "Hanya file .xlsx (Excel) atau .pdf yang didukung." };
  if (file.size > MAX_BYTES) return { error: "Ukuran file maksimal 5 MB." };
  const buf = await file.arrayBuffer(), bytes = new Uint8Array(buf);
  if (kind === "xlsx" && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) return { error: "Isi file bukan format .xlsx yang valid." };
  if (kind === "pdf" && String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") return { error: "Isi file bukan PDF yang valid." };

  const sb = await createClient();
  const { entries } = await loadCashEntries(sb, ctx.versionId);
  if (!entries.length) return { error: "Belum ada rekening anggaran. Impor anggaran lebih dulu di menu Impor anggaran." };
  const idx = buildEntryIndex(toEntryRefs(entries));
  let result: CashParse, total: number;
  if (kind === "xlsx") {
    let rows; try { rows = await readFirstSheet(buf); } catch { return { error: "File tidak dapat dibaca. Pastikan bukan file rusak atau berpassword." }; }
    if (!rows.length) return { error: "Tidak ada baris data pada sheet pertama." };
    if (rows.length > MAX_ROWS) return { error: `Maksimal ${MAX_ROWS} baris per unggahan.` };
    result = validateCashRows(rows, idx); total = rows.length;
  } else {
    let lines: string[]; try { lines = await extractPdfLines(bytes); } catch { return { error: "PDF tidak dapat dibaca. Pastikan bukan file rusak atau berpassword." }; }
    if (!lines.length) return { error: "PDF tidak berisi teks yang dapat dibaca (mungkin hasil scan/gambar). Gunakan template Excel dari menu ini." };
    result = parseCashPdfLines(lines, idx); total = result.valid.length + result.errors.length;
  }
  if (!result.valid.length && !result.errors.length) return { error: kind === "pdf" ? "Tidak ada baris yang dikenali. Pastikan PDF memuat kode subkegiatan dan kode rekening yang sama dengan anggaran, atau gunakan template Excel." : "Tidak ada baris dengan nilai triwulan. Isi kolom tw1-tw4 pada template." };

  const checksum = sha256(bytes);
  const { data: existing } = await sb.from("import_jobs").select("id").eq("kind", "cash_plans").eq("budget_version_id", ctx.versionId).eq("checksum", checksum).maybeSingle();
  const payload = { file_name: file.name.slice(0, 200), total_rows: total, ok_rows: result.valid.length, error_rows: new Set(result.errors.map((e) => e.row)).size, staged_rows: result.valid, status: "staged", confirmed_by: null, confirmed_at: null };
  let jobId = existing?.id as string | undefined;
  if (jobId) {
    await sb.from("import_errors").delete().eq("import_job_id", jobId);
    const { error } = await sb.from("import_jobs").update(payload).eq("id", jobId);
    if (error) return { error: "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang." };
  } else {
    const { data, error } = await sb.from("import_jobs").insert({ ...payload, kind: "cash_plans", budget_version_id: ctx.versionId, checksum }).select("id").single();
    if (error || !data) return { error: "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang." };
    jobId = data.id;
  }
  if (result.errors.length) await sb.from("import_errors").insert(result.errors.slice(0, 1000).map((e) => ({ import_job_id: jobId, row_no: e.row, field: e.field, message: e.message, hint: e.hint })));
  return { jobId, fileName: file.name, fileKind: kind, total, ok: result.valid.length, failed: payload.error_rows, skipped: result.skipped,
    over: result.preview.filter((r) => r.over).length, errors: result.errors.slice(0, 200), preview: result.preview.slice(0, 300) };
}
export async function confirmCashImport(_p: CashImportState, fd: FormData): Promise<CashImportState> {
  const s = await getSession(); if (!s || !can(s.roles, "cash:write")) return { error: DENIED };
  const jobId = String(fd.get("jobId") ?? ""); if (!UUID.test(jobId)) return { error: "Job impor tidak valid." };
  const { data, error } = await (await createClient()).rpc("confirm_cash_import", { p_job: jobId, p_skip_errors: fd.get("skip") === "on" });
  if (error) return { error: error.message.includes("function") ? "Migrasi database 20260107 belum dijalankan di Supabase." : error.message };
  revalidatePath("/kas");
  return { applied: data as number };
}
