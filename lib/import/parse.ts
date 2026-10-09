/** Mengubah "Rp 1.234.567,89" atau angka menjadi string desimal 2 digit tanpa floating-point pada string. */
export function parseRupiah(v: unknown): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2) : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/rp/gi, "").replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  if (/[1-9]/.test(f.slice(2))) return null; // jangan membulatkan diam-diam
  return `${i}.${(f + "00").slice(0, 2)}`;
}
