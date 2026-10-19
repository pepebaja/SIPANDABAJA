"use client";
import { useActionState } from "react";
import { createRup, updateRup } from "@/app/(app)/rup/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
const cls = "mt-1 w-full";
export type RupInitial = { id: string; rup_code: string; name: string; procurement_type: string; planned_method_id: string | null; pagu: string };
/** Tanpa `initial` = tambah paket baru; dengan `initial` = ubah paket yang ada. */
export function RupForm({ methods, initial }: { methods: Opt[]; initial?: RupInitial }) {
  const [s, action, pending] = useActionState<FormState, FormData>(initial ? updateRup : createRup, {});
  return (
    <form action={action} className="space-y-3 card p-4" key={initial ? `${initial.id}:${initial.pagu}:${initial.name}` : "new"}>
      <h2 className="font-semibold">{initial ? "Ubah data paket RUP" : "Tambah paket RUP"}</h2>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="block text-sm font-medium">Kode RUP *<input name="rup_code" required defaultValue={initial?.rup_code} className={cls} /></label>
      <label className="block text-sm font-medium">Nama paket *<input name="name" required defaultValue={initial?.name} className={cls} /></label>
      <label className="block text-sm font-medium">Jenis pengadaan<select name="procurement_type" defaultValue={initial?.procurement_type ?? "barang"} className={cls}><option value="barang">Barang</option><option value="konstruksi">Pekerjaan konstruksi</option><option value="konsultansi">Jasa konsultansi</option><option value="jasa_lainnya">Jasa lainnya</option></select></label>
      <label className="block text-sm font-medium">Metode direncanakan<select name="planned_method_id" defaultValue={initial?.planned_method_id ?? ""} className={cls}><option value="">(belum ditentukan)</option>{methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <label className="block text-sm font-medium">Pagu (Rp) *<input name="pagu" required inputMode="decimal" defaultValue={initial?.pagu} className={cls} /></label>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.ok && <p role="status" className="alert alert-ok">Tersimpan.</p>}
      {s.warning && <p role="status" className="alert alert-warn">{s.warning}</p>}
      <button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : initial ? "Simpan perubahan" : "Simpan"}</button>
    </form>);
}
