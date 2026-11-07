import ExcelJS from "exceljs";
import { TX_TEMPLATE_COLUMNS } from "@/lib/import/transactions";
import { getAuthUserId } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

// Contoh baris (hapus sebelum mengunggah). Kolom: tanggal_transaksi, kode_subkegiatan, kode_rekening, kode_sumber_dana, kode_rup, metode_pemilihan, tanggal_spm_sp2d, no_spm_sp2d, nilai, catatan, uraian (opsional)
const EXAMPLES: (string | number | Date)[][] = [
  [new Date("2026-03-10"), "1.01.01.2.01", "5.1.02.01.01.0024", "DAU", "12345678", "E-purchasing", new Date("2026-03-15"), "", 15000000, "Contoh: tanggal SPM/SP2D 15/03/2026 masuk tahapan MURNI; no_spm_sp2d dikosongkan, diisi manual di aplikasi", ""],
  [new Date("2026-06-20"), "1.01.01.2.01", "5.1.02.02.01.0001", "", "", "", new Date("2026-07-02"), "", 2500000, "Contoh: tanggal SPM/SP2D 02/07/2026 masuk tahapan PERGESERAN (16 Mar - 26 Okt)", ""],
  [new Date("2026-11-05"), "1.01.01.2.01", "5.1.02.02.01.0001", "", "", "", new Date("2026-11-10"), "", 1000000, "Contoh: tanggal SPM/SP2D 10/11/2026 masuk tahapan PERUBAHAN (27 Okt - 31 Des)", ""],
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
  ws.columns = [16, 20, 22, 16, 14, 24, 18, 20, 18, 44, 36].map((width) => ({ width }));
  for (const c of [1, 7]) ws.getColumn(c).numFmt = "dd/mm/yyyy";
  ws.getColumn(9).numFmt = "#,##0.00";
  for (let r = 2; r <= 500; r++) ws.getCell(r, 6).dataValidation = { type: "list", allowBlank: true, formulae: [`"${methods.join(",")}"`], showErrorMessage: false };   // pilihan metode (boleh diketik bebas)
  const h = wb.addWorksheet("Petunjuk");
  [["Kolom", "Isi"],
   ["tanggal_transaksi *", "Tanggal transaksi realisasi. Format 15/03/2026, 2026-03-15, atau 15 Maret 2026. Harus pada tahun anggaran yang dipilih."],
   ["kode_subkegiatan *", "Kode subkegiatan sesuai arsip Anggaran (harus sama dengan DPA)."],
   ["kode_rekening *", "Kode rekening belanja sesuai arsip Anggaran."],
   ["kode_sumber_dana", "Diisi bila subkegiatan + rekening yang sama memiliki lebih dari satu sumber dana (mis. DAU, DBHCHT). Bila masih ada beberapa baris anggaran, lengkapi kolom uraian di kolom paling kanan."],
   ["kode_rup", "Kode RUP/ID SIRUP. OPSIONAL, boleh dikosongkan dan diisi menyusul. Bila belanja termasuk proses pengadaan, isi kodenya sekarang atau lengkapi kemudian di aplikasi (Input Realisasi > Daftar transaksi > \"Isi No SPM/SP2D / RUP\"). Kosongkan untuk belanja non-pengadaan. Kode harus ada di arsip RUP tahapan terkait."],
   ["metode_pemilihan", `Opsional. Pilihan: ${methods.join(", ")}. Bila kosong dan kode_rup diisi, dipakai metode rencana pada RUP. Singkatan "PL" tidak diterima (ambigu), tulis lengkap.`],
   ["tanggal_spm_sp2d", "Tanggal SPM atau SP2D (pilih satu yang Anda pegang; isi SP2D bila sudah cair). INI TANGGAL UTAMA penentu tahapan anggaran: sebelum 16 Maret 2026 = MURNI; 16 Maret s.d. 26 Oktober 2026 = PERGESERAN; 27 Oktober s.d. 31 Desember 2026 = PERUBAHAN. Boleh dikosongkan bila belum diajukan (tahapan sementara mengikuti tanggal_transaksi), lalu dilengkapi di aplikasi."],
   ["no_spm_sp2d", "OPSIONAL, boleh dikosongkan. Nomor SPM atau SP2D dapat DIISI MANUAL kapan saja di aplikasi: menu Input Realisasi > Daftar transaksi > tombol \"Isi No SPM/SP2D\" pada baris transaksi. Bisa juga diperbarui dengan mengunggah ulang baris yang sama (tanggal transaksi, rekening, kode RUP, dan nilai harus sama)."],
   ["nilai *", "Angka rupiah, mis. 1500000 atau 1.500.000,00. Isi MINUS (-) untuk koreksi/pengurangan realisasi."],
   ["catatan", "Opsional, maks. 500 karakter."],
   ["uraian", "Opsional. Isi bila satu subkegiatan + rekening (+ sumber dana) punya lebih dari satu baris anggaran; tulis uraian persis seperti di anggaran agar sistem tahu baris mana yang dimaksud."],
   ["", ""],
   ["Penentuan tahapan", "Tahapan anggaran (Murni / Pergeseran / Perubahan) ditentukan dari tanggal SPM/SP2D; bila kosong, dari tanggal transaksi. Aturan bawaan 2026: sebelum 16 Maret = Murni; 16 Maret s.d. 26 Oktober = Pergeseran; 27 Oktober s.d. 31 Desember = Perubahan (dapat diatur admin di panel Aturan tahapan anggaran)."],
   ["Proses pengadaan", "Baris dengan kode RUP atau metode pemilihan dicatat sebagai proses pengadaan; selain itu non-pengadaan."],
   ["Unggah ulang", "Baris yang sudah tercatat dikenali otomatis (tidak dicatat ganda). Bila nomor/tanggal SPM-SP2D atau metode pada file lebih lengkap, transaksi DIPERBARUI."],
   ["Catatan", "Baris jumlah/total di bagian bawah (tanpa tanggal, subkegiatan, rekening) dilewati otomatis. Hapus baris contoh sebelum mengunggah. Semua baris langsung berlaku (tanpa verifikasi) dan dapat diubah/dihapus di aplikasi."]].forEach((r, i) => { const row = h.addRow(r); if (i === 0) row.font = { bold: true }; });
  h.getColumn(1).width = 26; h.getColumn(2).width = 110; h.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  return new Response(await wb.xlsx.writeBuffer(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="template-realisasi.xlsx"', "Cache-Control": "no-store" } });
}
