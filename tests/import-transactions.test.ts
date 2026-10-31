import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { findTxHeader, matchMethod, parseTxRows, TX_TEMPLATE_COLUMNS, type TxLookup, type TxMethod } from "@/lib/import/transactions";
import { readFirstSheetMatrix, type MatrixRow } from "@/lib/import/xlsx";
import { parseCsv } from "@/lib/import/csv";
import type { StageVersion } from "@/lib/stage-rule";

const versions: StageVersion[] = [
  { id: "vm", stageCode: "MURNI", stageName: "Murni", sortOrder: 1, versionNo: 1, effectiveFrom: null },
  { id: "vg", stageCode: "PERGESERAN", stageName: "Pergeseran", sortOrder: 2, versionNo: 1, effectiveFrom: "2026-05-01" },
  { id: "vp", stageCode: "PERUBAHAN", stageName: "Perubahan", sortOrder: 3, versionNo: 1, effectiveFrom: "2026-09-01" }];
const methods: TxMethod[] = [{ id: "m-ep", code: "EPURCHASING", name: "E-purchasing" }, { id: "m-pl", code: "PL", name: "Pengadaan Langsung" }, { id: "m-pn", code: "PENUNJUKAN", name: "Penunjukan Langsung" },
  { id: "m-tc", code: "TENDER_CEPAT", name: "Tender Cepat" }, { id: "m-t", code: "TENDER", name: "Tender" }, { id: "m-s", code: "SELEKSI", name: "Seleksi" }, { id: "m-sw", code: "SWAKELOLA", name: "Swakelola" }];
const entry = (id: string, v: string, fund = "DAU", desc = "Belanja ATK") => ({ id, versionId: v, sub: "1.01.01", acc: "5.1.02", fund, desc, subId: "sub1", accId: "acc1", fundId: `f-${fund}` });
const lk = (over: Partial<TxLookup> = {}): TxLookup => ({
  year: 2026, versions, methods, entries: [entry("em", "vm"), entry("eg", "vg"), entry("ep", "vp")],
  rupByVersion: new Map([["vm", new Map([["111", { id: "rup-m", methodId: "m-pl" }]])], ["vg", new Map([["111", { id: "rup-g", methodId: null }]])], ["vp", new Map()]]),
  allocRupByEntry: new Map([["eg", ["111"]]]), ...over });
const head = [...TX_TEMPLATE_COLUMNS];
const mx = (...rows: unknown[][]): MatrixRow[] => [head, ...rows].map((r, i) => ({ n: i + 1, cells: [undefined, ...r] }));
const row = (o: Partial<Record<(typeof TX_TEMPLATE_COLUMNS)[number], unknown>>) => TX_TEMPLATE_COLUMNS.map((c) => o[c] ?? "");
const run = (rows: unknown[][], l = lk()) => { const m = mx(...rows), h = findTxHeader(m); if ("error" in h) throw new Error(h.error); return parseTxRows(m, h.map, l); };
const base = { kode_subkegiatan: "1.01.01", kode_rekening: "5.1.02", nilai: "1.000.000,00" };

