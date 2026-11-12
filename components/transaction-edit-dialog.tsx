"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveTransaction, removeTransaction } from "@/app/(app)/realisasi/actions";
import type { FormState } from "@/app/(app)/master/actions";
import { parseRupiah } from "@/lib/import/parse";
import { toCents } from "@/lib/money";
import { formatRupiah } from "@/lib/format";
import { checkTransactionInput, payDateOutOfYear } from "@/lib/realization-checks";
import { ConfirmButton } from "@/components/confirm-button";
export type EditRow = { id: string; transaction_date: string; amount: string; payment_date: string | null; payment_number: string | null; description: string | null; rup_code: string | null; method_id: string | null; provider_id: string | null; notes: string | null };
type Opt = { id: string; name: string };
const cls = "mt-1 w-full";

function EditForm({ row, info, methods, providers, year, close }: { row: EditRow; info: string[]; methods: Opt[]; providers: Opt[]; year: number; close: () => void }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveTransaction, {});
  const [d, delAction, deleting] = useActionState<FormState, FormData>(removeTransaction, {});
  const [date, setDate] = useState(row.transaction_date), [amount, setAmount] = useState(parseRupiah(row.amount) ?? row.amount), [payDate, setPayDate] = useState(row.payment_date ?? "");
  const [rup, setRup] = useState(row.rup_code ?? ""), [method, setMethod] = useState(row.method_id ?? ""), [prov, setProv] = useState(row.provider_id ?? "");
  useEffect(() => { if (s.ok || d.ok) close(); }, [s, d, close]);
  const val = parseRupiah(amount), payOut = payDateOutOfYear(payDate, year);
  const checks = checkTransactionInput({ year, date, payDate, hasRup: !!rup.trim(), hasMethod: !!method, hasProvider: !!prov, hasNewProvider: false });
  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={row.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Tanggal transaksi *<input type="date" name="transaction_date" required value={date} onChange={(e) => setDate(e.target.value)} className={cls} /></label>
          <label className="block text-sm font-medium">Nilai (Rp) *<input name="amount" required inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} className={cls} aria-invalid={!!amount && val === null} />
            <span className="text-xs font-normal">{amount && val === null ? <b className="text-red-700">Angka tidak dikenali</b> : val !== null ? <b className={toCents(val) < 0n ? "text-amber-800" : "text-slate-800"}>{toCents(val) < 0n ? "Koreksi " : ""}{formatRupiah(val)}</b> : null}</span></label>
          <label className="block text-sm font-medium">Tanggal SPM/SP2D<input type="date" name="payment_date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={cls} aria-invalid={payOut} />
            <span className="text-xs font-normal text-slate-500">{payOut ? <b className="text-red-700">Harus di tahun anggaran {year}</b> : "Kosongkan bila belum ada: transaksi belum diakui sebagai realisasi."}</span></label>
          <label className="block text-sm font-medium">No SPM/SP2D<input name="payment_number" maxLength={100} defaultValue={row.payment_number ?? ""} autoComplete="off" className={cls} /></label>
          <label className="block text-sm font-medium">Kode RUP<input name="rup_code" maxLength={50} inputMode="numeric" value={rup} onChange={(e) => setRup(e.target.value)} autoComplete="off" className={cls} /><span className="text-xs font-normal text-slate-500">Kosongkan untuk belanja non-pengadaan.</span></label>
          <label className="block text-sm font-medium">Metode pemilihan<select name="method_id" value={method} onChange={(e) => setMethod(e.target.value)} className={cls}><option value="">(kosong / ikut rencana RUP)</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="block text-sm font-medium sm:col-span-2">Penyedia pelaksana<select name="provider_id" value={prov} onChange={(e) => setProv(e.target.value)} className={cls}><option value="">(belum dipilih)</option>{providers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="block text-sm font-medium sm:col-span-2">Uraian / keperluan<input name="description" maxLength={300} defaultValue={row.description ?? ""} autoComplete="off" className={cls} /></label>
          <label className="block text-sm font-medium sm:col-span-2">Catatan<input name="notes" maxLength={500} defaultValue={row.notes ?? ""} autoComplete="off" className={cls} /></label>
        </div>
        {checks.length > 0 && <ul className="space-y-1">{checks.map((c) => <li key={c.text} className={`alert text-sm ${c.level === "warn" ? "alert-warn" : "alert-info"}`}>{c.text}</li>)}</ul>}
        <p className="text-xs text-slate-500">Perubahan langsung berlaku dan tercatat di Log audit. Mengubah tanggal SPM/SP2D dapat memindahkan transaksi ke tahapan anggaran lain. Kolom yang dikosongkan akan dihapus dari transaksi.</p>
        {(s.error || d.error) && <p role="alert" className="alert alert-error">{s.error || d.error}</p>}
        <div className="flex flex-wrap items-center gap-2"><button className="btn btn-primary btn-sm" disabled={pending || payOut || (!!amount && val === null)}>{pending ? "Menyimpan..." : "Simpan perubahan"}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Batal</button></div>
      </form>
      <form action={delAction} className="border-t border-slate-200 pt-3"><input type="hidden" name="id" value={row.id} />
        <ConfirmButton message="Hapus transaksi ini? Tindakan tidak dapat dibatalkan (jejak tetap ada di Log audit)." className="link text-sm text-red-700">{deleting ? "Menghapus..." : "Hapus transaksi ini"}</ConfirmButton></form>
    </div>);
}

/** Tombol "Ubah" yang membuka dialog berisi formulir lengkap; galat tampil di dalam dialog dan filter/halaman daftar tetap. */
export function TransactionEditDialog({ row, info, methods, providers, year }: { row: EditRow; info: string[]; methods: Opt[]; providers: Opt[]; year: number }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-haspopup="dialog">Ubah</button>
      <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby={`ed-${row.id}`} className="w-[min(40rem,94vw)] rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40">
        {open && <div className="space-y-3 p-5"><div><h2 id={`ed-${row.id}`} className="font-semibold">Ubah transaksi</h2>{info.map((t) => <p key={t} className="text-xs text-slate-600">{t}</p>)}</div>
          <EditForm row={row} info={info} methods={methods} providers={providers} year={year} close={() => setOpen(false)} /></div>}
      </dialog>
    </>);
}
