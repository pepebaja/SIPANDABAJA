"use client";
import { useActionState } from "react";
import { addTransaction } from "@/app/(app)/realisasi/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { Opt } from "@/lib/masters";
import { DOC_TYPES, KINDS } from "@/lib/transactions";
const cls = "mt-1 w-full";
export function TransactionForm({ entries, packages }: { entries: Opt[]; packages: Opt[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(addTransaction, {});
  return (
    <form action={action} className="grid gap-3 card p-4 sm:grid-cols-3">
      <h3 className="font-semibold sm:col-span-3">Catat transaksi (masuk sebagai belum diverifikasi)</h3>
      <label className="block text-sm font-medium sm:col-span-2">Rekening anggaran *<select name="budget_entry_id" required className={cls}><option value="">Pilih...</option>{entries.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block text-sm font-medium">Paket terkait<select name="procurement_package_id" className={cls}><option value="">(tanpa paket)</option>{packages.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="block text-sm font-medium">Jenis transaksi<select name="kind" className={cls}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="block text-sm font-medium">Jenis dokumen<select name="doc_type" className={cls}>{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="block text-sm font-medium">Nomor dokumen<input name="doc_number" className={cls} /></label>
      <label className="block text-sm font-medium">Tanggal dokumen<input type="date" name="doc_date" className={cls} /></label>
      <label className="block text-sm font-medium">Tanggal transaksi *<input type="date" name="transaction_date" required className={cls} /></label>
      <label className="block text-sm font-medium">Nilai (Rp, isi positif) *<input name="amount" required inputMode="decimal" className={cls} /></label>
      <label className="block text-sm font-medium sm:col-span-3">Catatan<input name="notes" className={cls} /></label>
      {s.error && <p role="alert" className="alert alert-error sm:col-span-3">{s.error}</p>}
      {s.warning && <p role="alert" className="alert alert-warn sm:col-span-3">Peringatan: {s.warning}</p>}{s.ok && <p role="status" className="alert alert-ok sm:col-span-3">Tersimpan.</p>}
      <div className="sm:col-span-3"><button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan transaksi"}</button></div>
    </form>);
}
