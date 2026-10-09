"use client";
import { useActionState } from "react";
import { createPackage } from "@/app/(app)/paket/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
const cls = "mt-1 w-full";
const Sel = ({ name, label, opts }: { name: string; label: string; opts: Opt[] }) => (
  <label className="block text-sm font-medium">{label}<select name={name} className={cls}><option value="">(belum ditentukan)</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>);
export function PackageForm({ methods, ppbj, ppk, pptk }: { methods: Opt[]; ppbj: Opt[]; ppk: Opt[]; pptk: Opt[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(createPackage, {});
  return (
    <form action={action} className="grid max-w-3xl gap-3 card p-4 sm:grid-cols-2">
      <label className="block text-sm font-medium">Kode paket *<input name="internal_code" required className={cls} /></label>
      <label className="block text-sm font-medium">Pagu paket (Rp) *<input name="pagu" required inputMode="decimal" className={cls} /></label>
      <label className="block text-sm font-medium sm:col-span-2">Nama paket *<input name="name" required className={cls} /></label>
      <label className="block text-sm font-medium">Cara pelaksanaan<select name="execution_mode" className={cls}><option value="penyedia">Melalui penyedia</option><option value="swakelola">Swakelola</option></select></label>
      <Sel name="method_id" label="Metode pemilihan" opts={methods} />
      <Sel name="ppbj_id" label="PPBJ" opts={ppbj} /><Sel name="ppk_id" label="PPK" opts={ppk} /><Sel name="pptk_id" label="PPTK" opts={pptk} />
      <label className="block text-sm font-medium">Tanggal penugasan<input type="date" name="assigned_date" className={cls} /></label>
      <label className="block text-sm font-medium">Tenggat<input type="date" name="due_date" className={cls} /></label>
      {s.error && <p role="alert" className="alert alert-error sm:col-span-2">{s.error}</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan paket"}</button>
        <a href="/paket" className="link ml-3 text-sm">Kembali</a></div>
    </form>);
}
