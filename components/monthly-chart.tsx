"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v);
export function MonthlyChart({ data }: { data: { bulan: string; realisasi: number }[] }) {
  return (
    <div>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer><BarChart data={data}><defs><linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" /><stop offset="100%" stopColor="#6366f1" /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="bulan" tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => (v >= 1e9 ? `${v / 1e9} M` : v >= 1e6 ? `${v / 1e6} jt` : String(v))} width={56} tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(34,211,238,.08)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} formatter={(v) => `Rp ${fmt(Number(v))}`} /><Bar dataKey="realisasi" name="Realisasi terverifikasi" fill="url(#barg)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Realisasi terverifikasi per bulan</caption><tbody>{data.map((d) => <tr key={d.bulan}><th>{d.bulan}</th><td>Rp {fmt(d.realisasi)}</td></tr>)}</tbody></table>
    </div>);
}
