import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFirstSheet } from "@/lib/import/xlsx";
import { buildEntryIndex, CASH_TEMPLATE_COLUMNS, validateCashRows } from "@/lib/cash-import";

describe("siklus template Excel anggaran kas", () => {
  it("template yang diisi pengguna terbaca dan tervalidasi", async () => {
    const idx = buildEntryIndex([{ id: "e1", sub: "1.01.02.2.06.0001", acc: "5.1.02.01.01.0026", fund: "DAU", desc: "Belanja ATK", pagu: "5000000.00" }, { id: "e2", sub: "1.01.02.2.06.0001", acc: "5.1.02.01.01.0027", fund: "DAU", desc: "Belanja Kertas", pagu: "800000.00" }]);
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Anggaran Kas");
    ws.addRow([...CASH_TEMPLATE_COLUMNS]);
    ws.addRow(["1.01", "1.01.02.2.06", "1.01.02.2.06.0001", "5.1.02.01.01.0026", "DAU", "Belanja ATK", 5000000, 1250000, "1.250.000,00", null, 1250000]);
    ws.addRow(["1.01", "1.01.02.2.06", "1.01.02.2.06.0001", "5.1.02.01.01.0027", "DAU", "Belanja Kertas", 800000, null, null, null, null]);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const rows = await readFirstSheet(buf), r = validateCashRows(rows, idx);
    expect(r.errors).toEqual([]); expect(r.skipped).toBe(1);
    expect(r.valid).toEqual([{ entry_id: "e1", q: ["1250000.00", "1250000.00", null, "1250000.00"] }]);
  });
});
