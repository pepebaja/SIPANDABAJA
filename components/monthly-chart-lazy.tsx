"use client";
import dynamic from "next/dynamic";
// Recharts (~110 kB) dimuat setelah halaman tampil, tidak menahan render Beranda.
export const MonthlyChart = dynamic(() => import("@/components/monthly-chart").then((m) => m.MonthlyChart), {
  ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" role="status" aria-label="Memuat grafik" />,
});
