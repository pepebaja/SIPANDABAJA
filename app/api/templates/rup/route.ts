import ExcelJS from "exceljs";
import { RUP_TEMPLATE_COLUMNS } from "@/lib/import/rup";
export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("RUP");
  ws.addRow([...RUP_TEMPLATE_COLUMNS]); ws.getRow(1).font = { bold: true };
  ws.addRow(["12345678", "Belanja Alat Tulis Kantor", "Barang", "Pengadaan Langsung", 15000000]);
  ws.columns = [{ width: 16 }, { width: 50 }, { width: 24 }, { width: 24 }, { width: 18 }];
  ws.getColumn(5).numFmt = "#,##0.00";
  const h = wb.addWorksheet("Petunjuk");
  [["kode_rup", "Kode/ID RUP dari SIRUP. Kunci pencocokan: kode yang sama akan DIPERBARUI, kode baru akan DITAMBAH."],
   ["nama_paket", "Nama paket (maks. 300 karakter)"],
   ["jenis_pengadaan", "Barang, Pekerjaan Konstruksi, Jasa Konsultansi, atau Jasa Lainnya"],
   ["metode_pemilihan", "Opsional. Nama/kode sesuai master Metode Pemilihan, mis. Pengadaan Langsung"],
   ["pagu", "Angka rupiah, mis. 1500000 atau 1.500.000,00"],
   ["", "Berkas ekspor SIRUP (kolom ID, Paket, Pagu (Rp), Jenis Pengadaan, Metode Pemilihan) juga dapat diunggah langsung tanpa template."],
   ["", "Hapus baris contoh (baris 2) sebelum mengunggah."]].forEach((r) => h.addRow(r));
  h.getColumn(1).width = 20; h.getColumn(2).width = 90;
  return new Response(await wb.xlsx.writeBuffer(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="template-paket-rup.xlsx"' } });
}
