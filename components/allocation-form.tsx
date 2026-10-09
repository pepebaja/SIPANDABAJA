"use client";
import { useActionState } from "react";
import { addAllocation } from "@/app/(app)/rup/[id]/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
const cls = "mt-1 w-full rounded border border-slate-300 px-3 py-2";
export function AllocationForm({ rupId, options }: { rupId: string; options: Opt[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(addAllocation, {});
  return (
    <form action={action} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2">
      <input type="hidden" name="rup_package_id" value={rupId} /><h3 className="font-semibold sm:col-span-2">Tambah alokasi dari rekening anggaran</h3>
      <label className="block text-sm font-medium">Rekening anggaran<select name="budget_entry_id" required className={cls}><option value="">Pilih...</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block text-sm font-medium">Nilai alokasi (Rp)<input name="amount" required inputMode="decimal" className={cls} /></label>
      {s.error && <p role="alert" className="text-sm text-red-800 sm:col-span-2">{s.error}</p>}{s.ok && <p role="status" className="text-sm text-teal-700 sm:col-span-2">Tersimpan.</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-60">{pending ? "Menyimpan..." : "Simpan alokasi"}</button></div>
    </form>);
}
