import { describe, expect, it } from "vitest";
import { fromCents, percent, toCents } from "@/lib/money";
import { cashWarnings, quarterTotals } from "@/lib/cash";
describe("money", () => {
  it("round-trip tanpa kehilangan presisi", () => { expect(fromCents(toCents("0.10") + toCents("0.20"))).toBe("0.30"); expect(fromCents(toCents("-0.50"))).toBe("-0.50"); });
  it("persentase dan N/A bila pagu nol", () => { expect(percent("250.00", "1000.00")).toBe("25.00"); expect(percent("1.00", "0.00")).toBeNull(); });
});
describe("cash", () => {
  const entries = [{ id: "e1", amount: "1000.00" }];
  it("total triwulan", () => expect(quarterTotals([{ entryId: "e1", month: 1, planned: "100.00" }, { entryId: "e1", month: 4, planned: "50.50" }])).toEqual(["100.00", "50.50", "0.00", "0.00"]));
  it("rencana kas melebihi pagu", () => expect(cashWarnings(entries, [{ entryId: "e1", month: 1, planned: "1000.01" }], []).map((w) => w.type)).toEqual(["exceeds_pagu"]));
  it("jadwal paket tidak selaras dengan kas", () => {
    const w = cashWarnings(entries, [{ entryId: "e1", month: 6, planned: "500.00" }], [{ id: "p1", name: "ATK", dueMonth: 3, allocations: [{ entryId: "e1", amount: "400.00" }] }]);
    expect(w.map((x) => x.type)).toEqual(["cash_not_ready"]);
  });
  it("tanpa jadwal -> peringatan, bukan error", () => expect(cashWarnings(entries, [], [{ id: "p", name: "X", dueMonth: null, allocations: [] }])[0]?.type).toBe("no_schedule"));
  it("kas cukup -> tidak ada peringatan", () => expect(cashWarnings(entries, [{ entryId: "e1", month: 2, planned: "400.00" }], [{ id: "p1", name: "ATK", dueMonth: 3, allocations: [{ entryId: "e1", amount: "400.00" }] }])).toEqual([]));
});
import { formatRupiah } from "@/lib/format";
describe("format", () => { it("rupiah Indonesia", () => { expect(formatRupiah("1234567.5")).toBe("Rp 1.234.567,50"); expect(formatRupiah("-5.00")).toBe("-Rp 5,00"); }); });
