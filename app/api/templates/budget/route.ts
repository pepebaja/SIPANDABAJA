import ExcelJS from "exceljs";
import { TEMPLATE_COLUMNS } from "@/lib/import/budget";
export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Anggaran");
  ws.addRow([...TEMPLATE_COLUMNS]); ws.getRow(1).font = { bold: true };
  ws.columns = TEMPLATE_COLUMNS.map(() => ({ width: 24 }));
  const h = wb.addWorksheet("Petunjuk");
  [["kode_subkegiatan", "Kode subkegiatan sesuai master"], ["kode_rekening", "Kode rekening belanja sesuai master"], ["kode_sumber_dana", "Mis. DAU atau DBHCHT"],
   ["uraian", "Uraian belanja"], ["pagu", "Angka rupiah, mis. 1500000 atau 1.500.000,00"], ["nip_pptk", "Opsional; NIP PPTK yang ada di master"],
   ["", "Isi data mulai baris 2 pada sheet Anggaran. Jangan ubah nama kolom."]].forEach((r) => h.addRow(r));
  h.getColumn(1).width = 22; h.getColumn(2).width = 70;
  return new Response(await wb.xlsx.writeBuffer(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="template-anggaran.xlsx"' } });
}
