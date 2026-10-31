"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { fetchAll } from "@/lib/server/fetch-all";
import { loadStageVersions } from "@/lib/server/stage-versions";
import { can } from "@/lib/rbac";
import { readFirstSheetMatrix, type MatrixRow } from "@/lib/import/xlsx";
import { decodeCsv, parseCsv } from "@/lib/import/csv";
import { sha256 } from "@/lib/import/hash";
import { findTxHeader, parseTxRows, type StagedTx, type TxLookup, type TxRowError, type TxRowWarning } from "@/lib/import/transactions";
import { toCents, fromCents } from "@/lib/money";
import { latestPerStage } from "@/lib/stage-rule";
import { parseDateCell } from "@/lib/import/dates";

const DENIED = "Anda tidak berwenang mencatat realisasi (hanya Super Admin, Admin OPD, dan PPBJ).";
const UUID = /^[0-9a-f-]{36}$/i, MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 2000; // 2.000 baris ~3 detik di database; lebih besar berisiko melewati batas waktu kueri Supabase

export type PreviewRow = { row: number; tanggal: string; acuan: string; basis: string; tahapan: string; rekening: string; rup: string | null; proses: string; pencairan: string; nilai: string; status: "ok" | "ditolak"; pesan?: string };
export type Breakdown = { key: string; label: string; count: number; amount: string };
export type TxImportState = {
  error?: string; jobId?: string; fileName?: string; total?: number; ok?: number; failed?: number; skipped?: number; wouldInsert?: number; existing?: number;
  errors?: TxRowError[]; dbFailed?: { row: number; message: string }[]; warnings?: TxRowWarning[]; rows?: PreviewRow[];
  byStage?: Breakdown[]; byPayment?: Breakdown[]; byProses?: Breakdown[]; result?: { inserted: number; existing: number; failed: number };
};
const sum = (xs: StagedTx[]) => fromCents(xs.reduce((a, x) => a + toCents(x.amount), 0n));
function group(rows: StagedTx[], key: (r: StagedTx) => [string, string]): Breakdown[] {
  const m = new Map<string, { label: string; rs: StagedTx[] }>();
  for (const r of rows) { const [k, label] = key(r); const g = m.get(k) ?? { label, rs: [] }; g.rs.push(r); m.set(k, g); }
  return [...m].map(([k, g]) => ({ key: k, label: g.label, count: g.rs.length, amount: sum(g.rs) }));
}
const PAY_LABEL = { cair: "Sudah cair (SP2D)", spm: "SPM diajukan", belum: "Belum diajukan" } as const;

