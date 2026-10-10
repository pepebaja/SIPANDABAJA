import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { loadRealization } from "./realization-data";
import type { ActiveContext } from "./budget-context";
import type { Session } from "./session";
import { can, ROLE_LABELS, type Role } from "@/lib/rbac";
import { derive, totals } from "@/lib/realization";
import { fromCents, toCents } from "@/lib/money";
import { parseRupiah } from "@/lib/import/parse";
import { MONTHS } from "@/lib/allocations";
import { DOC_TYPES, KINDS } from "@/lib/transactions";
import { actionLabel, auditSummary, tableLabel } from "@/lib/audit-labels";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { findReport, type Report } from "@/lib/report-types";

const m = (v: unknown) => parseRupiah(v) ?? "0.00";
const sum = (xs: string[]) => fromCents(xs.reduce((a, x) => a + toCents(x), 0n));
const RUP_TYPES: Record<string, string> = { barang: "Barang", konstruksi: "Konstruksi", konsultansi: "Konsultansi", jasa_lainnya: "Jasa lainnya" };
const MONTH_KEYS = MONTHS.map((_, i) => `m${i + 1}`);
type Ctx = { sb: SupabaseClient; ctx: ActiveContext | null; session: Session };

const entryLabel = (e: any) => `${e.subactivities?.code ?? ""} / ${e.expenditure_accounts?.code ?? ""}: ${e.description}`;
const loadEntryRows = (sb: SupabaseClient, vid: string) => fetchAll<any>((f, t) =>
  sb.from("budget_entries").select("id, entry_key, description, amount, subactivities(code, name), expenditure_accounts(code, name), funding_sources(code)").eq("budget_version_id", vid).order("entry_key").range(f, t));

export type BuildResult = { report: Report } | { error: string };

