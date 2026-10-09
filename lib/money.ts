/** Aritmatika rupiah dalam sen (BigInt); tidak memakai floating point. */
export const toCents = (s: string): bigint => {
  const [i = "0", f = ""] = s.split("."); const neg = i.startsWith("-");
  return BigInt(i) * 100n + (neg ? -1n : 1n) * BigInt((f + "00").slice(0, 2));
};
export const fromCents = (c: bigint): string => {
  const neg = c < 0n, a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};
/** Persentase 2 desimal; null (N/A) bila pagu nol. */
export const percent = (part: string, whole: string): string | null => {
  const w = toCents(whole); if (w === 0n) return null;
  return fromCents((toCents(part) * 10000n) / w);
};