export async function stageTxImport(_p: TxImportState, fd: FormData): Promise<TxImportState> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) return { error: DENIED };
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return { error: "Versi anggaran untuk tahun/tahapan ini belum disiapkan (menu Impor anggaran)." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file .xlsx atau .csv terlebih dahulu." };
  const name = file.name.toLowerCase(), isCsv = name.endsWith(".csv");
  if (!isCsv && !name.endsWith(".xlsx")) return { error: "Hanya file .xlsx atau .csv yang didukung." };
  if (file.size > MAX_BYTES) return { error: "Ukuran file maksimal 5 MB." };
  const buf = await file.arrayBuffer(), bytes = new Uint8Array(buf);
  let matrix: MatrixRow[];
  if (isCsv) { if (bytes.includes(0)) return { error: "Isi file bukan CSV teks yang valid." }; matrix = parseCsv(decodeCsv(bytes)); }
  else { if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { error: "Isi file bukan format .xlsx yang valid." };
    try { matrix = await readFirstSheetMatrix(buf); } catch { return { error: "File tidak dapat dibaca. Pastikan bukan file rusak atau berpassword." }; } }
  if (!matrix.length) return { error: "Tidak ada data pada file." };
  if (matrix.length > MAX_ROWS + 30) return { error: `Maksimal ${MAX_ROWS.toLocaleString("id-ID")} baris per unggahan. Bagi file menjadi beberapa bagian (mis. per triwulan); dokumen yang sudah tercatat otomatis dilewati.` };
  const h = findTxHeader(matrix); if ("error" in h) return { error: h.error };

  const sb = await createClient();
  const versions = await loadStageVersions(sb, ctx.yearId), vids = latestPerStage(versions).map((v) => v.id);
  if (!vids.length) return { error: "Belum ada versi anggaran pada tahun ini." };
  const [ents, rups, pkgs, allocs] = await Promise.all([
    fetchAll<any>((a, b) => sb.from("budget_entries").select("id, budget_version_id, description, subactivities(code), expenditure_accounts(code), funding_sources(code)").in("budget_version_id", vids).order("id").range(a, b)),
    fetchAll<any>((a, b) => sb.from("rup_packages").select("id, budget_version_id, rup_code").in("budget_version_id", vids).order("id").range(a, b)),
    fetchAll<any>((a, b) => sb.from("procurement_packages").select("id, budget_version_id, internal_code, rup_package_id").in("budget_version_id", vids).order("id").range(a, b)),
    fetchAll<any>((a, b) => sb.from("package_budget_allocations").select("id, budget_entry_id, rup_packages!inner(rup_code, budget_version_id)").in("rup_packages.budget_version_id", vids).order("id").range(a, b))]);
  const rupByVersion = new Map<string, Map<string, string>>(), pkgByVersion = new Map<string, Map<string, { id: string; rupId: string | null }>>(), rupCodeById = new Map<string, string>();
  for (const r of rups) { (rupByVersion.get(r.budget_version_id) ?? rupByVersion.set(r.budget_version_id, new Map()).get(r.budget_version_id)!).set(r.rup_code, r.id); rupCodeById.set(r.id, r.rup_code); }
  for (const p of pkgs) (pkgByVersion.get(p.budget_version_id) ?? pkgByVersion.set(p.budget_version_id, new Map()).get(p.budget_version_id)!).set(p.internal_code, { id: p.id, rupId: p.rup_package_id });
  const allocRupByEntry = new Map<string, string[]>(); for (const a of allocs) allocRupByEntry.set(a.budget_entry_id, [...(allocRupByEntry.get(a.budget_entry_id) ?? []), a.rup_packages.rup_code]);
  const lk: TxLookup = { year: ctx.year, versions, rupByVersion, pkgByVersion, rupCodeById, allocRupByEntry,
    entries: ents.map((e: any) => ({ id: e.id, versionId: e.budget_version_id, sub: e.subactivities?.code ?? "", acc: e.expenditure_accounts?.code ?? "", fund: e.funding_sources?.code ?? "", desc: e.description })) };

  const res = parseTxRows(matrix, h.map, lk);
  if (!res.valid.length && !res.errors.length) return { error: "Tidak ada baris data di bawah judul kolom." };
  const failedRows = new Set(res.errors.map((e) => e.row)).size;
  const checksum = sha256(bytes);
  const { data: prior } = await sb.from("import_jobs").select("id, status").eq("kind", "transactions").eq("budget_version_id", ctx.versionId).eq("checksum", checksum).maybeSingle();
  if (prior?.status === "confirmed") return { error: "File ini sudah pernah diterapkan. Bila ada perubahan, unduh ulang datanya (isi file akan berbeda); dokumen yang sudah tercatat dikenali otomatis dan tidak dicatat ganda." };
  const payload = { file_name: file.name.slice(0, 200), total_rows: res.valid.length + failedRows, ok_rows: res.valid.length, error_rows: failedRows, staged_rows: res.valid, status: "staged", confirmed_by: null, confirmed_at: null };
  let jobId = prior?.id as string | undefined;
  if (jobId) {
    await sb.from("import_errors").delete().eq("import_job_id", jobId);
    const { error } = await sb.from("import_jobs").update(payload).eq("id", jobId);
    if (error) return { error: "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang." };
  } else {
    const { data, error } = await sb.from("import_jobs").insert({ ...payload, kind: "transactions", budget_version_id: ctx.versionId, checksum }).select("id").single();
    if (error || !data) return { error: error?.message?.includes("import_jobs_kind_check") ? "Migrasi database 20260112 (unggah realisasi) belum dijalankan di Supabase." : "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang." };
    jobId = data.id;
  }
  if (res.errors.length) await sb.from("import_errors").insert(res.errors.slice(0, 1000).map((e) => ({ import_job_id: jobId, row_no: e.row, field: e.field, message: e.message, hint: e.hint })));

  // Pratinjau memakai logika database yang sama dengan penerapan (lalu dibatalkan): batas pagu, kas kumulatif, pagu RUP, dokumen ganda.
  let dbFailed: { row: number; message: string }[] = [], wouldInsert = 0, existing = 0;
  if (res.valid.length) {
    const { data, error } = await sb.rpc("apply_transaction_import", { p_job: jobId, p_commit: false });
    if (error) return { error: error.message.includes("function") || error.message.includes("schema cache") ? "Migrasi database 20260112 (unggah realisasi) belum dijalankan di Supabase." : error.message };
    const r = data as { inserted: number; existing: number; failed: { row: number; message: string }[] };
    dbFailed = r.failed ?? []; wouldInsert = r.inserted; existing = r.existing;
  }
  const bad = new Map(dbFailed.map((f) => [f.row, f.message])), good = res.valid.filter((v) => !bad.has(v.row));
  const rows: PreviewRow[] = res.valid.slice(0, 300).map((v) => ({ row: v.row, tanggal: v.transaction_date, acuan: v.ref_date, basis: v.basis, tahapan: v.stage_name, rekening: v.entry_label, rup: v.rup_code, proses: v.proses === "pengadaan" ? "Pengadaan" : "Non-pengadaan",
    pencairan: PAY_LABEL[v.payment_status], nilai: v.amount, status: bad.has(v.row) ? "ditolak" : "ok", pesan: bad.get(v.row) }));
  revalidatePath("/realisasi");
  return { jobId, fileName: file.name, total: payload.total_rows, ok: res.valid.length, failed: failedRows + dbFailed.length, skipped: res.skipped, wouldInsert, existing,
    errors: res.errors.slice(0, 200), dbFailed: dbFailed.slice(0, 200), warnings: res.warnings.slice(0, 200), rows,
    byStage: group(good, (r) => [r.stage_code, r.stage_name]), byPayment: group(good, (r) => [r.payment_status, PAY_LABEL[r.payment_status]]), byProses: group(good, (r) => [r.proses, r.proses === "pengadaan" ? "Proses pengadaan (ada kode RUP/paket)" : "Non-pengadaan"]) };
}

