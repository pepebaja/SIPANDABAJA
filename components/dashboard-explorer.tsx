"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { toCents } from "@/lib/money";
import type { DashGroup, DashLevel } from "@/lib/dashboard-data";
const TABS: [DashLevel, string][] = [["program", "Program"], ["kegiatan", "Kegiatan"], ["sub", "Sub kegiatan"], ["jenis", "Jenis belanja"]];
const SORTS = [["real", "Realisasi terbesar"], ["pct_hi", "Serapan tertinggi"], ["pct_lo", "Serapan terendah"], ["left", "Sisa anggaran terbesar"]] as const;
type Sort = (typeof SORTS)[number][0];
const pc = (v: number | null) => (v === null ? "N/A" : `${v.toFixed(1).replace(".", ",")}%`);
const tone = (p: number | null) => (p === null ? "bg-slate-300" : p > 100 ? "bg-red-500" : p < 25 ? "bg-amber-400" : "bg-gradient-to-r from-cyan-500 to-indigo-500");

/** Penjelajah anggaran: pilih tingkat, tampilan (serapan % atau nilai), urutan, jumlah, dan pencarian. Klik baris = buka Daftar transaksi terfilter. */
export function DashboardExplorer({ levels }: { levels: Record<DashLevel, DashGroup[]> }) {
  const [level, setLevel] = useState<DashLevel>("program"), [mode, setMode] = useState<"pct" | "val">("pct"), [sort, setSort] = useState<Sort>("real"), [top, setTop] = useState(8), [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase(), all = levels[level].filter((g) => !s || `${g.code} ${g.name}`.toLowerCase().includes(s));
    const cmp: Record<Sort, (a: DashGroup, b: DashGroup) => number> = { real: (a, b) => Number(toCents(b.realized) - toCents(a.realized)), pct_hi: (a, b) => (b.pct ?? -1) - (a.pct ?? -1), pct_lo: (a, b) => (a.pct ?? 1e9) - (b.pct ?? 1e9), left: (a, b) => Number(toCents(b.remaining) - toCents(a.remaining)) };
    return [...all].sort(cmp[sort]);
  }, [levels, level, sort, q]);
  const shown = top === 0 ? rows : rows.slice(0, top), maxPagu = Math.max(1, ...shown.map((g) => Number(g.pagu)));
  const ctl = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Tingkat" className="flex flex-wrap gap-1.5">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={level === k} onClick={() => setLevel(k)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${level === k ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{l}</button>)}</div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="group" aria-label="Tampilan">{([["pct", "Serapan %"], ["val", "Nilai Rp"]] as const).map(([k, l]) => <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className={`px-3 py-1.5 font-medium ${mode === k ? "bg-navy-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{l}</button>)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode atau nama" aria-label="Cari" className={`${ctl} min-w-52 flex-1`} />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Urutkan" className={ctl}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={top} onChange={(e) => setTop(Number(e.target.value))} aria-label="Jumlah ditampilkan" className={ctl}><option value={8}>8 teratas</option><option value={15}>15 teratas</option><option value={0}>Semua</option></select>
      </div>
      {!shown.length ? <p className="py-6 text-center text-slate-600">Tidak ada data yang cocok.</p> : (
        <ul className="divide-y divide-slate-100">{shown.map((g) => {
          const trackW = mode === "pct" ? 100 : (Number(g.pagu) / maxPagu) * 100, fillW = Math.min(100, g.pct ?? 0);
          return (
            <li key={g.key}><Link href={g.href} className="group block rounded-lg px-2 py-2.5 transition hover:bg-cyan-50/60" title="Buka Daftar transaksi dengan filter ini">
              <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-sm"><b className="tabular-nums text-navy-800">{g.code}</b> <span className="text-slate-700">{g.name}</span></span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${g.pct !== null && g.pct > 100 ? "text-red-700" : "text-navy-800"}`}>{pc(g.pct)}</span></div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" style={{ width: `${Math.max(trackW, 4)}%` }} role="progressbar" aria-valuenow={Math.round(g.pct ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label={`Serapan ${g.name}`}>
                <div className={`h-full rounded-full ${tone(g.pct)}`} style={{ width: `${fillW}%` }} /></div>
              <p className="mt-1 text-xs tabular-nums text-slate-600">Realisasi {formatRupiah(g.realized)} dari pagu {formatRupiah(g.pagu)} · sisa {formatRupiah(g.remaining)}<span className="ml-2 font-semibold text-cyan-800 opacity-0 transition group-hover:opacity-100">Buka daftar →</span></p>
            </Link></li>); })}</ul>)}
      <p className="text-xs text-slate-500">{rows.length} {TABS.find(([k]) => k === level)?.[1].toLowerCase()} · warna: kuning &lt; 25% serapan, merah &gt; 100% (melampaui pagu). Realisasi = transaksi bertanggal SPM/SP2D, kumulatif tahapan.</p>
    </div>);
}
