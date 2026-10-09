"use client";
import { useTransition, useState } from "react";
import { setBudgetContext } from "@/app/actions";
type Opt = { id: string; label: string };
export function ContextPicker({ years, stages, yearId, stageId }: { years: Opt[]; stages: Opt[]; yearId: string; stageId: string }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const change = (y: string, s: string) => start(async () => { const r = await setBudgetContext(y, s); setErr(r.error ?? ""); });
  const cls = "rounded border border-white/30 bg-navy-700 px-2 py-1 text-sm text-white";
  return (
    <div className="flex items-center gap-2" aria-busy={pending}>
      <label className="text-sm text-white/80">Tahun <select className={cls} value={yearId} onChange={(e) => change(e.target.value, stageId)}>{years.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      <label className="text-sm text-white/80">Tahapan <select className={cls} value={stageId} onChange={(e) => change(yearId, e.target.value)}>{stages.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      {err && <span role="alert" className="text-xs text-red-200">{err}</span>}
    </div>
  );
}
