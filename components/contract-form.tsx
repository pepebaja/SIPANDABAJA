"use client";
import { useActionState } from "react";
import { addContract } from "@/app/(app)/paket/[id]/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
const cls = "mt-1 w-full rounded border border-slate-300 px-3 py-2";
export function ContractForm({ packageId, providers }: { packageId: string; providers: Opt[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(addContract, {});
  return (
    <form action={action} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2">
      <input type="hidden" name="package_id" value={packageId} />
      <h3 className="font-semibold sm:col-span-2">Catat kontrak / SPK / Surat Pesanan</h3>
      <label className="block text-sm font-medium">Bentuk dokumen<select name="doc_type" className={cls}><option value="kontrak">Kontrak</option><option value="spk">SPK</option><option value="surat_pesanan">Surat Pesanan</option></select></label>
      <label className="block text-sm font-medium">Penyedia<select name="provider_id" className={cls}><option value="">(tidak ada / swakelola)</option>{providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
      <label className="block text-sm font-medium">Nomor dokumen<input name="doc_number" className={cls} /></label>
      <label className="block text-sm font-medium">Tanggal dokumen<input type="date" name="doc_date" className={cls} /></label>
      <label className="block text-sm font-medium">Nilai hasil pemilihan (Rp)<input name="selection_result_value" inputMode="decimal" className={cls} /></label>
      <label className="block text-sm font-medium">Nilai kontrak/SP (Rp)<input name="contract_value" inputMode="decimal" className={cls} /></label>
      {s.error && <p role="alert" className="text-sm text-red-800 sm:col-span-2">{s.error}</p>}
      {s.warning && <p role="alert" className="text-sm text-amber-900 sm:col-span-2">Peringatan: {s.warning}</p>}{s.ok && <p role="status" className="text-sm text-teal-700 sm:col-span-2">Tersimpan.</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-60">{pending ? "Menyimpan..." : "Simpan dokumen"}</button></div>
    </form>);
}
