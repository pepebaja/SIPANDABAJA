import { describe, expect, it } from "vitest";
import { findTxHeader, parseTxRows, TX_TEMPLATE_COLUMNS, type TxLookup } from "@/lib/import/transactions";
import type { MatrixRow } from "@/lib/import/xlsx";
import type { StageVersion } from "@/lib/stage-rule";

const versions: StageVersion[] = [
  { id: "vm", stageCode: "MURNI", stageName: "Murni", sortOrder: 1, versionNo: 1, effectiveFrom: null },
  { id: "vg", stageCode: "PERGESERAN", stageName: "Pergeseran", sortOrder: 2, versionNo: 1, effectiveFrom: "2026-05-01" },
  { id: "vp", stageCode: "PERUBAHAN", stageName: "Perubahan", sortOrder: 3, versionNo: 1, effectiveFrom: "2026-09-01" }];
const entry = (id: string, v: string, fund = "DAU", desc = "Belanja ATK") => ({ id, versionId: v, sub: "1.01.01", acc: "5.1.02", fund, desc });
const lk = (over: Partial<TxLookup> = {}): TxLookup => ({
  year: 2026, versions, entries: [entry("em", "vm"), entry("eg", "vg"), entry("ep", "vp")],
  rupByVersion: new Map([["vm", new Map([["111", "rup-m"]])], ["vg", new Map([["111", "rup-g"]])], ["vp", new Map()]]),
  pkgByVersion: new Map([["vm", new Map([["PKT-1", { id: "pkg-m", rupId: "rup-m" }]])]]), rupCodeById: new Map([["rup-m", "111"], ["rup-g", "111"]]),
  allocRupByEntry: new Map([["eg", ["111"]]]), ...over });
const head = [...TX_TEMPLATE_COLUMNS];
const mx = (...rows: unknown[][]): MatrixRow[] => [head, ...rows].map((r, i) => ({ n: i + 1, cells: [undefined, ...r] }));
// kolom: tanggal, sub, rek, dana, uraian, rup, paket, jenis, dokjenis, doknomor, doktgl, spmno, spmtgl, sp2dno, sp2dtgl, nilai, catatan
const row = (o: Partial<Record<(typeof TX_TEMPLATE_COLUMNS)[number], unknown>>) => TX_TEMPLATE_COLUMNS.map((c) => o[c] ?? "");
const run = (rows: unknown[][], l = lk()) => { const m = mx(...rows), h = findTxHeader(m); if ("error" in h) throw new Error(h.error); return parseTxRows(m, h.map, l); };
const base = { kode_subkegiatan: "1.01.01", kode_rekening: "5.1.02", nilai: "1.000.000,00", nomor_dokumen: "D-1" };

