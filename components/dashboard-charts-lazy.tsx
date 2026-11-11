"use client";
import dynamic from "next/dynamic";
const sk = (h: string) => () => <div className={`${h} animate-pulse rounded-xl bg-slate-100`} role="status" aria-label="Memuat grafik" />;
export const QuarterChart = dynamic(() => import("@/components/dashboard-charts").then((m) => m.QuarterChart), { ssr: false, loading: sk("h-72") });
export const Donut = dynamic(() => import("@/components/dashboard-charts").then((m) => m.Donut), { ssr: false, loading: sk("h-64") });
