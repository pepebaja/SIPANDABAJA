import ExcelJS from "exceljs";
import { TX_TEMPLATE_COLUMNS } from "@/lib/import/transactions";
import { getAuthUserId } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

// Contoh baris (hapus sebelum mengunggah). Kolom: tanggal_transaksi, kode_subkegiatan, kode_rekening, kode_sumber_dana, kode_rup, metode_pemilihan, tanggal_spm_sp2d, no_spm_sp2d, nilai, catatan
const EXAMPLES: (string | number | Date)[][] = [
  [new Date("2026-03-10"), "1.01.01.2.01", "5.1.02.01.01.0024", "DAU", "12345678", "E-purchasing", new Date("2026-03-15"), "SP2D/001/2026", 15000000, "Contoh pengadaan yang sudah SP2D"],
  [new Date("2026-03-20"), "1.01.01.2.01", "5.1.02.02.01.0001", "", "", "", "", "", 2500000, "Contoh non-pengadaan, belum SPM (nomor dapat dilengkapi dengan unggah ulang)"],
];
// Daftar bawaan bila master tidak terbaca. Sumber: Perpres 16/2018 jo. 12/2021 jo. 46/2025.
const DEFAULT_METHODS = ["E-purchasing", "Pengadaan Langsung", "Penunjukan Langsung", "Tender Cepat", "Tender", "Seleksi", "Swakelola"];
export async function GET(req: Request) {
  if (!(await getAuthUserId())) return new Response("Unauthorized", { status: 401 });
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  if (csv) {
    const q = (v: unknown) => { const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = [TX_TEMPLATE_COLUMNS as readonly string[], ...EXAMPLES].map((r) => r.map(q).join(",")).join("\r\n");
    return new Response("\uFEFF" + body + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="template-realisasi.csv"', "Cache-Control": "no-store" } });
  }
  const { data } = await (await createClient()).from("procurement_methods").select("name").eq("is_active", true).order("name");
  const methods = data?.length ? data.map((m) => m.name as string) : DEFAULT_METHODS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Realisasi");
  ws.addRow([...TX_TEMPLATE_COLUMNS]); ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
  EXAMPLES.forEach((r) => ws.addRow(r));
  ws.columns = [16, 20, 22, 16, 14, 24, 18, 20, 18, 44].map((width) => ({ width }));
  for (const c of [1, 7]) ws.getColumn(c).numFmt = "dd/mm/yyyy";
  ws.getColumn(9).numFmt = "#,##0.00";
  for (let r = 2; r <= 500; r++) ws.getCell(r, 6).dataValidation = { type: "list", allowBlank: true, formulae: [`"${methods.join(",")}"`], showErrorMessage: false };   // pilihan metode (boleh diketik bebas)
  const h = wb.addWorksheet("Petunjuk");
  [["Kolom", "Isi"],
   ["tanggal_transaksi *", "Tanggal transaksi realisasi. Format 15/03/2026, 2026-03-15, atau 15 Maret 2026. Harus pada tahun anggaran yang dipilih."],
   ["kode_subkegiatan *", "Kode subkegiatan sesuai arsip Anggaran (harus sama dengan DPA)."],
   ["kode_rekening *", "Kode rekening belanja sesuai arsip Anggaran."],
   ["kode_sumber_dana", "Diisi bila subkegiatan + rekening yang sama memiliki lebih dari satu sumber dana (mis. DAU, DBHCHT)."],
   ["kode_rup", "Kode RUP/ID SIRUP. ISI bila belanja termasuk proses pengadaan; KOSONGKAN untuk belanja non-pengadaan. Kode harus ada di arsip RUP tahapan terkait."],
   ["metode_pemilihan", `Opsional. Pilihan: ${methods.join(", ")}. Bila kosong dan kode_rup diisi, dipakai metode rencana pada RUP. Singkatan "PL" tidak diterima (ambigu), tulis lengkap.`],
   ["tanggal_spm_sp2d", "Tanggal SPM atau SP2D (pilih satu yang Anda pegang; isi SP2D bila sudah cair). INI TANGGAL UTAMA penentu tahapan anggaran. Boleh dikosongkan bila belum diajukan, lalu dilengkapi dengan unggah ulang."],
   ["no_spm_sp2d", "Nomor SPM atau SP2D. Boleh kosong dahulu; dapat diperbarui kapan saja dengan mengunggah ulang baris yang sama (tanggal transaksi, rekening, kode RUP, dan nilai harus sama)."],
   ["nilai *", "Angka rupiah, mis. 1500000 atau 1.500.000,00. Isi MINUS (-) untuk koreksi/pengurangan realisasi."],
   ["catatan", "Opsional, maks. 500 karakter."],
   ["", ""],
   ["Penentuan tahapan", "Tahapan anggaran (Murni / Pergeseran / Perubahan) ditentukan dari tanggal SPM/SP2D; bila kosong, dari tanggal transaksi. Tahapan yang berlaku = tahapan dengan tanggal mulai berlaku terakhir yang tidak melewati tanggal itu (diatur di panel Aturan tahapan anggaran)."],
   ["Proses pengadaan", "Baris dengan kode RUP atau metode pemilihan dicatat sebagai proses pengadaan; selain itu non-pengadaan."],
   ["Unggah ulang", "Baris yang sudah tercatat dikenali otomatis (tidak dicatat ganda). Bila nomor/tanggal SPM-SP2D atau metode pada file lebih lengkap, transaksi DIPERBARUI. Transaksi yang sudah terverifikasi hanya dapat dilengkapi bagian yang masih kosong."],
   ["Catatan", "Hapus baris contoh sebelum mengunggah. Semua baris baru masuk sebagai belum diverifikasi sampai admin memverifikasi."]].forEach((r, i) => { const row = h.addRow(r); if (i === 0) row.font = { bold: true }; });
  h.getColumn(1).width = 26; h.getColumn(2).width = 110; h.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  return new Response(await wb.xlsx.writeBuffer(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="template-realisasi.xlsx"', "Cache-Control": "no-store" } });
}