describe("findTxHeader", () => {
  it("menemukan judul di bawah baris keterangan dan memetakan alias", () => {
    const rows: MatrixRow[] = [{ n: 1, cells: [undefined, "LAPORAN REALISASI"] }, { n: 3, cells: [undefined, "Tgl Transaksi", "Kode Sub Kegiatan", "Kode Rekening", "No SP2D", "Tgl SP2D", "Jumlah"] }];
    const h = findTxHeader(rows); expect("map" in h && h.map.headerRow).toBe(3); expect("map" in h && h.map.cols.nilai).toBe(6);
  });
  it("menolak berkas tanpa kolom wajib", () => expect("error" in findTxHeader([{ n: 1, cells: [undefined, "a", "b"] }])).toBe(true));
});
describe("parseTxRows: tahapan ditentukan oleh tanggal", () => {
  it("belum diajukan: tanggal transaksi menentukan (Murni)", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026" })]); expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ stage_code: "MURNI", entry_id: "em", basis: "transaksi", payment_status: "belum", proses: "non_pengadaan", amount: "1000000.00", kind: "pembayaran" });
  });
  it("transaksi di Murni tetapi SP2D di Pergeseran: mengikuti tanggal SP2D", () => {
    const r = run([row({ ...base, tanggal_transaksi: "20/04/2026", no_spm: "M1", tanggal_spm: "28/04/2026", no_sp2d: "S1", tanggal_sp2d: "05/05/2026" })]);
    expect(r.errors).toEqual([]); expect(r.valid[0]).toMatchObject({ stage_code: "PERGESERAN", entry_id: "eg", basis: "sp2d", ref_date: "2026-05-05", payment_status: "cair" });
  });
  it("SPM saja (belum cair) memakai tanggal SPM", () => {
    const r = run([row({ ...base, tanggal_transaksi: "20/08/2026", no_spm: "M1", tanggal_spm: "02/09/2026" })]);
    expect(r.valid[0]).toMatchObject({ stage_code: "PERUBAHAN", basis: "spm", payment_status: "spm" });
  });
  it("tepat pada tanggal berlaku", () => expect(run([row({ ...base, tanggal_transaksi: "01/05/2026" })]).valid[0]?.stage_code).toBe("PERGESERAN"));
});
describe("parseTxRows: proses pengadaan", () => {
  it("kode RUP ditautkan ke RUP pada tahapan yang tepat", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_rup: "111" })]); expect(r.valid[0]).toMatchObject({ rup_package_id: "rup-m", proses: "pengadaan", rup_code: "111" });
    const g = run([row({ ...base, tanggal_transaksi: "10/06/2026", kode_rup: "111" })]); expect(g.valid[0]).toMatchObject({ rup_package_id: "rup-g" });
  });
  it("kode RUP tidak ada pada tahapan: ditolak dengan nama tahapan", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/10/2026", kode_rup: "111" })]); expect(r.valid).toEqual([]); expect(r.errors[0]).toMatchObject({ field: "kode_rup" }); expect(r.errors[0]!.message).toContain("Perubahan");
  });
  it("kode paket membawa RUP-nya", () => { const r = run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_paket: "PKT-1" })]); expect(r.valid[0]).toMatchObject({ procurement_package_id: "pkg-m", rup_package_id: "rup-m", rup_code: "111", proses: "pengadaan" }); });
  it("kode paket dan kode RUP yang bertentangan ditolak", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_paket: "PKT-1", kode_rup: "999" })]).errors[0]?.field).toBe("kode_rup"));
  it("rekening dialokasikan ke RUP tetapi baris tanpa kode: peringatan, bukan galat", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/06/2026" })]); expect(r.errors).toEqual([]); expect(r.warnings[0]?.message).toContain("111");
  });
});
describe("parseTxRows: pemeriksaan data", () => {
  it("tahun di luar tahun anggaran ditolak", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2027" })]).errors[0]?.message).toContain("2026"));
  it("tanggal tidak terbaca / nilai tidak valid / nomor kosong", () => {
    const r = run([row({ ...base, tanggal_transaksi: "kemarin" }), row({ ...base, tanggal_transaksi: "10/03/2026", nilai: "abc", nomor_dokumen: "D-2" }), row({ ...base, tanggal_transaksi: "10/03/2026", nomor_dokumen: "" })]);
    expect(r.errors.map((e) => `${e.row}:${e.field}`)).toEqual(["2:tanggal_transaksi", "3:nilai", "4:nomor_dokumen"]);
  });
  it("nomor SP2D menjadi nomor dokumen dan jenis dokumen sp2d", () => { const r = run([row({ ...base, nomor_dokumen: "", tanggal_transaksi: "10/03/2026", no_sp2d: "SP2D-9", tanggal_sp2d: "12/03/2026" })]); expect(r.valid[0]).toMatchObject({ doc_number: "SP2D-9", doc_type: "sp2d" }); });
  it("nomor dan tanggal SPM/SP2D harus berpasangan; SP2D tidak boleh mendahului SPM", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026", no_sp2d: "S1" }), row({ ...base, nomor_dokumen: "D-2", tanggal_transaksi: "10/03/2026", tanggal_spm: "11/03/2026" }),
      row({ ...base, nomor_dokumen: "D-3", tanggal_transaksi: "10/03/2026", no_spm: "M", tanggal_spm: "15/03/2026", no_sp2d: "S", tanggal_sp2d: "12/03/2026" })]);
    expect(r.errors.map((e) => `${e.row}:${e.field}`)).toEqual(["2:tanggal_sp2d", "3:no_spm", "4:tanggal_sp2d"]);
  });
  it("koreksi disimpan negatif; jenis tidak dikenal ditolak", () => {
    expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", jenis_transaksi: "koreksi" })]).valid[0]?.amount).toBe("-1000000.00");
    expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", jenis_transaksi: "hapus" })]).errors[0]?.field).toBe("jenis_transaksi");
  });
  it("duplikat dalam file ditolak dan menyebut baris pertama", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026" }), row({ ...base, tanggal_transaksi: "11/03/2026" })]); expect(r.valid).toHaveLength(1); expect(r.errors[0]?.message).toContain("baris 2");
  });
  it("rekening ganda dipilah dengan sumber dana, lalu uraian; bila tetap ambigu ditolak", () => {
    const l = lk({ entries: [entry("a", "vm", "DAU", "Belanja ATK"), entry("b", "vm", "DBHCHT", "Belanja ATK"), entry("c", "vm", "DAU", "Belanja Cetak")] });
    expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_sumber_dana: "dbhcht" })], l).valid[0]?.entry_id).toBe("b");
    expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_sumber_dana: "DAU", uraian: "belanja cetak" })], l).valid[0]?.entry_id).toBe("c");
    expect(run([row({ ...base, tanggal_transaksi: "10/03/2026" })], l).errors[0]?.message).toContain("3 rekening");
  });
  it("rekening tidak ada pada tahapan terkait: pesan menyebut tahapan dan saran", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026" })], lk({ entries: [entry("eg", "vg")] })); expect(r.errors[0]?.message).toContain("Murni"); expect(r.errors[0]?.hint).toContain("Impor anggaran");
  });
  it("baris kosong dan judul berulang dilewati", () => expect(run([row({}), TX_TEMPLATE_COLUMNS.slice()]).skipped).toBe(2));
  it("tanpa tahapan berlaku (Murni diatur lebih akhir): ditolak dengan arahan", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/01/2026" })], lk({ versions: [{ ...versions[0]!, effectiveFrom: "2026-03-01" }] })); expect(r.errors[0]?.field).toBe("tahapan");
  });
});

