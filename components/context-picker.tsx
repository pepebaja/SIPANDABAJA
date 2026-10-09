"use client";
import { useTransition, useState } from "react";
import { setBudgetContext } from "@/app/actions";
type Opt = { id: string; label: string };
export function ContextPicker({ years, stages, yearId, stageId }: { years: Opt[]; stages: Opt[]; yearId: string; stageId: string }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const change = (y: string, s: string) => start(async () => { const r = await setBudgetContext(y, s); setErr(r.error ?? ""); });
  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline">Konteks anggaran</span>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">Tahun
        <select className="py-1.5" value={yearId} onChange={(e) => change(e.target.value, stageId)}>{years.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">Tahapan
        <select className="py-1.5" value={stageId} onChange={(e) => change(yearId, e.target.value)}>{stages.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      {pending && <span className="text-xs text-slate-500" role="status">Memuat...</span>}
      {err && <span role="alert" className="text-xs font-medium text-red-700">{err}</span>}
    </div>
  );
}
