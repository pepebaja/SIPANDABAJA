import { describe, expect, it } from "vitest";
import { parseDateCell } from "@/lib/import/dates";
import { decodeCsv, parseCsv } from "@/lib/import/csv";

describe("parseDateCell", () => {
  it.each([["2026-03-15", "2026-03-15"], ["15/03/2026", "2026-03-15"], ["15-03-2026", "2026-03-15"], ["15.03.2026", "2026-03-15"], ["5/3/2026", "2026-03-05"],
    ["15 Maret 2026", "2026-03-15"], ["15-Mar-26", "2026-03-15"], ["1 Agustus 2026", "2026-08-01"], ["2026-03-15T00:00:00.000Z", "2026-03-15"], [46096, "2026-03-15"], ["46096", "2026-03-15"]])
  ("%s -> %s", (v, out) => expect(parseDateCell(v)).toBe(out));
  it("kosong bukan kesalahan", () => { expect(parseDateCell("")).toBe(""); expect(parseDateCell(undefined)).toBe(""); expect(parseDateCell("  ")).toBe(""); });
  it("menolak tanggal mustahil dan format yang ambigu/asing", () => {
    for (const v of ["31/02/2026", "32/01/2026", "2026-13-01", "03/15/2026", "kemarin", "15 Foo 2026", "12", 5]) expect(parseDateCell(v)).toBeNull();
  });
  it("tahun kabisat", () => { expect(parseDateCell("29/02/2028")).toBe("2028-02-29"); expect(parseDateCell("29/02/2027")).toBeNull(); });
});
describe("parseCsv", () => {
  it("koma, BOM, dan tanda kutip", () => {
    const r = parseCsv('\uFEFFa,b,c\r\n1,"x, y",3\r\n"he said ""hi""",,z\r\n');
    expect(r.map((x) => x.cells.slice(1))).toEqual([["a", "b", "c"], ["1", "x, y", "3"], ['he said "hi"', "", "z"]]);
  });
  it("titik koma (Excel Indonesia) terdeteksi otomatis, angka desimal koma tetap utuh", () => {
    const r = parseCsv("tanggal;nilai\n15/03/2026;1.500.000,50\n");
    expect(r[1]!.cells.slice(1)).toEqual(["15/03/2026", "1.500.000,50"]);
  });
  it("nomor baris sesuai baris file; baris kosong dilewati; sel multi-baris", () => {
    const r = parseCsv('a,b\n\n1,"l1\nl2"\n3,4\n');
    expect(r.map((x) => x.n)).toEqual([1, 3, 5]); expect(r[1]!.cells[2]).toBe("l1\nl2");
  });
  it("decodeCsv: UTF-8 dan cadangan Windows-1252", () => {
    expect(decodeCsv(new TextEncoder().encode("Rp é"))).toBe("Rp é");
    expect(decodeCsv(Uint8Array.from([0x52, 0x70, 0x20, 0xe9]))).toBe("Rp é");
  });
});
