import { fromCents, percent, toCents } from "./money";

export type PerfPackage = {
  id: string; code: string; name: string; officer: string | null; pagu: string; status: string; statusName: string; group: string | null;
  due: string | null; handover: string | null; start: string | null; end: string | null; obstacle: string | null; contract: string | null;
};
export type OfficerStat = {
  officer: string; total: number; pagu: string; contract: string; saving: string; selesai: number; diproses: number; persiapan: number; batalTunda: number;
  onTime: number; late: number; overdue: number; avgDays: number | null; completion: string | null; onTimePct: string | null;
};
export type Performance = { all: OfficerStat; officers: OfficerStat[]; statuses: { name: string; n: number }[]; obstacles: { name: string; n: number }[]; overdue: PerfPackage[] };

export const NO_OFFICER = "(Belum ditetapkan)";
const dayMs = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);

/** Kelompok progres paket: selesai, diproses (pemilihan s.d. serah terima), batal/tunda, selain itu persiapan. */
export function progressOf(p: Pick<PerfPackage, "status" | "group">): "selesai" | "diproses" | "batalTunda" | "persiapan" {
  if (p.status === "SELESAI" || p.group === "selesai") return "selesai";
  if (p.status === "BATAL" || p.status === "TUNDA") return "batalTunda";
  if (p.group === "diproses") return "diproses";
  return "persiapan";
}
/** Paket terlambat = lewat tenggat, belum selesai/batal/tunda. today berformat YYYY-MM-DD. */
export const isOverdue = (p: PerfPackage, today: string) => !!p.due && p.due < today && ["persiapan", "diproses"].includes(progressOf(p));

function stat(officer: string, ps: PerfPackage[], today: string): OfficerStat {
  let pagu = 0n, contract = 0n, saving = 0n, dSum = 0, dN = 0;
  const c = { selesai: 0, diproses: 0, persiapan: 0, batalTunda: 0 }; let onTime = 0, late = 0, overdue = 0;
  for (const p of ps) {
    const g = progressOf(p); c[g]++; pagu += toCents(p.pagu);
    if (p.contract !== null && g !== "batalTunda") { contract += toCents(p.contract); saving += toCents(p.pagu) - toCents(p.contract); }
    if (g === "selesai" && p.due && p.handover) { if (p.handover <= p.due) onTime++; else late++; }
    if (p.start && p.end && p.end >= p.start) { dSum += days(p.start, p.end); dN++; }
    if (isOverdue(p, today)) overdue++;
  }
  const active = ps.length - c.batalTunda;
  return { officer, total: ps.length, pagu: fromCents(pagu), contract: fromCents(contract), saving: fromCents(saving), ...c, onTime, late, overdue,
    avgDays: dN ? Math.round(dSum / dN) : null, completion: active > 0 ? percent(String(c.selesai), String(active)) : null, onTimePct: onTime + late > 0 ? percent(String(onTime), String(onTime + late)) : null };
}
const tally = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "id"));

/** Rekap kinerja per pejabat pengadaan (PPBJ) dari data paket. Seluruh angka diturunkan dari data aplikasi, tanpa penilaian subjektif. */
export function buildPerformance(pkgs: PerfPackage[], today: string): Performance {
  const by = new Map<string, PerfPackage[]>();
  for (const p of pkgs) { const k = p.officer || NO_OFFICER; by.set(k, [...(by.get(k) ?? []), p]); }
  const officers = [...by].map(([o, ps]) => stat(o, ps, today)).sort((a, b) => b.total - a.total || a.officer.localeCompare(b.officer, "id"));
  return { all: stat("Seluruh pejabat", pkgs, today), officers, statuses: tally(pkgs.map((p) => p.statusName)),
    obstacles: tally(pkgs.filter((p) => p.obstacle).map((p) => p.obstacle as string)), overdue: pkgs.filter((p) => isOverdue(p, today)).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")) };
}
