export function formatRupiah(s: string): string {
  const [i = "0", f = ""] = s.split("."); const neg = i.startsWith("-");
  const int = i.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}Rp ${int},${(f + "00").slice(0, 2)}`;
}
import { parseRupiah } from "./import/parse";
export const rp = (v: unknown): string => (v == null ? "-" : formatRupiah(parseRupiah(v) ?? "0.00"));