describe("template: kolom disederhanakan", () => {
  it("10 kolom; kolom lama (jenis, dokumen, kode paket, SPM & SP2D terpisah) tidak ada", () => {
    expect(head).toEqual(["tanggal_transaksi", "kode_subkegiatan", "kode_rekening", "kode_sumber_dana", "kode_rup", "metode_pemilihan", "tanggal_spm_sp2d", "no_spm_sp2d", "nilai", "catatan"]);
    for (const k of ["jenis_transaksi", "jenis_dokumen", "nomor_dokumen", "tanggal_dokumen", "kode_paket", "no_spm", "no_sp2d"]) expect(head).not.toContain(k);
  });
});
describe("findTxHeader", () => {
  it("menemukan judul di bawah baris keterangan dan memetakan alias", () => {
    const rows: MatrixRow[] = [{ n: 1, cells: [undefined, "LAPORAN"] }, { n: 3, cells: [undefined, "Tgl Transaksi", "Kode Sub Kegiatan", "Kode Rekening", "Metode", "No SPM/SP2D", "Tgl SPM/SP2D", "Jumlah"] }];
    const h = findTxHeader(rows); expect("map" in h && h.map.headerRow).toBe(3);
    expect("map" in h && [h.map.cols.metode, h.map.cols.payno, h.map.cols.paytgl, h.map.cols.nilai]).toEqual([4, 5, 6, 7]);
  });
  it("menolak berkas tanpa kolom wajib", () => expect("error" in findTxHeader([{ n: 1, cells: [undefined, "a", "b"] }])).toBe(true));
});
describe("matchMethod: metode pemilihan menurut Perpres 16/2018 jo. 12/2021 jo. 46/2025", () => {
  it.each([["E-purchasing", "m-ep"], ["e purchasing", "m-ep"], ["EPURCHASING", "m-ep"], ["e-katalog", "m-ep"], ["Pengadaan Langsung", "m-pl"], ["penunjukan langsung", "m-pn"], ["Tender Cepat", "m-tc"], ["tender", "m-t"], ["Seleksi", "m-s"], ["Swakelola", "m-sw"]])
  ("%s -> %s", (v, id) => expect(matchMethod(v, methods)?.id).toBe(id));
  it("singkatan PL ambigu ditolak; yang tidak dikenal null", () => { expect(matchMethod("PL", methods)).toBeNull(); expect(matchMethod("lelang", methods)).toBeNull(); expect(matchMethod("", methods)).toBeNull(); });
});
describe("parseTxRows: tahapan ditentukan oleh tanggal SPM/SP2D (atau tanggal transaksi)", () => {
  it("belum ada SPM/SP2D: tanggal transaksi menentukan (Murni), non-pengadaan", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026" })]); expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ stage_code: "MURNI", entry_id: "em", basis: "transaksi", payment_status: "belum", proses: "non_pengadaan", amount: "1000000.00", payment_date: null, payment_number: null, method_id: null });
  });
  it("transaksi di Murni tetapi tanggal SPM/SP2D di Pergeseran: mengikuti tanggal SPM/SP2D", () => {
    const r = run([row({ ...base, tanggal_transaksi: "20/04/2026", tanggal_spm_sp2d: "05/05/2026", no_spm_sp2d: "SP2D/1" })]);
    expect(r.errors).toEqual([]); expect(r.valid[0]).toMatchObject({ stage_code: "PERGESERAN", entry_id: "eg", basis: "spm_sp2d", ref_date: "2026-05-05", payment_status: "sudah", payment_number: "SP2D/1" });
  });
  it("tepat pada tanggal berlaku sudah masuk tahapan baru", () => { expect(run([row({ ...base, tanggal_transaksi: "01/05/2026" })]).valid[0]?.stage_code).toBe("PERGESERAN"); expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", tanggal_spm_sp2d: "01/09/2026" })]).valid[0]?.stage_code).toBe("PERUBAHAN"); });
  it("nomor tanpa tanggal: boleh (dilengkapi kemudian), peringatan, tahapan mengikuti tanggal transaksi", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026", no_spm_sp2d: "SPM/9" })]); expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ stage_code: "MURNI", payment_number: "SPM/9", payment_date: null }); expect(r.warnings[0]?.message).toContain("tanpa tanggal");
  });
  it("tanggal tanpa nomor: boleh (nomor menyusul)", () => { const r = run([row({ ...base, tanggal_transaksi: "10/03/2026", tanggal_spm_sp2d: "12/03/2026" })]); expect(r.errors).toEqual([]); expect(r.valid[0]).toMatchObject({ payment_date: "2026-03-12", payment_number: null }); });
  it("tanggal SPM/SP2D di luar tahun anggaran atau tidak terbaca ditolak", () => {
    expect(run([row({ ...base, tanggal_transaksi: "10/12/2026", tanggal_spm_sp2d: "05/01/2027" })]).errors[0]?.field).toBe("tanggal_spm_sp2d");
    expect(run([row({ ...base, tanggal_transaksi: "10/12/2026", tanggal_spm_sp2d: "besok" })]).errors[0]?.field).toBe("tanggal_spm_sp2d");
  });
});
describe("parseTxRows: pengadaan, RUP, dan metode pemilihan", () => {
  it("kode RUP ditautkan ke RUP pada tahapan yang tepat dan metode mengikuti rencana RUP", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_rup: "111" })]);
    expect(r.valid[0]).toMatchObject({ rup_package_id: "rup-m", proses: "pengadaan", rup_code: "111", method_id: "m-pl", method_name: "Pengadaan Langsung" });
    expect(run([row({ ...base, tanggal_transaksi: "10/06/2026", kode_rup: "111" })]).valid[0]).toMatchObject({ rup_package_id: "rup-g", method_id: null });
  });
  it("metode pada baris mengalahkan metode rencana RUP", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_rup: "111", metode_pemilihan: "E-purchasing" })]).valid[0]?.method_id).toBe("m-ep"));
  it("metode tanpa kode RUP tetap dihitung proses pengadaan", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", metode_pemilihan: "Tender" })]).valid[0]).toMatchObject({ proses: "pengadaan", rup_package_id: null, method_id: "m-t" }));
  it("metode tidak dikenal ditolak dengan daftar pilihan", () => { const e = run([row({ ...base, tanggal_transaksi: "10/03/2026", metode_pemilihan: "Lelang" })]).errors[0]; expect(e).toMatchObject({ field: "metode_pemilihan" }); expect(e!.hint).toContain("Penunjukan Langsung"); });
  it("kode RUP tidak ada pada tahapan: ditolak dengan nama tahapan", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/10/2026", kode_rup: "111" })]); expect(r.valid).toEqual([]); expect(r.errors[0]).toMatchObject({ field: "kode_rup" }); expect(r.errors[0]!.message).toContain("Perubahan");
  });
  it("rekening dialokasikan ke RUP tetapi baris tanpa kode: peringatan, bukan galat", () => { const r = run([row({ ...base, tanggal_transaksi: "10/06/2026" })]); expect(r.errors).toEqual([]); expect(r.warnings[0]?.message).toContain("111"); });
});
describe("parseTxRows: pemeriksaan data", () => {
  it("tahun di luar tahun anggaran ditolak", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2027" })]).errors[0]?.message).toContain("2026"));
  it("tanggal tidak terbaca / nilai tidak valid / nilai nol", () => {
    const r = run([row({ ...base, tanggal_transaksi: "kemarin" }), row({ ...base, tanggal_transaksi: "10/03/2026", nilai: "abc" }), row({ ...base, tanggal_transaksi: "10/03/2026", nilai: "0" })]);
    expect(r.errors.map((e) => `${e.row}:${e.field}`)).toEqual(["2:tanggal_transaksi", "3:nilai", "4:nilai"]);
  });
  it("nilai minus dicatat sebagai koreksi (tetap minus)", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", nilai: "-250.000" })]).valid[0]?.amount).toBe("-250000.00"));
  it("nomor dokumen tidak lagi wajib", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2026" })]).errors).toEqual([]));
  it("baris identik dalam satu file ditolak; dengan nomor SPM/SP2D berbeda dianggap dua transaksi", () => {
    const same = run([row({ ...base, tanggal_transaksi: "10/03/2026" }), row({ ...base, tanggal_transaksi: "10/03/2026" })]); expect(same.valid).toHaveLength(1); expect(same.errors[0]?.message).toContain("baris 2");
    const two = run([row({ ...base, tanggal_transaksi: "10/03/2026", no_spm_sp2d: "A" }), row({ ...base, tanggal_transaksi: "10/03/2026", no_spm_sp2d: "B" })]); expect(two.errors).toEqual([]); expect(two.valid).toHaveLength(2);
  });
  it("rekening ganda dipilah dengan sumber dana; bila tetap ambigu ditolak", () => {
    const l = lk({ entries: [entry("a", "vm", "DAU", "Belanja ATK"), entry("b", "vm", "DBHCHT", "Belanja ATK")] });
    expect(run([row({ ...base, tanggal_transaksi: "10/03/2026", kode_sumber_dana: "dbhcht" })], l).valid[0]).toMatchObject({ entry_id: "b", fund_id: "f-DBHCHT" });
    expect(run([row({ ...base, tanggal_transaksi: "10/03/2026" })], l).errors[0]?.message).toContain("2 rekening");
  });
  it("rekening tidak ada pada tahapan terkait: pesan menyebut tahapan dan saran", () => {
    const r = run([row({ ...base, tanggal_transaksi: "10/03/2026" })], lk({ entries: [entry("eg", "vg")] })); expect(r.errors[0]?.message).toContain("Murni"); expect(r.errors[0]?.hint).toContain("Impor anggaran");
  });
  it("baris kosong dan judul berulang dilewati", () => expect(run([row({}), TX_TEMPLATE_COLUMNS.slice()]).skipped).toBe(2));
  it("tanpa tahapan berlaku: ditolak dengan arahan", () => expect(run([row({ ...base, tanggal_transaksi: "10/01/2026" })], lk({ versions: [{ ...versions[0]!, effectiveFrom: "2026-03-01" }] })).errors[0]?.field).toBe("tahapan"));
  it("identitas rekening (subkegiatan/akun/sumber dana) dibawa untuk pengenalan baris di database", () => expect(run([row({ ...base, tanggal_transaksi: "10/03/2026" })]).valid[0]).toMatchObject({ sub_id: "sub1", acc_id: "acc1", fund_id: "f-DAU" }));
});
describe("kompatibilitas file format lama", () => {
  const old = (cells: unknown[]): MatrixRow[] => [{ n: 1, cells: [undefined, "tanggal_transaksi", "kode_subkegiatan", "kode_rekening", "kode_paket", "jenis_transaksi", "jenis_dokumen", "nomor_dokumen", "no_spm", "tanggal_spm", "no_sp2d", "tanggal_sp2d", "nilai"] }, { n: 2, cells: [undefined, ...cells] }];
  const go = (rows: MatrixRow[]) => { const h = findTxHeader(rows); if ("error" in h) throw new Error(h.error); return parseTxRows(rows, h.map, lk()); };
  it("kolom yang dihapus diabaikan dengan peringatan; SP2D diutamakan atas SPM", () => {
    const r = go(old(["10/03/2026", "1.01.01", "5.1.02", "PKT-1", "pembayaran", "bast", "BAST/1", "SPM/1", "01/05/2026", "SP2D/1", "05/05/2026", "1000000"]));
    expect(r.errors).toEqual([]); expect(r.valid[0]).toMatchObject({ payment_date: "2026-05-05", payment_number: "SP2D/1", stage_code: "PERGESERAN" });
    expect(r.warnings.filter((w) => w.row === 0).map((w) => w.message).join(" ")).toContain("kode_paket");
  });
  it("jenis koreksi/pembatalan dengan nilai positif tetap menjadi nilai minus (tidak diam-diam menambah realisasi)", () => {
    expect(go(old(["10/03/2026", "1.01.01", "5.1.02", "", "koreksi", "", "", "", "", "", "", "100000"])).valid[0]?.amount).toBe("-100000.00");
    expect(go(old(["10/03/2026", "1.01.01", "5.1.02", "", "pembatalan", "", "", "", "", "", "", "-100000"])).valid[0]?.amount).toBe("-100000.00");
  });
});
describe("alur berkas sungguhan", () => {
  it("xlsx dengan sel tanggal & angka asli serta judul laporan di atas tabel", async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Data");
    ws.addRow(["LAPORAN REALISASI BELANJA"]); ws.addRow([]);
    ws.addRow(["Tgl Transaksi", "Kode Sub Kegiatan", "Kode Rekening", "Kode RUP", "Metode Pemilihan", "Tanggal SPM/SP2D", "No SPM/SP2D", "Jumlah"]);
    ws.addRow([new Date("2026-04-20"), "1.01.01", "5.1.02", 111, "E-purchasing", new Date("2026-05-05"), "S1", 2500000.5]);
    const buf = await wb.xlsx.writeBuffer(), m = await readFirstSheetMatrix(buf as ArrayBuffer), h = findTxHeader(m);
    if ("error" in h) throw new Error(h.error);
    const r = parseTxRows(m, h.map, lk());
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ stage_code: "PERGESERAN", rup_package_id: "rup-g", method_id: "m-ep", amount: "2500000.50", transaction_date: "2026-04-20", payment_date: "2026-05-05", payment_number: "S1" });
  });
  it("CSV titik koma gaya Excel Indonesia (tanggal dd/mm/yyyy, angka koma desimal)", () => {
    const csv = "tanggal_transaksi;kode_subkegiatan;kode_rekening;nilai\n15/03/2026;1.01.01;5.1.02;\"1.250.000,75\"\n";
    const m = parseCsv(csv), h = findTxHeader(m); if ("error" in h) throw new Error(h.error);
    const r = parseTxRows(m, h.map, lk()); expect(r.errors).toEqual([]); expect(r.valid[0]).toMatchObject({ amount: "1250000.75", stage_code: "MURNI" });
  });
});
