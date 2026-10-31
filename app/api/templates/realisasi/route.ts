import ExcelJS from "exceljs";
import { TX_TEMPLATE_COLUMNS } from "@/lib/import/transactions";
import { getAuthUserId } from "@/lib/server/session";

const EXAMPLES: (string | number | Date)[][] = [
  [new Date("2026-03-10"), "1.01.01.2.01", "5.1.02.01.01.0024", "DAU", "Belanja alat tulis kantor", "12345678", "", "pembayaran", "bast", "BAST/001/2026", new Date("2026-03-08"), "SPM/001/2026", new Date("2026-03-12"), "SP2D/001/2026", new Date("2026-03-15"), 15000000, "Contoh pengadaan yang sudah cair"],
  [new Date("2026-03-20"), "1.01.01.2.01", "5.1.02.02.01.0001", "", "", "", "", "pembayaran", "kuitansi", "KWT/014/2026", "", "", "", "", "", 2500000, "Contoh non-pengadaan, belum diajukan SPM"],
];
export async function GET(req: Request) {
  if (!(await getAuthUserId())) return new Response("Unauthorized", { status: 401 });
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  if (csv) {
    const q = (v: unknown) => { const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = [TX_TEMPLATE_COLUMNS as readonly string[], ...EXAMPLES].map((r) => r.map(q).join(",")).join("\r\n");
    return new Response("\uFEFF" + body + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="template-realisasi.csv"', "Cache-Control": "no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Realisasi");
  ws.addRow([...TX_TEMPLATE_COLUMNS]); ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
  EXAMPLES.forEach((r) => ws.addRow(r));
  ws.columns = [14, 20, 22, 16, 30, 14, 14, 16, 14, 20, 16, 18, 16, 18, 16, 18, 36].map((width) => ({ width }));
  for (const c of [1, 11, 13, 15]) ws.getColumn(c).numFmt = "dd/mm/yyyy";
  ws.getColumn(16).numFmt = "#,##0.00";
  const h = wb.addWorksheet("Petunjuk");
  [["Kolom", "Isi"],
   ["tanggal_transaksi *", "Tanggal transaksi/dokumen realisasi. Format 15/03/2026, 2026-03-15, atau 15 Maret 2026. Harus pada tahun anggaran yang dipilih."],
   ["kode_subkegiatan *", "Kode subkegiatan sesuai arsip Anggaran (harus sama dengan DPA)."],
   ["kode_rekening *", "Kode rekening belanja sesuai arsip Anggaran."],
   ["kode_sumber_dana", "Diisi bila subkegiatan + rekening yang sama memiliki lebih dari satu sumber dana (mis. DAU, DBHCHT)."],
   ["uraian", "Opsional; membantu memilih rekening bila masih ada lebih dari satu yang cocok."],
   ["kode_rup", "Kode RUP/ID SIRUP. ISI bila belanja termasuk proses pengadaan; KOSONGKAN untuk belanja non-pengadaan. Kode harus ada di arsip RUP tahapan terkait."],
   ["kode_paket", "Opsional: kode paket proses pengadaan (menu Proses pengadaan)."],
   ["jenis_transaksi", "pembayaran (bawaan), koreksi, atau pembatalan. Isi nilai selalu POSITIF; koreksi/pembatalan otomatis mengurangi."],
   ["jenis_dokumen", "kuitansi, bast, invoice, sp2d, atau lainnya."],
   ["nomor_dokumen", "Nomor dokumen. Bila kosong dipakai No SP2D, lalu No SPM. Salah satu nomor WAJIB ada agar unggah ulang tidak mencatat ganda."],
   ["tanggal_dokumen", "Opsional."],
   ["no_spm / tanggal_spm", "Diisi bila SPM sudah diajukan (nomor dan tanggal harus berpasangan)."],
   ["no_sp2d / tanggal_sp2d", "Diisi bila dana sudah dicairkan (nomor dan tanggal harus berpasangan)."],
   ["nilai *", "Angka rupiah, mis. 1500000 atau 1.500.000,00."],
   ["catatan", "Opsional, maks. 500 karakter."],
   ["", ""],
   ["Penentuan tahapan", "Sistem menentukan tahapan anggaran (Murni / Pergeseran / Perubahan) dari TANGGAL ACUAN: tanggal SP2D bila sudah cair; bila belum, tanggal SPM; bila belum diajukan, tanggal transaksi. Tahapan yang berlaku = tahapan dengan tanggal mulai berlaku terakhir yang tidak melewati tanggal acuan (diatur di panel Aturan tahapan anggaran)."],
   ["Proses pengadaan", "Baris dengan kode RUP/paket dicatat sebagai proses pengadaan; tanpa kode dicatat sebagai non-pengadaan."],
   ["Catatan", "Hapus baris contoh sebelum mengunggah. Semua baris masuk sebagai belum diverifikasi sampai admin memverifikasi."]].forEach((r, i) => { const row = h.addRow(r); if (i === 0) row.font = { bold: true }; });
  h.getColumn(1).width = 26; h.getColumn(2).width = 110; h.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  return new Response(await wb.xlsx.writeBuffer(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="template-realisasi.xlsx"', "Cache-Control": "no-store" } });
}
