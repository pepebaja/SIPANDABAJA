import ExcelJS from "exceljs";
import { can } from "@/lib/rbac";
import { TX_TEMPLATE_COLUMNS } from "@/lib/import/transactions";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { fetchAll } from "@/lib/server/fetch-all";
import { createClient } from "@/lib/supabase/server";

/** Cadangan seluruh transaksi realisasi tahun anggaran aktif (semua tahapan) dalam format template unggahan, sehingga dapat diunggah ulang. */
export async function GET() {
  const s = await getSession(), ctx = await getBudgetContext();
  if (!s || !can(s.roles, "realization:write")) return new Response("Forbidden", { status: 403 });
  if (!ctx) return new Response("Konteks anggaran belum tersedia", { status: 404 });
  const sb = await createClient();
  const { data: vs } = await sb.from("budget_versions").select("id, budget_stages(name)").eq("budget_year_id", ctx.yearId);
  const stage = new Map((vs ?? []).map((v: any) => [v.id, v.budget_stages?.name ?? ""])), ids = (vs ?? []).map((v: any) => v.id);
  const rows = ids.length ? await fetchAll<any>((f, t) => sb.from("transactions").select("budget_version_id, transaction_date, amount, notes, payment_date, payment_number, payment_status, procurement_methods(name), rup_packages(rup_code), budget_entries(description, subactivities(code), expenditure_accounts(code), funding_sources(code))").in("budget_version_id", ids).order("transaction_date").order("id").range(f, t)) : [];
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Realisasi");
  ws.addRow([...TX_TEMPLATE_COLUMNS, "tahapan", "status"]); ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
  const d = (v: string | null) => (v ? new Date(v + "T00:00:00Z") : "");
  for (const r of rows) ws.addRow([d(r.transaction_date), r.budget_entries?.subactivities?.code ?? "", r.budget_entries?.expenditure_accounts?.code ?? "", r.budget_entries?.funding_sources?.code ?? "", r.rup_packages?.rup_code ?? "", r.procurement_methods?.name ?? "", d(r.payment_date), r.payment_number ?? "", Number(r.amount), r.notes ?? "", r.budget_entries?.description ?? "", stage.get(r.budget_version_id) ?? "", r.payment_status]);
  ws.columns = [16, 20, 22, 16, 14, 24, 18, 20, 18, 40, 40, 14, 18].map((width) => ({ width }));
  for (const c of [1, 7]) ws.getColumn(c).numFmt = "dd/mm/yyyy"; ws.getColumn(9).numFmt = "#,##0.00";
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="cadangan-realisasi-${ctx.year}.xlsx"`, "Cache-Control": "no-store" } });
}