export async function confirmTxImport(_p: TxImportState, fd: FormData): Promise<TxImportState> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) return { error: DENIED };
  const jobId = String(fd.get("jobId") ?? ""); if (!UUID.test(jobId)) return { error: "Job impor tidak valid." };
  const { data, error } = await (await createClient()).rpc("apply_transaction_import", { p_job: jobId, p_commit: true, p_skip_errors: fd.get("skip") === "on" });
  if (error) return { error: error.message };
  const r = data as { inserted: number; existing: number; failed: unknown[] };
  revalidatePath("/realisasi"); revalidatePath("/rup"); revalidatePath("/");
  return { result: { inserted: r.inserted, existing: r.existing, failed: r.failed?.length ?? 0 } };
}
export async function deleteTxImportJob(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "realization:write")) return;
  const id = String(fd.get("jobId") ?? ""); if (!UUID.test(id)) return;
  await (await createClient()).from("import_jobs").delete().eq("id", id).eq("kind", "transactions").neq("status", "confirmed");
  revalidatePath("/realisasi");
}
/** Verifikasi massal transaksi satu unggahan. Hanya admin (dijaga database); tercatat di log audit per transaksi. */
export async function verifyTxImportJob(fd: FormData): Promise<void> {
  const id = String(fd.get("jobId") ?? ""); if (!UUID.test(id)) return;
  const { error } = await (await createClient()).rpc("verify_import_transactions", { p_job: id });
  revalidatePath("/realisasi"); revalidatePath("/");
  if (error) redirect("/realisasi?tab=riwayat&error=verify");
}

export type StageDatesState = { error?: string; ok?: boolean };
/** Mengatur tanggal mulai berlaku tahapan (Admin). Kunci form: v_<id versi>. Kosong = belum berlaku (Murni otomatis 1 Januari). */
export async function saveStageDates(_p: StageDatesState, fd: FormData): Promise<StageDatesState> {
  const s = await getSession(); if (!s || !can(s.roles, "budget-setup:write")) return { error: "Hanya Super Admin dan Admin OPD yang dapat mengatur tanggal berlaku tahapan." };
  const ctx = await getBudgetContext(); if (!ctx) return { error: "Konteks anggaran tidak ditemukan." };
  const sb = await createClient(), versions = await loadStageVersions(sb, ctx.yearId), upd: { id: string; date: string | null }[] = [];
  for (const v of versions) {
    const raw = fd.get(`v_${v.id}`); if (raw === null) continue;
    const d = parseDateCell(String(raw)); if (d === null) return { error: `Tanggal ${v.stageName} tidak valid.` };
    if (d && Number(d.slice(0, 4)) !== ctx.year) return { error: `Tanggal berlaku ${v.stageName} harus berada pada tahun ${ctx.year}.` };
    if (!d && v.stageCode !== "MURNI" && v.effectiveFrom) return { error: `Tanggal ${v.stageName} tidak boleh dikosongkan setelah diatur; ubah ke tanggal lain.` };
    upd.push({ id: v.id, date: d || null });
  }
  for (const u of upd) { const { error } = await sb.from("budget_versions").update({ effective_from: u.date }).eq("id", u.id); if (error) return { error: error.message.includes("effective_from") ? "Migrasi database 20260112 belum dijalankan di Supabase." : "Gagal menyimpan. Anda mungkin tidak berwenang." }; }
  revalidatePath("/realisasi");
  return { ok: true };
}
