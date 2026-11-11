import { fromCents, toCents } from "./money";
import { jenisName, jenisOfCode } from "./belanja";
/** Agregasi pagu dan realisasi untuk Dashboard (program, kegiatan, sub kegiatan, jenis belanja, tahapan). Murni: tanpa akses database. */
export type DashIds = { progId: string; progCode: string; progName: string; actId: string; actCode: string; actName: string; subId: string; subCode: string; subName: string; accCode: string };
export type DashEntry = DashIds & { amount: string };
export type DashTx = DashIds & { amount: string; stage: string };
export type DashLevel = "program" | "kegiatan" | "sub" | "jenis";
export type DashGroup = { key: string; code: string; name: string; pagu: string; realized: string; remaining: string; pct: number | null; href: string };
const href = (params: Record<string, string>) => `/realisasi?${new URLSearchParams({ tab: "daftar", ...params }).toString()}`;
const LEVELS: Record<DashLevel, (x: DashIds) => { key: string; code: string; name: string; params: Record<string, string> }> = {
  program: (x) => ({ key: x.progId, code: x.progCode, name: x.progName, params: { program: x.progId } }),
  kegiatan: (x) => ({ key: x.actId, code: x.actCode, name: x.actName, params: { kegiatan: x.actId } }),
  sub: (x) => ({ key: x.subId, code: x.subCode, name: x.subName, params: { sub: x.subId } }),
  jenis: (x) => { const p = jenisOfCode(x.accCode); return { key: p, code: p, name: jenisName(p), params: { jenis: p } }; },
};
function group(entries: DashEntry[], txs: DashTx[], level: DashLevel): DashGroup[] {
  const m = new Map<string, { meta: ReturnType<(typeof LEVELS)[DashLevel]>; pagu: bigint; real: bigint }>(), of = LEVELS[level];
  const get = (x: DashIds) => { const meta = of(x); let g = m.get(meta.key); if (!g) { g = { meta, pagu: 0n, real: 0n }; m.set(meta.key, g); } return g; };
  for (const e of entries) get(e).pagu += toCents(e.amount);
  for (const t of txs) get(t).real += toCents(t.amount);
  return [...m.values()].map((g): DashGroup => ({ key: g.meta.key, code: g.meta.code, name: g.meta.name, pagu: fromCents(g.pagu), realized: fromCents(g.real), remaining: fromCents(g.pagu - g.real),
    pct: g.pagu > 0n ? Number((g.real * 1000n) / g.pagu) / 10 : null, href: href(g.meta.params) }))
    .sort((a, b) => (toCents(b.realized) === toCents(a.realized) ? 0 : toCents(b.realized) > toCents(a.realized) ? 1 : -1) || a.code.localeCompare(b.code, "id", { numeric: true }));
}
export function aggregateLevels(entries: DashEntry[], txs: DashTx[]): Record<DashLevel, DashGroup[]> {
  return { program: group(entries, txs, "program"), kegiatan: group(entries, txs, "kegiatan"), sub: group(entries, txs, "sub"), jenis: group(entries, txs, "jenis") };
}
/** Realisasi menurut tahapan (tahapan ditentukan Tanggal SPM/SP2D), urut sesuai kemunculan terbesar. */
export function byStage(txs: DashTx[]): { name: string; value: string }[] {
  const m = new Map<string, bigint>(); for (const t of txs) m.set(t.stage, (m.get(t.stage) ?? 0n) + toCents(t.amount));
  return [...m.entries()].filter(([, v]) => v !== 0n).sort((a, b) => (a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1)).map(([name, v]) => ({ name, value: fromCents(v) }));
}
/** Kas vs realisasi per triwulan + kumulatifnya (angka untuk grafik). */
export type QuarterPoint = { q: string; kas: number; real: number; kasCum: number; realCum: number };
export function quarterSeries(cash: [number, number][], real: [number, number][]): QuarterPoint[] {
  const c = [0, 0, 0, 0], r = [0, 0, 0, 0]; for (const [q, v] of cash) if (q >= 1 && q <= 4) c[q - 1]! += v; for (const [q, v] of real) if (q >= 1 && q <= 4) r[q - 1]! += v;
  let kc = 0, rc = 0; return ["TW I", "TW II", "TW III", "TW IV"].map((q, i) => { kc += c[i]!; rc += r[i]!; return { q, kas: c[i]!, real: r[i]!, kasCum: kc, realCum: rc }; });
}
