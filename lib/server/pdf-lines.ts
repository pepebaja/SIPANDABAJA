import "server-only";
import { getDocumentProxy } from "unpdf";

/** Membaca PDF BERBASIS TEKS menjadi daftar baris (item teks sebaris digabung dengan spasi, urut kiri ke kanan). PDF hasil scan (gambar) tidak berisi teks dan akan menghasilkan daftar kosong. */
export async function extractPdfLines(buf: Uint8Array, maxPages = 200): Promise<string[]> {
  const pdf = await getDocumentProxy(buf);
  const lines: string[] = [];
  try {
    for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = (tc.items as { str?: string; transform?: number[] }[]).filter((i) => typeof i.str === "string" && i.str.trim() && i.transform);
      const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
      for (const it of items) {
        const x = it.transform![4]!, y = it.transform![5]!;
        const row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
        if (row) row.parts.push({ x, s: it.str!.trim() }); else rows.push({ y, parts: [{ x, s: it.str!.trim() }] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(" "));
    }
  } finally { await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.(); }
  return lines;
}
