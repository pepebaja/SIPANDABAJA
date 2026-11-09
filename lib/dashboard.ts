export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** Mengisi 12 bulan; bulan tanpa data = 0. Nilai hanya untuk tampilan grafik (bukan agregasi keuangan). */
export function fillMonths(rows: { month: number; verified: number }[]): { bulan: string; realisasi: number }[] {
  const by = new Map(rows.map((r) => [r.month, Number(r.verified)]));
  return MONTH_SHORT.map((bulan, i) => ({ bulan, realisasi: by.get(i + 1) ?? 0 }));
}

export type MethodRow = { method_id: string | null; method_name: string; pkg_count: number | string; tx_count: number | string; realized: number | string };
export type RankedMethod = { rank: number; name: string; packages: number; transactions: number; realized: string; share: number };
/**
 * Peringkat metode pemilihan menurut realisasi (tertinggi -> terendah; seri: jumlah paket lebih banyak, lalu nama).
 * Peringkat sama untuk nilai realisasi yang sama. `share` = porsi terhadap total realisasi seluruh metode (0-100, 1 desimal), untuk batang tampilan saja.
 */
export function rankMethods(rows: MethodRow[]): RankedMethod[] {
  const cents = (v: number | string) => { const [i = "0", f = ""] = String(v).split("."); const neg = i.startsWith("-"); return BigInt(i.replace("-", "") || "0") * 100n * (neg ? -1n : 1n) + (neg ? -1n : 1n) * BigInt((f + "00").slice(0, 2)); };
  const list = rows.map((r) => ({ name: r.method_name, packages: Number(r.pkg_count), transactions: Number(r.tx_count), c: cents(r.realized) }))
    .sort((a, b) => (a.c === b.c ? 0 : a.c > b.c ? -1 : 1) || b.packages - a.packages || a.name.localeCompare(b.name, "id"));
  const total = list.reduce((s, x) => s + (x.c > 0n ? x.c : 0n), 0n);
  let rank = 0, prev: bigint | null = null;
  return list.map((x, i) => {
    if (prev === null || x.c !== prev) rank = i + 1; prev = x.c;
    const whole = x.c / 100n, frac = (x.c < 0n ? -x.c : x.c) % 100n;
    return { rank, name: x.name, packages: x.packages, transactions: x.transactions, realized: `${x.c < 0n && whole === 0n ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`, share: total > 0n && x.c > 0n ? Number((x.c * 1000n) / total) / 10 : 0 };
  });
}
