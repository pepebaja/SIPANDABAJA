"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v);
export function MonthlyChart({ data }: { data: { bulan: string; realisasi: number }[] }) {
  return (
    <div>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bulan" />
          <YAxis tickFormatter={(v: number) => (v >= 1e9 ? `${v / 1e9} M` : v >= 1e6 ? `${v / 1e6} jt` : String(v))} width={56} />
          <Tooltip formatter={(v) => `Rp ${fmt(Number(v))}`} /><Bar dataKey="realisasi" name="Realisasi terverifikasi" fill="#0f8b8d" /></BarChart></ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Realisasi terverifikasi per bulan</caption><tbody>{data.map((d) => <tr key={d.bulan}><th>{d.bulan}</th><td>Rp {fmt(d.realisasi)}</td></tr>)}</tbody></table>
    </div>);
}
