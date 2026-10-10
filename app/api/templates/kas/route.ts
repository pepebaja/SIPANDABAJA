import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { loadCashEntries } from "@/lib/server/cash-data";
import { CASH_TEMPLATE_COLUMNS } from "@/lib/cash-import";

export const dynamic = "force-dynamic";
const LABELS = ["kode_program", "kode_kegiatan", "kode_subkegiatan", "kode_rekening", "kode_sumber_dana", "uraian", "pagu", "tw1", "tw2", "tw3", "tw4"];
/** Template = seluruh rekening anggaran saat ini beserta nilai kas yang sudah ada; isi kolom tw1-tw4 lalu unggah kembali. */
export async function GET() {
  const s = await getSession(); if (!s) return new Response("Sesi berakhir.", { status: 401 });
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return new Response("Versi anggaran belum disiapkan.", { status: 404 });
  const { entries } = await loadCashEntries(await createClient(), ctx.versionId);
  const wb = new ExcelJS.Workbook(); wb.creator = "SIPANDABAJA";
  const ws = wb.addWorksheet("Anggaran Kas");
  ws.addRow([...CASH_TEMPLATE_COLUMNS]);
  const hr = ws.getRow(1); hr.height = 24;
  hr.eachCell((c, i) => { c.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i >= 8 ? "FF0E7490" : "FF0C1A3A" } }; c.alignment = { vertical: "middle", horizontal: "center" }; });
  for (const e of entries) {
    const r = ws.addRow([e.progCode, e.actCode, e.subCode, e.accCode, e.fund, e.desc, Number(e.pagu), ...e.q.map((v) => (v === null ? null : Number(v)))]);
    for (const col of [7, 8, 9, 10, 11]) r.getCell(col).numFmt = "#,##0.00";
    for (const col of [1, 2, 3, 4, 5, 6, 7]) r.getCell(col).font = { color: { argb: "FF475569" }, name: "Arial" };
  }
  LABELS.forEach((_, i) => { ws.getColumn(i + 1).width = [14, 18, 20, 20, 12, 44, 18, 18, 18, 18, 18][i]!; });
  ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
  const help = wb.addWorksheet("Petunjuk");
  [["Petunjuk pengisian Anggaran Kas (per triwulan)"], [""], ["1. Isi HANYA kolom tw1, tw2, tw3, tw4 (Triwulan I-IV). Kolom abu-abu adalah acuan dan dipakai untuk mencocokkan rekening anggaran."],
    ["2. Jangan mengubah kode_subkegiatan, kode_rekening, kode_sumber_dana, dan uraian; kombinasi itulah yang dicocokkan dengan anggaran."],
    ["3. Angka boleh 1500000 atau 1.500.000,00. Kosongkan sel bila tidak ingin mengubah nilai triwulan tersebut. Isi 0 bila nilainya nol."],
    ["4. Hapus baris yang tidak diperlukan atau biarkan kosong; baris tanpa nilai triwulan dilewati."],
    ["5. Alternatif: kolom bulanan jan..des juga dibaca dan otomatis dijumlahkan per triwulan (kolom tw menang bila keduanya terisi)."],
    ["6. Unggah kembali di menu Anggaran Kas > Unggah file. Anda akan melihat pratinjau dan pemeriksaan sebelum nilai diterapkan."]].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 130; help.getRow(1).font = { bold: true, size: 13, name: "Arial" };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="template-anggaran-kas-${ctx.year}.xlsx"`, "Cache-Control": "no-store" } });
}
