"use client";
import { useActionState } from "react";
import { saveCashItem } from "@/app/(app)/kas/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
import { MONTHS } from "@/lib/allocations";
const cls = "mt-1 w-full";
export function CashItemForm({ options }: { options: Opt[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveCashItem, {});
  return (
    <form action={action} className="grid gap-3 card p-4 sm:grid-cols-3">
      <h3 className="font-semibold sm:col-span-3">Isi rencana kas (menyimpan ulang bulan yang sama akan memperbarui nilainya)</h3>
      <label className="block text-sm font-medium">Rekening anggaran<select name="budget_entry_id" required className={cls}><option value="">Pilih...</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block text-sm font-medium">Bulan<select name="period_month" className={cls}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
      <label className="block text-sm font-medium">Rencana kas (Rp)<input name="planned_amount" required inputMode="decimal" className={cls} /></label>
      {s.error && <p role="alert" className="alert alert-error sm:col-span-3">{s.error}</p>}{s.ok && <p role="status" className="alert alert-ok sm:col-span-3">Tersimpan.</p>}
      <div className="sm:col-span-3"><button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan"}</button></div>
    </form>);
}
