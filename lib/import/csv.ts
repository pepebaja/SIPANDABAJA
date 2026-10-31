import type { MatrixRow } from "./xlsx";
/** Membaca teks CSV (pemisah koma, titik koma, atau tab; terdeteksi otomatis; mendukung tanda kutip ganda dan BOM). cells[i] 1-based seperti readFirstSheetMatrix. */
export function parseCsv(text: string): MatrixRow[] {
  const t = text.replace(/^\uFEFF/, "");
  const first = t.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const count = (c: string) => { let n = 0, q = false; for (const ch of first) { if (ch === '"') q = !q; else if (ch === c && !q) n++; } return n; };
  const delim = ([";", "\t", ","] as const).map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const out: MatrixRow[] = []; let row: string[] = [], cell = "", q = false, line = 1, rowLine = 1;
  const endRow = () => { row.push(cell); cell = ""; if (row.some((c) => c.trim() !== "")) { const cells: unknown[] = []; row.forEach((c, i) => { cells[i + 1] = c; }); out.push({ n: rowLine, cells }); } row = []; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else { cell += ch; if (ch === "\n") line++; } continue; }
    if (ch === '"' && cell === "") q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; endRow(); line++; rowLine = line; }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return out;
}
/** Decode byte CSV: UTF-8 (dengan/atau tanpa BOM); bila bukan UTF-8 sah, dianggap Windows-1252 (Excel lama). */
export function decodeCsv(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}
