"use client";
import { useActionState } from "react";
import { createRup } from "@/app/(app)/rup/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
const cls = "mt-1 w-full rounded border border-slate-300 px-3 py-2";
export function RupForm({ methods }: { methods: Opt[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(createRup, {});
  return (
    <form action={action} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-semibold">Tambah paket RUP</h2>
      <label className="block text-sm font-medium">Kode RUP *<input name="rup_code" required className={cls} /></label>
      <label className="block text-sm font-medium">Nama paket *<input name="name" required className={cls} /></label>
      <label className="block text-sm font-medium">Jenis pengadaan<select name="procurement_type" className={cls}><option value="barang">Barang</option><option value="konstruksi">Pekerjaan konstruksi</option><option value="konsultansi">Jasa konsultansi</option><option value="jasa_lainnya">Jasa lainnya</option></select></label>
      <label className="block text-sm font-medium">Metode direncanakan<select name="planned_method_id" className={cls}><option value="">(belum ditentukan)</option>{methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <label className="block text-sm font-medium">Pagu (Rp) *<input name="pagu" required inputMode="decimal" className={cls} /></label>
      {s.error && <p role="alert" className="text-sm text-red-800">{s.error}</p>}{s.ok && <p role="status" className="text-sm text-teal-700">Tersimpan.</p>}
      <button disabled={pending} className="rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-60">{pending ? "Menyimpan..." : "Simpan"}</button>
    </form>);
}
