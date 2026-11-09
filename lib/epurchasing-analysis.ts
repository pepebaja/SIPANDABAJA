import { formatRupiah } from "./format";
import { fromCents, percent, sumCents, toCents } from "./money";
/**
 * Analisis pelaksanaan paket e-purchasing dibandingkan dengan pagu RUP dan metode pemilihan lainnya (Laporan Kinerja PPBJ).
 * Satuan analisis = satu paket RUP (kode RUP). Metode = metode paket pengadaan bila sudah ada, jika belum maka rencana metode pada RUP.
 * Paket batal/tunda tidak dianalisis (dilaporkan terpisah).
 */
export type EpItem = {
  code: string; name: string; officer: string | null; hasPackage: boolean; cancelled: boolean;
  methodName: string; isEp: boolean; plannedName: string | null; plannedIsEp: boolean;
  pagu: string;                 // pagu RUP (pagu paket bila tanpa RUP)
  contract: string | null;      // nilai kontrak/SP (null = belum ada)
  realized: string;             // realisasi diakui (bertanggal SPM/SP2D), kumulatif tahapan
};
export type MethodStat = {
  name: string; isEp: boolean; items: number; packages: number; pagu: string; contracted: number; contractPagu: string; contract: string; saving: string;
  realized: string; absorption: string | null; contractPct: string | null; avgPagu: string; sharePkg: string | null; sharePagu: string | null;
};
export type EpAnalysis = {
  total: MethodStat; ep: MethodStat; others: MethodStat; methods: MethodStat[]; cancelled: number;
  plan: { plannedEp: number; actualEp: number; stayed: number; toOther: number; fromOther: number };
};
const EP_RE = /e[\s-]*purchas|e[\s-]*katalog|katalog\s*elektronik/i;
/** E-purchasing dikenali dari kode metode EPURCHASING atau namanya (E-purchasing / e-katalog / katalog elektronik). */
export const isEPurchasing = (m: { code?: string | null; name?: string | null }): boolean => m.code === "EPURCHASING" || EP_RE.test(m.name ?? "");

function stat(name: string, isEp: boolean, xs: EpItem[], all: { items: number; pagu: string }): MethodStat {
  const pagu = fromCents(sumCents(xs.map((x) => x.pagu))), withC = xs.filter((x) => x.contract !== null);
  const contract = fromCents(sumCents(withC.map((x) => x.contract!))), contractPagu = fromCents(sumCents(withC.map((x) => x.pagu))), realized = fromCents(sumCents(xs.map((x) => x.realized)));
  return { name, isEp, items: xs.length, packages: xs.filter((x) => x.hasPackage).length, pagu, contracted: withC.length, contractPagu, contract, saving: fromCents(toCents(contractPagu) - toCents(contract)),
    realized, absorption: percent(realized, pagu), contractPct: percent(contract, contractPagu), avgPagu: xs.length ? fromCents(toCents(pagu) / BigInt(xs.length)) : "0.00",
    sharePkg: all.items ? percent(String(xs.length), String(all.items)) : null, sharePagu: percent(pagu, all.pagu) };
}
export function analyzeEpurchasing(input: EpItem[]): EpAnalysis {
  const xs = input.filter((x) => !x.cancelled), all = { items: xs.length, pagu: fromCents(sumCents(xs.map((x) => x.pagu))) };
  const names = [...new Set(xs.map((x) => x.methodName))], byName = (n: string) => xs.filter((x) => x.methodName === n);
  const methods = names.map((n) => stat(n, byName(n)[0]!.isEp, byName(n), all)).sort((a, b) => (toCents(b.pagu) === toCents(a.pagu) ? 0 : toCents(b.pagu) > toCents(a.pagu) ? 1 : -1) || a.name.localeCompare(b.name, "id"));
  const planned = xs.filter((x) => x.plannedName !== null);
  return { total: stat("Seluruh metode", false, xs, all), ep: stat("E-purchasing", true, xs.filter((x) => x.isEp), all), others: stat("Metode pemilihan lainnya", false, xs.filter((x) => !x.isEp), all), methods,
    cancelled: input.length - xs.length,
    plan: { plannedEp: planned.filter((x) => x.plannedIsEp).length, actualEp: xs.filter((x) => x.hasPackage && x.isEp).length,
      stayed: planned.filter((x) => x.hasPackage && x.plannedIsEp && x.isEp).length, toOther: planned.filter((x) => x.hasPackage && x.plannedIsEp && !x.isEp).length, fromOther: planned.filter((x) => x.hasPackage && !x.plannedIsEp && x.isEp).length } };
}
const pc = (v: string | null) => (v === null ? "N/A" : `${v.replace(".", ",")}%`);
const pt = (a: string | null, b: string | null) => (a === null || b === null ? null : (Number(a) - Number(b)).toFixed(1).replace(".", ","));
/** Kalimat analisis otomatis dari data (dipakai pada slide dan simpulan laporan). */
export function narrateEpurchasing(a: EpAnalysis): string[] {
  const { ep, others, plan } = a, out: string[] = [];
  if (!ep.items) return [a.total.items ? "Belum ada paket dengan metode pemilihan e-purchasing pada tahun/tahapan ini." : "Belum ada paket RUP/pengadaan yang dapat dianalisis."];
  out.push(`E-purchasing mencakup ${ep.items} paket (${pc(ep.sharePkg)} dari seluruh paket) dengan pagu RUP ${pc(ep.sharePagu)} dari total pagu; rata-rata pagu per paket lebih ${toCents(ep.avgPagu) <= toCents(others.avgPagu) ? "kecil" : "besar"} daripada metode lainnya.`);
  const d = pt(ep.absorption, others.absorption);
  out.push(ep.absorption === null ? "Serapan e-purchasing belum dapat dihitung (pagu RUP nol)." : `Realisasi e-purchasing mencapai ${pc(ep.absorption)} dari pagu RUP-nya${others.absorption !== null && d !== null ? `, ${Number(d) >= 0 ? "lebih tinggi" : "lebih rendah"} ${d.replace("-", "")} poin persentase dibanding metode lainnya (${pc(others.absorption)})` : ""}.`);
  if (ep.contracted) out.push(`Dari ${ep.items} paket e-purchasing, ${ep.contracted} paket sudah bernilai kontrak/SP: ${pc(ep.contractPct)} dari pagu paket tersebut; selisih pagu terhadap kontrak ${formatRupiah(ep.saving)}.`);
  if (plan.plannedEp || plan.toOther || plan.fromOther) out.push(`Rencana RUP menetapkan ${plan.plannedEp} paket e-purchasing; terlaksana ${plan.actualEp} paket e-purchasing (${plan.stayed} sesuai rencana, ${plan.fromOther} beralih dari metode lain, ${plan.toOther} dialihkan ke metode lain).`);
  return out;
}
