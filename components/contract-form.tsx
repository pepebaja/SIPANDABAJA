"use client";
import { useActionState, useState } from "react";
import { addContract } from "@/app/(app)/paket/[id]/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
import { ALL_DOCS, DOC_LABEL, type ContractProfile } from "@/lib/procurement-profile";
const cls = "mt-1 w-full";
/** Formulir kontrak/SP yang menyesuaikan bentuk dokumen, label, dan isian penyedia dengan metode pemilihan paket. */
export function ContractForm({ packageId, providers, profile, methodName, recurring }: { packageId: string; providers: Opt[]; profile: ContractProfile; methodName: string | null; recurring: boolean }) {
  const [s, action, pending] = useActionState<FormState, FormData>(addContract, {});
  const [doc, setDoc] = useState(profile.defaultDoc), other = ALL_DOCS.filter((d) => !profile.docTypes.includes(d));
  return (
    <form action={action} className="grid gap-3 card p-4 sm:grid-cols-2">
      <input type="hidden" name="package_id" value={packageId} />
      <h3 className="font-semibold sm:col-span-2">{recurring ? "Catat dokumen pelaksanaan (kontrak / SP / bukti pembelian)" : "Catat kontrak / SP"} <span className="font-normal text-slate-600">· metode {methodName ?? "belum ditentukan"}</span></h3>
      <p className="alert alert-info text-sm sm:col-span-2">{profile.hint}{recurring && " Paket berulang: catat satu dokumen untuk setiap pelaksanaan dan isi uraiannya."}</p>
      <label className="block text-sm font-medium">Bentuk dokumen<select name="doc_type" value={doc} onChange={(e) => setDoc(e.target.value as typeof doc)} className={cls}>
        {profile.docTypes.map((d) => <option key={d} value={d}>{DOC_LABEL[d]}</option>)}{other.length > 0 && <optgroup label="Bentuk lain (kurang lazim)">{other.map((d) => <option key={d} value={d}>{DOC_LABEL[d]}</option>)}</optgroup>}</select></label>
      {profile.showProvider ? <label className="block text-sm font-medium">Penyedia<select name="provider_id" className={cls}><option value="">(belum dipilih)</option>{providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
        : <div className="text-sm text-slate-600"><input type="hidden" name="provider_id" value="" /><p className="mt-6">Swakelola: tanpa penyedia.</p></div>}
      <label className="block text-sm font-medium">{profile.numberLabel}<input name="doc_number" className={cls} /></label>
      <label className="block text-sm font-medium">{profile.dateLabel}<input type="date" name="doc_date" className={cls} /></label>
      <label className="block text-sm font-medium">{profile.selectionLabel}<input name="selection_result_value" inputMode="decimal" className={cls} /></label>
      <label className="block text-sm font-medium">{profile.valueLabel}<input name="contract_value" inputMode="decimal" className={cls} /></label>
      <label className="block text-sm font-medium sm:col-span-2">{recurring ? "Uraian pelaksanaan (mis. Konsumsi rapat koordinasi 12 Nov / Servis mobil dinas B 1234 XY)" : "Uraian (opsional)"}<input name="description" maxLength={300} className={cls} /></label>
      {s.error && <p role="alert" className="alert alert-error sm:col-span-2">{s.error}</p>}
      {s.warning && <p role="alert" className="alert alert-warn sm:col-span-2">Peringatan: {s.warning}</p>}{s.ok && <p role="status" className="alert alert-ok sm:col-span-2">Tersimpan.</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan dokumen"}</button></div>
    </form>);
}
