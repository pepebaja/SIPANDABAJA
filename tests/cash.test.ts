import { describe, expect, it } from "vitest";
import { fromCents, percent, toCents } from "@/lib/money";
describe("money", () => {
  it("round-trip tanpa kehilangan presisi", () => { expect(fromCents(toCents("0.10") + toCents("0.20"))).toBe("0.30"); expect(fromCents(toCents("-0.50"))).toBe("-0.50"); });
  it("persentase dan N/A bila pagu nol", () => { expect(percent("250.00", "1000.00")).toBe("25.00"); expect(percent("1.00", "0.00")).toBeNull(); });
});
import { formatRupiah } from "@/lib/format";
describe("format", () => { it("rupiah Indonesia", () => { expect(formatRupiah("1234567.5")).toBe("Rp 1.234.567,50"); expect(formatRupiah("-5.00")).toBe("-Rp 5,00"); }); });
