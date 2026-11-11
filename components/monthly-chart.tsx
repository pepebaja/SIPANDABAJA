"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v);
export function MonthlyChart({ data: raw }: { data: { bulan: string; realisasi: number }[] }) {
  const [cum, setCum] = useState(false);
  let run = 0; const data = cum ? raw.map((d) => ({ ...d, realisasi: (run += d.realisasi) })) : raw;
  return (
    <div>
      <div className="mb-2 inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="group" aria-label="Tampilan grafik">{([[false, "Per bulan"], [true, "Kumulatif"]] as const).map(([k, l]) => <button key={l} aria-pressed={cum === k} onClick={() => setCum(k)} className={`px-3 py-1 font-medium ${cum === k ? "bg-navy-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{l}</button>)}</div>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer><BarChart data={data}><defs><linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" /><stop offset="100%" stopColor="#6366f1" /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="bulan" tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => (v >= 1e9 ? `${v / 1e9} M` : v >= 1e6 ? `${v / 1e6} jt` : String(v))} width={56} tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(34,211,238,.08)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} formatter={(v) => `Rp ${fmt(Number(v))}`} /><Bar dataKey="realisasi" name={cum ? "Realisasi kumulatif" : "Realisasi diakui"} fill="url(#barg)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Realisasi per bulan</caption><tbody>{data.map((d) => <tr key={d.bulan}><th>{d.bulan}</th><td>Rp {fmt(d.realisasi)}</td></tr>)}</tbody></table>
    </div>);
}
