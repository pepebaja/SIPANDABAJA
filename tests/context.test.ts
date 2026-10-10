import { describe, expect, it } from "vitest";
import { decodeContext, encodeContext, pickYear } from "@/lib/context";
const Y = [{ id: "a", year: 2025 }, { id: "b", year: 2026 }, { id: "c", year: 2027 }];
describe("konteks tahun anggaran", () => {
  it("pilihan tersimpan diutamakan", () => expect(pickYear(Y, "a", new Date("2026-10-10"))?.year).toBe(2025));
  it("tanpa pilihan: tahun berjalan (WIB)", () => expect(pickYear(Y, undefined, new Date("2026-10-10T05:00:00Z"))?.year).toBe(2026));
  it("batas tahun mengikuti WIB, bukan UTC", () => expect(pickYear(Y, undefined, new Date("2026-12-31T20:00:00Z"))?.year).toBe(2027));
  it("tahun berjalan tidak ada: ambil terbaru", () => expect(pickYear(Y, undefined, new Date("2030-01-10"))?.year).toBe(2027));
  it("id tersimpan tidak dikenal: kembali ke bawaan", () => expect(pickYear(Y, "zzz", new Date("2026-06-01"))?.year).toBe(2026));
  it("daftar kosong", () => expect(pickYear([], undefined)).toBeUndefined());
  it("encode/decode konsisten dan menolak format salah", () => {
    const a = "11111111-1111-1111-1111-111111111111", b = "22222222-2222-2222-2222-222222222222";
    expect(decodeContext(encodeContext(a, b))).toEqual({ yearId: a, stageId: b });
    expect(decodeContext("x:y")).toBeNull(); expect(decodeContext(undefined)).toBeNull();
  });
});
