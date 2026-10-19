import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFirstSheetMatrix } from "@/lib/import/xlsx";
import { diffRup, findHeader, mapProcurementType, matchMethod, parseRupRows, type ExistingRup } from "@/lib/import/rup";
import { can } from "@/lib/rbac";

const METHODS = [{ id: "m-pl", code: "PL", name: "Pengadaan Langsung" }, { id: "m-t", code: "TD", name: "Tender" }, { id: "m-tc", code: "TC", name: "Tender Cepat" }];
async function sheet(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("x"); rows.forEach((r) => ws.addRow(r));
  return readFirstSheetMatrix((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
const run = async (rows: unknown[][]) => { const m = await sheet(rows), h = findHeader(m); if ("error" in h) throw new Error(h.error); return parseRupRows(m, h.map, METHODS); };

describe("jenis pengadaan & metode", () => {
  it.each([["Barang", "barang"], ["Pekerjaan Konstruksi", "konstruksi"], ["Jasa Konsultansi", "konsultansi"], ["Jasa Konsultansi Konstruksi", "konsultansi"], ["Jasa Lainnya,", "jasa_lainnya"], ["jasa_lainnya", "jasa_lainnya"]])("%s", (i, o) => expect(mapProcurementType(i)).toBe(o));
  it.each(["", "Lainnya", "Barang, Jasa Lainnya"])("menolak %j", (i) => expect(mapProcurementType(i)).toBeNull());
  it("metode SIRUP dengan bulan pemilihan", () => { expect(matchMethod("Pengadaan Langsung January 2025", METHODS)).toBe("m-pl"); expect(matchMethod("Tender Cepat Maret 2026", METHODS)).toBe("m-tc"); expect(matchMethod("tender", METHODS)).toBe("m-t"); expect(matchMethod("Seleksi", METHODS)).toBeNull(); });
});

describe("berkas ekspor SIRUP", () => {
  it("melewati judul di atas tabel dan membaca kolom ID/Paket/Pagu (Rp)", async () => {
    const r = await run([["RUP - Cari Paket Penyedia"], ["Data dipopulasi otomatis oleh SiRUP"], [],
      ["No", "Paket", "Pagu (Rp)", "Jenis Pengadaan", "Metode Pemilihan", "Satuan Kerja", "Lokasi", "ID"],
      [1, "Pengadaan Jasa Pengangkutan Sampah", "24,240,000", "Jasa Lainnya", "Pengadaan Langsung January 2025", "Dinas", "Bogor", 58660606],
      [2, "Perpanjangan STNK", 4810000, "Barang", "", "Dinas", "Bogor", "54430885"]]);
    expect(r.errors).toEqual([]);
    expect(r.valid).toEqual([
      { rup_code: "58660606", name: "Pengadaan Jasa Pengangkutan Sampah", procurement_type: "jasa_lainnya", planned_method_id: "m-pl", pagu: "24240000.00" },
      { rup_code: "54430885", name: "Perpanjangan STNK", procurement_type: "barang", planned_method_id: null, pagu: "4810000.00" }]);
    expect(r.rowOf.get("58660606")).toBe(5);                               // nomor baris asli di Excel
  });
  it("melaporkan kolom wajib yang hilang", async () => {
    const m = await sheet([["kode_rup", "nama_paket", "pagu"], ["1", "A", 1]]);
    expect(findHeader(m)).toMatchObject({ error: expect.stringContaining("Jenis Pengadaan") });
    expect(findHeader(await sheet([["foo", "bar"], [1, 2]]))).toHaveProperty("error");
  });
});

describe("validasi baris", () => {
  it("template sendiri: baris kosong dilewati, kesalahan dilaporkan per baris", async () => {
    const r = await run([["kode_rup", "nama_paket", "jenis_pengadaan", "metode_pemilihan", "pagu"],
      ["R1", "Paket A", "Barang", "Tender", "1.500.000,00"],
      ["", "", "", "", ""],
      ["", "Tanpa kode", "Barang", "", 100],
      ["R3", "Jenis salah", "Foo", "", 100],
      ["R4", "Pagu salah", "Barang", "", "abc"],
      ["R5", "Pagu minus", "Barang", "", -5],
      ["R1", "Kode dobel", "Barang", "", 100],
      ["R6", "Metode asing", "Barang", "Seleksi", 7]]);
    expect(r.valid.map((v) => v.rup_code)).toEqual(["R1", "R6"]);
    expect(r.skipped).toBe(1);
    expect(r.errors.map((e) => [e.row, e.field])).toEqual([[4, "kode_rup"], [5, "jenis_pengadaan"], [6, "pagu"], [7, "pagu"], [8, "kode_rup"]]);
    expect(r.warnings).toHaveLength(1);                                    // metode asing: peringatan, bukan galat
    expect(r.valid[0]!.pagu).toBe("1500000.00");
  });
});

describe("diff terhadap database", () => {
  const ex = (o: Partial<ExistingRup> & { id: string; rup_code: string }): ExistingRup => ({ name: "N", procurement_type: "barang", planned_method_id: null, pagu: "100.00", ...o });
  it("baru / ubah / sama / tidak ada di file, dan penanda pagu di bawah alokasi", () => {
    const valid = [
      { rup_code: "A", name: "N", procurement_type: "barang" as const, planned_method_id: null, pagu: "100.00" },        // sama
      { rup_code: "B", name: "N2", procurement_type: "barang" as const, planned_method_id: null, pagu: "50.00" },        // nama + pagu berubah
      { rup_code: "C", name: "Baru", procurement_type: "konstruksi" as const, planned_method_id: "m-t", pagu: "9.00" }];
    const rowOf = new Map([["A", 2], ["B", 3], ["C", 4]]);
    const d = diffRup(valid, rowOf, [ex({ id: "1", rup_code: "A" }), ex({ id: "2", rup_code: "B" }), ex({ id: "3", rup_code: "Z", name: "Dihapus di SIRUP" })],
      new Map([["2", "80.00"]]), new Map([["3", 2]]), new Map([["3", 1]]));
    expect([d.added, d.changed, d.unchanged]).toEqual([1, 1, 1]);
    expect(d.rows.find((x) => x.code === "B")).toMatchObject({ action: "ubah", changes: ["nama", "pagu"], overAlloc: true });
    expect(d.missing).toEqual([{ code: "Z", name: "Dihapus di SIRUP", pagu: "100.00", allocations: 2, linkedPackages: 1 }]);
  });
});

describe("hak akses", () => {
  it("hanya Super Admin, Admin OPD, PPBJ yang boleh mengubah RUP", () => {
    expect(can(["ppbj"], "rup:write")).toBe(true); expect(can(["admin_opd"], "rup:write")).toBe(true);
    for (const r of ["ppk", "pptk", "viewer", "auditor"] as const) expect(can([r], "rup:write")).toBe(false);
  });
});
