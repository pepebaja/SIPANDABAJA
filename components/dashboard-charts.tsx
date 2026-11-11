"use client";
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { QuarterPoint } from "@/lib/dashboard-data";
const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v);
const axis = (v: number) => (Math.abs(v) >= 1e9 ? `${+(v / 1e9).toFixed(1)} M` : Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(0)} jt` : String(v));
const SERIES = [["kas", "Kas triwulan", "#22d3ee"], ["real", "Realisasi triwulan", "#6366f1"], ["kasCum", "Kas kumulatif", "#0e7490"], ["realCum", "Realisasi kumulatif", "#4338ca"]] as const;
type Key = (typeof SERIES)[number][0];

/** Anggaran kas vs realisasi per triwulan; kas yang belum terpakai terbawa ke triwulan berikutnya (garis kumulatif). Seri dapat dihidupkan/dimatikan. */
export function QuarterChart({ data, currentQuarter }: { data: QuarterPoint[]; currentQuarter: number }) {
  const [on, setOn] = useState<Record<Key, boolean>>({ kas: true, real: true, kasCum: true, realCum: true });
  const cur = data[Math.min(Math.max(currentQuarter, 1), 4) - 1]!, left = cur.kasCum - cur.realCum;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Seri grafik">{SERIES.map(([k, l, c]) => <button key={k} aria-pressed={on[k]} onClick={() => setOn((s) => ({ ...s, [k]: !s[k] }))} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${on[k] ? "border-slate-400 bg-white text-slate-800" : "border-slate-200 bg-slate-50 text-slate-400 line-through"}`}><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} aria-hidden="true" />{l}</button>)}</div>
      <div className="h-64 w-full" aria-hidden="true"><ResponsiveContainer><ComposedChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="q" tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={axis} width={56} tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(34,211,238,.08)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} formatter={(v) => `Rp ${fmt(Number(v))}`} /><Legend content={() => null} />
        {on.kas && <Bar dataKey="kas" name="Kas triwulan" fill="#22d3ee" radius={[6, 6, 0, 0]} />}{on.real && <Bar dataKey="real" name="Realisasi triwulan" fill="#6366f1" radius={[6, 6, 0, 0]} />}
        {on.kasCum && <Line dataKey="kasCum" name="Kas kumulatif" stroke="#0e7490" strokeWidth={2.5} dot={{ r: 4 }} />}{on.realCum && <Line dataKey="realCum" name="Realisasi kumulatif" stroke="#4338ca" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 4 }} />}</ComposedChart></ResponsiveContainer></div>
      <p className={`rounded-lg px-3 py-2 text-sm ${left < 0 ? "bg-red-50 text-red-800" : "bg-cyan-50 text-cyan-900"}`}>Sampai <b>{cur.q}</b>: kas kumulatif Rp {fmt(cur.kasCum)}, realisasi kumulatif Rp {fmt(cur.realCum)}, {left < 0 ? <>realisasi <b>melampaui</b> kas Rp {fmt(-left)} (sesuaikan anggaran kas)</> : <>sisa kas yang masih dapat dipakai <b>Rp {fmt(left)}</b> (sisa triwulan sebelumnya terbawa ke triwulan berikutnya)</>}.</p>
      <table className="sr-only"><caption>Kas dan realisasi per triwulan</caption><tbody>{data.map((d) => <tr key={d.q}><th>{d.q}</th><td>Kas Rp {fmt(d.kas)}</td><td>Realisasi Rp {fmt(d.real)}</td></tr>)}</tbody></table>
    </div>);
}

const COLORS = ["#06b6d4", "#6366f1", "#f59e0b", "#10b981", "#ec4899", "#64748b"];
/** Diagram donat dengan legenda interaktif (arahkan kursor/fokus pada legenda untuk menyorot irisan). */
export function Donut({ data, unit = "Rp", center }: { data: { name: string; value: number }[]; unit?: "Rp" | ""; center: string }) {
  const [active, setActive] = useState<number | null>(null), total = data.reduce((a, d) => a + d.value, 0);
  const f = (v: number) => (unit ? `Rp ${fmt(v)}` : fmt(v));
  return (
    <div className="space-y-3">
      <div className="relative h-48 w-full" aria-hidden="true"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}>
        {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={active === null || active === i ? 1 : 0.35} stroke="none" />)}</Pie><Tooltip formatter={(v) => f(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} /></PieChart></ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-slate-500">{center}</span><span className="font-display text-lg font-bold tabular-nums text-navy-800">{unit ? `Rp ${axis(total)}` : fmt(total)}</span></div></div>
      <ul className="space-y-1">{data.map((d, i) => <li key={d.name}><button type="button" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-slate-50">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />{d.name}</span><span className="tabular-nums text-slate-700">{f(d.value)} <span className="text-xs text-slate-500">({total ? ((d.value / total) * 100).toFixed(1).replace(".", ",") : "0"}%)</span></span></button></li>)}</ul>
    </div>);
}