import ExcelJS from "exceljs";
import { readFirstSheetMatrix } from "@/lib/import/xlsx";
import { parseCsv } from "@/lib/import/csv";
describe("alur berkas sungguhan", () => {
  it("xlsx dengan sel tanggal & angka asli serta judul laporan di atas tabel", async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Data");
    ws.addRow(["LAPORAN REALISASI BELANJA"]); ws.addRow([]);
    ws.addRow(["Tgl Transaksi", "Kode Sub Kegiatan", "Kode Rekening", "Kode RUP", "No SPM", "Tgl SPM", "No SP2D", "Tgl SP2D", "Jumlah"]);
    ws.addRow([new Date("2026-04-20"), "1.01.01", "5.1.02", 111, "M1", new Date("2026-04-28"), "S1", new Date("2026-05-05"), 2500000.5]);
    const buf = await wb.xlsx.writeBuffer(), m = await readFirstSheetMatrix(buf as ArrayBuffer), h = findTxHeader(m);
    if ("error" in h) throw new Error(h.error);
    const r = parseTxRows(m, h.map, lk());
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ stage_code: "PERGESERAN", rup_package_id: "rup-g", amount: "2500000.50", transaction_date: "2026-04-20", sp2d_date: "2026-05-05", doc_number: "S1", doc_type: "sp2d" });
  });
  it("CSV titik koma gaya Excel Indonesia (tanggal dd/mm/yyyy, angka koma desimal)", () => {
    const csv = "tanggal_transaksi;kode_subkegiatan;kode_rekening;nomor_dokumen;nilai\n15/03/2026;1.01.01;5.1.02;K-1;\"1.250.000,75\"\n";
    const m = parseCsv(csv), h = findTxHeader(m); if ("error" in h) throw new Error(h.error);
    const r = parseTxRows(m, h.map, lk()); expect(r.errors).toEqual([]); expect(r.valid[0]).toMatchObject({ amount: "1250000.75", stage_code: "MURNI" });
  });
});
