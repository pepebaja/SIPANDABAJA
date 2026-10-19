import ExcelJS from "exceljs";
export type SheetRow = Record<string, unknown> & { _row: number };
function cellValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: string; formula?: string; sharedFormula?: string };
    if (typeof o.error === "string") return o.error;                       // sel galat Excel: #REF!, #VALUE!, ...
    if ("result" in o) return cellValue(o.result);                         // formula: pakai hasil terhitung
    if ("formula" in o || "sharedFormula" in o) return "";                 // formula tanpa hasil tersimpan
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("text" in o) return o.text;
  }
  return v ?? "";
}
/** Membaca worksheet pertama; baris 1 = header (huruf kecil). Tidak mengeksekusi formula/makro. */
export async function readFirstSheet(buf: ArrayBuffer): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, i) => { headers[i] = String(cellValue(c.value)).trim().toLowerCase(); });
  const rows: SheetRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: SheetRow = { _row: n };
    row.eachCell((c, i) => { const h = headers[i]; if (h) r[h] = cellValue(c.value); });
    if (Object.keys(r).length > 1) rows.push(r);
  });
  return rows;
}

export type MatrixRow = { n: number; cells: unknown[] };
/** Membaca worksheet pertama apa adanya (tanpa menganggap baris 1 sebagai header). cells[i] = isi kolom ke-i (1-based; indeks 0 kosong). */
export async function readFirstSheetMatrix(buf: ArrayBuffer): Promise<MatrixRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: MatrixRow[] = [];
  ws.eachRow((row, n) => {
    const cells: unknown[] = [];
    row.eachCell((c, i) => { cells[i] = cellValue(c.value); });
    out.push({ n, cells });
  });
  return out;
}
