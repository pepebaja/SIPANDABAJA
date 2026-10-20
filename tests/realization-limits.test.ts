import { describe, expect, it } from "vitest";
import { computeLimits, quarterOfDate } from "@/lib/realization-limits";

describe("triwulan dari tanggal", () => {
  it.each([["2026-01-01", 1], ["2026-03-31", 1], ["2026-04-01", 2], ["2026-09-30", 3], ["2026-12-31", 4], ["2025-12-31", 1], ["2027-01-02", 4]])("%s", (d, q) => expect(quarterOfDate(d, 2026)).toBe(q));
  it("format tidak valid", () => { expect(quarterOfDate("31/03/2026", 2026)).toBeNull(); expect(quarterOfDate("2026-13-01", 2026)).toBeNull(); });
});

// Rekening pagu 400, kas 100 per triwulan.
const base = { pagu: "400.00", cash: ["100.00", "100.00", "100.00", "100.00"] };
describe("kas kumulatif", () => {
  it("TW I hanya boleh memakai kas TW I (kas depan tidak dapat diserap lebih awal)", () => {
    const l = computeLimits({ ...base, realized: ["0.00", "0.00", "0.00", "0.00"] }, 1);
    expect(l.max).toBe("100.00"); expect(l.limitedBy).toBe("kas");
  });
  it("sisa kas triwulan lalu terbawa ke triwulan berikutnya", () => {
    const l = computeLimits({ ...base, realized: ["60.00", "0.00", "0.00", "0.00"] }, 2);
    expect(l.max).toBe("140.00"); expect(l.rows[1]!.left).toBe("140.00");
  });
  it("belanja susulan di triwulan lama ikut mengurangi kas triwulan sesudahnya", () => {
    // TW II sudah menyerap 150 (dari 200 kumulatif). Susulan di TW I: kas TW I tersisa 100, tetapi TW II hanya tersisa 50.
    const l = computeLimits({ ...base, realized: ["0.00", "150.00", "0.00", "0.00"] }, 1);
    expect(l.max).toBe("50.00"); expect(l.cashLeft).toBe("50.00");
  });
  it("kas belum diisi = tidak ada batas belanja", () => {
    const l = computeLimits({ pagu: "400.00", cash: [null, null, null, null], realized: ["0.00", "0.00", "0.00", "0.00"] }, 3);
    expect(l.max).toBe("0.00");
  });
  it("koreksi (negatif) mengembalikan sisa mulai triwulannya", () => {
    const l = computeLimits({ ...base, realized: ["100.00", "-30.00", "0.00", "0.00"] }, 2);
    expect(l.max).toBe("130.00");
  });
});
describe("pagu rekening dan pagu RUP", () => {
  it("pagu rekening membatasi bila lebih kecil dari kas", () => {
    const l = computeLimits({ pagu: "150.00", cash: ["100.00", "100.00", "0.00", "0.00"], realized: ["100.00", "0.00", "0.00", "0.00"] }, 2);
    expect(l.entryLeft).toBe("50.00"); expect(l.max).toBe("50.00"); expect(l.limitedBy).toBe("pagu");
  });
  it("pagu RUP membatasi; satu RUP boleh dipakai berulang", () => {
    const l = computeLimits({ ...base, realized: ["0.00", "0.00", "0.00", "0.00"] }, 4, { pagu: "250.00", realized: "230.00" });
    expect(l.rupLeft).toBe("20.00"); expect(l.max).toBe("20.00"); expect(l.limitedBy).toBe("rup");
  });
  it("tanpa desimal mengambang", () => {
    const l = computeLimits({ pagu: "0.30", cash: ["0.30", null, null, null], realized: ["0.10", "0.00", "0.00", "0.00"] }, 1);
    expect(l.max).toBe("0.20");
  });
});