export async function buildReport(slug: string, { sb, ctx, session }: Ctx): Promise<BuildResult> {
  const meta = findReport(slug);
  if (!meta) return { error: "Laporan tidak ditemukan." };
  if (meta.permission && !can(session.roles, meta.permission)) return { error: "Anda tidak berwenang membuka laporan ini." };
  const subtitle = ctx ? `Tahun Anggaran ${ctx.year} · Tahapan ${ctx.stageName}` : undefined;
  const base = { slug, title: meta.title, landscape: meta.landscape, subtitle };
  const vid = ctx?.versionId ?? null;
  if (meta.needsVersion && !vid) return { error: "Belum ada versi anggaran untuk tahun/tahapan ini. Siapkan di menu Impor anggaran." };
  try {
    switch (slug) {
      case "anggaran-realisasi": {
        const [entries, real] = await Promise.all([loadEntryRows(sb, vid!), loadRealization(sb, vid!)]);
        const by = new Map(real.map((r) => [r.entryId, r]));
        const rows = entries.map((e, i) => {
          const r = by.get(e.id) ?? { pagu: m(e.amount), verified: "0.00", unverified: "0.00", txCount: 0, unverifiedCount: 0 }, d = derive(r);
          return { no: i + 1, sub: e.subactivities?.code ?? "", rek: e.expenditure_accounts?.code ?? "", uraian: e.description, dana: e.funding_sources?.code ?? "", pagu: d.pagu, real: d.verified, belum: d.unverified, sisa: d.remaining, pct: d.percent };
        });
        const t = totals(real);
        return { report: { ...base, columns: [
          { key: "no", label: "No", kind: "int", align: "center", width: 6 }, { key: "sub", label: "Subkegiatan", width: 16 }, { key: "rek", label: "Rekening", width: 18 },
          { key: "uraian", label: "Uraian", width: 44 }, { key: "dana", label: "Sumber dana", width: 14 }, { key: "pagu", label: "Pagu", kind: "money", width: 18 },
          { key: "real", label: "Realisasi terverifikasi", kind: "money", width: 20 }, { key: "belum", label: "Belum diverifikasi", kind: "money", width: 18 },
          { key: "sisa", label: "Sisa pagu", kind: "money", width: 18 }, { key: "pct", label: "%", kind: "percent", align: "right", width: 10 }],
          rows, totals: { uraian: "TOTAL", pagu: t.pagu, real: t.verified, belum: t.unverified, sisa: t.remaining, pct: t.percent },
          notes: ["Realisasi, sisa, dan persentase dihitung dari transaksi terverifikasi saja.", "Nilai kontrak/SP tidak dihitung sebagai realisasi.", ...(t.unverifiedCount ? [`${t.unverifiedCount} transaksi belum diverifikasi tidak ikut dihitung sebagai realisasi.`] : [])] } };
      }
      case "paket-pengadaan": {
        const [pk, ct, st] = await Promise.all([
          fetchAll<any>((f, t) => sb.from("procurement_packages").select("id, internal_code, name, execution_mode, pagu, status, due_date, rup:rup_packages(rup_code), method:procurement_methods(name), ppbj:officials!ppbj_id(name), ppk:officials!ppk_id(name), pptk:officials!pptk_id(name)").eq("budget_version_id", vid!).order("internal_code").range(f, t)),
          fetchAll<any>((f, t) => sb.from("contracts_or_orders").select("id, procurement_package_id, contract_value, procurement_packages!inner(budget_version_id)").eq("procurement_packages.budget_version_id", vid!).order("id").range(f, t)),
          sb.from("package_statuses").select("code, name")]);
        const sname = new Map((st.data ?? []).map((s) => [s.code, s.name])), cv = new Map<string, string[]>();
        for (const c of ct) cv.set(c.procurement_package_id, [...(cv.get(c.procurement_package_id) ?? []), m(c.contract_value)]);
        const rows = pk.map((p, i) => ({ no: i + 1, kode: p.internal_code, nama: p.name, rup: p.rup?.rup_code ?? "Belum ada", mode: p.execution_mode === "swakelola" ? "Swakelola" : "Penyedia", metode: p.method?.name ?? "-",
          ppbj: p.ppbj?.name ?? "-", ppk: p.ppk?.name ?? "-", pptk: p.pptk?.name ?? "-", pagu: m(p.pagu), kontrak: sum(cv.get(p.id) ?? []), status: sname.get(p.status) ?? p.status, tenggat: fmtDate(p.due_date) }));
        return { report: { ...base, columns: [
          { key: "no", label: "No", kind: "int", align: "center", width: 6 }, { key: "kode", label: "Kode", width: 14 }, { key: "nama", label: "Nama paket", width: 44 }, { key: "rup", label: "Kode RUP", width: 14 },
          { key: "mode", label: "Cara", width: 11 }, { key: "metode", label: "Metode", width: 20 }, { key: "ppbj", label: "PPBJ", width: 20 }, { key: "ppk", label: "PPK", width: 20 }, { key: "pptk", label: "PPTK", width: 20 },
          { key: "pagu", label: "Pagu", kind: "money", width: 18 }, { key: "kontrak", label: "Nilai kontrak/SP", kind: "money", width: 18 }, { key: "status", label: "Status", width: 22 }, { key: "tenggat", label: "Tenggat", align: "center", width: 12 }],
          rows, totals: { nama: "TOTAL", pagu: sum(rows.map((r) => r.pagu)), kontrak: sum(rows.map((r) => r.kontrak)) },
          notes: ["Nilai kontrak/SP adalah komitmen, bukan realisasi keuangan."] } };
      }
      case "paket-rup": {
        const [rup, al] = await Promise.all([
          fetchAll<any>((f, t) => sb.from("rup_packages").select("id, rup_code, name, procurement_type, pagu, verification_status, method:procurement_methods(name)").eq("budget_version_id", vid!).order("rup_code").range(f, t)),
          fetchAll<any>((f, t) => sb.from("package_budget_allocations").select("id, rup_package_id, amount, rup_packages!inner(budget_version_id)").eq("rup_packages.budget_version_id", vid!).order("id").range(f, t))]);
        const used = new Map<string, string[]>();
        for (const a of al) used.set(a.rup_package_id, [...(used.get(a.rup_package_id) ?? []), m(a.amount)]);
        const rows = rup.map((r, i) => { const u = sum(used.get(r.id) ?? []); return { no: i + 1, kode: r.rup_code, nama: r.name, jenis: RUP_TYPES[r.procurement_type] ?? r.procurement_type, metode: r.method?.name ?? "-", pagu: m(r.pagu), alok: u, sisa: fromCents(toCents(m(r.pagu)) - toCents(u)), ver: r.verification_status === "verified" ? "Terverifikasi" : "Belum" }; });
        return { report: { ...base, columns: [
          { key: "no", label: "No", kind: "int", align: "center", width: 6 }, { key: "kode", label: "Kode RUP", width: 16 }, { key: "nama", label: "Nama paket", width: 46 }, { key: "jenis", label: "Jenis", width: 16 }, { key: "metode", label: "Metode", width: 20 },
          { key: "pagu", label: "Pagu", kind: "money", width: 18 }, { key: "alok", label: "Teralokasi", kind: "money", width: 18 }, { key: "sisa", label: "Belum dialokasikan", kind: "money", width: 20 }, { key: "ver", label: "Verifikasi", width: 14 }],
          rows, totals: { nama: "TOTAL", pagu: sum(rows.map((r) => r.pagu)), alok: sum(rows.map((r) => r.alok)), sisa: sum(rows.map((r) => r.sisa)) } } };
      }
      case "anggaran-kas": {
        const { data: plan } = await sb.from("cash_plans").select("id").eq("budget_version_id", vid!).order("created_at").limit(1).maybeSingle();
        const [entries, items] = await Promise.all([loadEntryRows(sb, vid!),
          plan ? fetchAll<any>((f, t) => sb.from("cash_plan_items").select("id, budget_entry_id, period_month, planned_amount").eq("cash_plan_id", plan.id).order("id").range(f, t)) : Promise.resolve([] as any[])]);
        const per = new Map<string, Map<number, string[]>>();
        for (const i of items) { const mm = per.get(i.budget_entry_id) ?? new Map<number, string[]>(); mm.set(i.period_month, [...(mm.get(i.period_month) ?? []), m(i.planned_amount)]); per.set(i.budget_entry_id, mm); }
        const rows = entries.filter((e) => per.has(e.id)).map((e, i) => {
          const mm = per.get(e.id)!, r: Record<string, any> = { no: i + 1, rek: entryLabel(e) };
          MONTH_KEYS.forEach((k, idx) => { r[k] = sum(mm.get(idx + 1) ?? []); });
          r.total = sum(MONTH_KEYS.map((k) => r[k])); r.pagu = m(e.amount); return r;
        });
        const tot: Record<string, any> = { rek: "TOTAL" };
        [...MONTH_KEYS, "total", "pagu"].forEach((k) => { tot[k] = sum(rows.map((r) => r[k])); });
        return { report: { ...base, columns: [
          { key: "no", label: "No", kind: "int", align: "center", width: 6 }, { key: "rek", label: "Rekening anggaran", width: 48 },
          ...MONTHS.map((mn, i) => ({ key: MONTH_KEYS[i]!, label: mn.slice(0, 3), kind: "money" as const, width: 15 })),
          { key: "total", label: "Total rencana kas", kind: "money" as const, width: 18 }, { key: "pagu", label: "Pagu rekening", kind: "money" as const, width: 18 }],
          rows, totals: tot, notes: ["Ini rencana kas yang dimasukkan pengguna, bukan saldo kas bank.", "Hanya rekening yang sudah memiliki rencana kas yang ditampilkan."] } };
      }
      case "transaksi": {
        const [entries, tx] = await Promise.all([loadEntryRows(sb, vid!),
          fetchAll<any>((f, t) => sb.from("transactions").select("id, transaction_date, kind, doc_type, doc_number, amount, verification_status, budget_entry_id, pkg:procurement_packages(internal_code)").eq("budget_version_id", vid!).order("transaction_date", { ascending: false }).order("id").range(f, t))]);
        const lab = new Map(entries.map((e) => [e.id, entryLabel(e)]));
        const rows = tx.map((t, i) => ({ no: i + 1, tgl: fmtDate(t.transaction_date), rek: lab.get(t.budget_entry_id) ?? "-", paket: t.pkg?.internal_code ?? "-", jenis: (KINDS[t.kind] ?? t.kind).split(" ")[0]!, dok: `${DOC_TYPES[t.doc_type] ?? t.doc_type} ${t.doc_number ?? ""}`.trim(), nilai: m(t.amount), status: t.verification_status === "verified" ? "Terverifikasi" : "Belum diverifikasi", v: t.verification_status }));
        const ver = sum(rows.filter((r) => r.v === "verified").map((r) => r.nilai)), unv = sum(rows.filter((r) => r.v !== "verified").map((r) => r.nilai));
        return { report: { ...base, columns: [
          { key: "no", label: "No", kind: "int", align: "center", width: 6 }, { key: "tgl", label: "Tanggal", align: "center", width: 12 }, { key: "rek", label: "Rekening anggaran", width: 46 }, { key: "paket", label: "Paket", width: 14 },
          { key: "jenis", label: "Jenis", width: 13 }, { key: "dok", label: "Dokumen", width: 22 }, { key: "nilai", label: "Nilai", kind: "money", width: 18 }, { key: "status", label: "Status", width: 20 }],
          rows, totals: { rek: "TOTAL TERVERIFIKASI", nilai: ver }, notes: [`Total belum diverifikasi (tidak dihitung sebagai realisasi): ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2 }).format(Number(unv))}.`, "Koreksi dan pembatalan bernilai negatif."] } };
      }
      case "pengguna": {
        const [pf, rl] = await Promise.all([
          fetchAll<any>((f, t) => sb.from("profiles").select("id, username, full_name, nip, is_active").order("username").range(f, t)),
          fetchAll<any>((f, t) => sb.from("user_roles").select("id, user_id, role").order("id").range(f, t))]);
        const roles = new Map<string, string[]>();
        for (const r of rl) roles.set(r.user_id, [...(roles.get(r.user_id) ?? []), ROLE_LABELS[r.role as Role] ?? r.role]);
        const rows = pf.map((p, i) => ({ no: i + 1, user: p.username, nama: p.full_name, nip: p.nip ?? "-", peran: (roles.get(p.id) ?? []).join(", ") || "-", status: p.is_active ? "Aktif" : "Nonaktif" }));
        return { report: { ...base, subtitle: `Per ${fmtDateTime(new Date().toISOString())}`, columns: [
          { key: "no", label: "No", kind: "int", align: "center", width: 6 }, { key: "user", label: "Username", width: 22 }, { key: "nama", label: "Nama lengkap", width: 34 }, { key: "nip", label: "NIP", width: 22 }, { key: "peran", label: "Peran", width: 22 }, { key: "status", label: "Status", width: 12 }], rows,
          notes: ["Laporan ini tidak memuat password. Password tidak pernah disimpan dalam bentuk yang dapat dibaca."] } };
      }
      case "log-audit": {
        const logs = await sb.from("audit_logs").select("id, created_at, actor_id, action, table_name, new_data, old_data").order("created_at", { ascending: false }).limit(1000);
        if (logs.error) return { error: "Log audit tidak dapat dimuat." };
        const ids = [...new Set((logs.data ?? []).map((l) => l.actor_id).filter(Boolean))] as string[];
        const { data: us } = ids.length ? await sb.from("profiles").select("id, username").in("id", ids) : { data: [] as { id: string; username: string }[] };
        const un = new Map((us ?? []).map((u) => [u.id, u.username]));
        const rows = (logs.data ?? []).map((l, i) => ({ no: i + 1, waktu: fmtDateTime(l.created_at), user: l.actor_id ? (un.get(l.actor_id) ?? "(tidak dikenal)") : "Sistem", aksi: actionLabel(l.action), objek: tableLabel(l.table_name), ket: auditSummary(l) }));
        return { report: { ...base, subtitle: `Per ${fmtDateTime(new Date().toISOString())}`, columns: [
          { key: "no", label: "No", kind: "int", align: "center", width: 6 }, { key: "waktu", label: "Waktu", width: 18 }, { key: "user", label: "Pengguna", width: 20 }, { key: "aksi", label: "Aksi", width: 20 }, { key: "objek", label: "Objek", width: 22 }, { key: "ket", label: "Keterangan", width: 44 }], rows,
          notes: ["Menampilkan paling banyak 1.000 catatan terbaru."] } };
      }
      default: return { error: "Laporan tidak ditemukan." };
    }
  } catch { return { error: "Laporan tidak dapat disusun. Muat ulang halaman dan coba lagi." }; }
}
