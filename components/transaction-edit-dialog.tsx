"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveTransaction, removeTransaction } from "@/app/(app)/realisasi/actions";
import type { FormState } from "@/app/(app)/master/actions";
import { parseRupiah } from "@/lib/import/parse";
import { toCents } from "@/lib/money";
import { formatRupiah } from "@/lib/format";
import { checkTransactionInput, payDateOutOfYear } from "@/lib/realization-checks";
import { ConfirmButton } from "@/components/confirm-button";
export type EditRow = { id: string; transaction_date: string; amount: string; payment_date: string | null; payment_number: string | null; description: string | null; contract_id: string | null; rup_code: string | null; method_id: string | null; provider_id: string | null; notes: string | null };
type Opt = { id: string; name: string };
type CO = { id: string; label: string; value: string | null; paid: string; remaining: string | null };
const cls = "";

function EditForm({ row, info, methods, providers, contracts, year, close }: { row: EditRow; info: string[]; methods: Opt[]; providers: Opt[]; contracts: CO[]; year: number; close: () => void }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveTransaction, {});
  const [d, delAction, deleting] = useActionState<FormState, FormData>(removeTransaction, {});
  const [date, setDate] = useState(row.transaction_date), [amount, setAmount] = useState(parseRupiah(row.amount) ?? row.amount), [payDate, setPayDate] = useState(row.payment_date ?? "");
  const [rup, setRup] = useState(row.rup_code ?? ""), [method, setMethod] = useState(row.method_id ?? ""), [prov, setProv] = useState(row.provider_id ?? "");
  useEffect(() => { if (s.ok || d.ok) close(); }, [s, d, close]);
  const val = parseRupiah(amount), payOut = payDateOutOfYear(payDate, year);
  const checks = checkTransactionInput({ year, date, payDate, hasRup: !!rup.trim(), hasMethod: !!method, hasProvider: !!prov, hasNewProvider: false });
  return (
    <>
      <form action={action} className="dlg-form">
        <input type="hidden" name="id" value={row.id} />
        <div className="dlg-body">
          <section><h3 className="fsec">Tanggal dan nilai</h3>
            <div className="fgrid">
              <label className="fld">Tanggal transaksi *<input type="date" name="transaction_date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="fld">Nilai (Rp) *<input name="amount" required inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!amount && val === null} className="tabular-nums" />
                <span className="fh">{amount && val === null ? <b className="text-red-700">Angka tidak dikenali</b> : val !== null ? <b className={toCents(val) < 0n ? "text-amber-800" : "text-slate-800"}>{toCents(val) < 0n ? "Koreksi " : ""}{formatRupiah(val)}</b> : null}</span></label>
              <label className="fld">Tanggal SPM/SP2D<input type="date" name="payment_date" value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-invalid={payOut} />
                <span className="fh">{payOut ? <b className="text-red-700">Harus di tahun anggaran {year}</b> : "Kosongkan bila belum ada (belum diakui sebagai realisasi)."}</span></label>
              <label className="fld">No SPM/SP2D<input name="payment_number" maxLength={100} defaultValue={row.payment_number ?? ""} autoComplete="off" /></label>
            </div></section>
          <section><h3 className="fsec">Pengadaan</h3>
            <div className="fgrid">
              <label className="fld">Kode RUP<input name="rup_code" maxLength={50} inputMode="numeric" value={rup} onChange={(e) => setRup(e.target.value)} autoComplete="off" /><span className="fh">Kosongkan untuk belanja non-pengadaan.</span></label>
              <label className="fld">Metode pemilihan<select name="method_id" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">(kosong / ikut rencana RUP)</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
              <label className="fld fwide">Penyedia pelaksana<select name="provider_id" value={prov} onChange={(e) => setProv(e.target.value)}><option value="">(belum dipilih)</option>{providers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
              {contracts.length > 0 && <label className="fld fwide">Dokumen kontrak/SP<select name="contract_id" defaultValue={row.contract_id ?? ""}><option value="">(tidak ditautkan ke dokumen)</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.label}{c.value ? ` · nilai ${formatRupiah(c.value)}` : ""}{c.remaining !== null ? ` · sisa ${formatRupiah(c.remaining)}` : ""}</option>)}</select></label>}
            </div></section>
          <section><h3 className="fsec">Keterangan</h3>
            <div className="fgrid">
              <label className="fld fwide">Uraian / keperluan<input name="description" maxLength={300} defaultValue={row.description ?? ""} autoComplete="off" /></label>
              <label className="fld fwide">Catatan<input name="notes" maxLength={500} defaultValue={row.notes ?? ""} autoComplete="off" /></label>
            </div></section>
          {checks.length > 0 && <ul className="space-y-2" aria-label="Pemeriksaan isian">{checks.map((c) => <li key={c.text} className={`alert text-sm ${c.level === "warn" ? "alert-warn" : "alert-info"}`}>{c.text}</li>)}</ul>}
          {(s.error || d.error) && <p role="alert" className="alert alert-error">{s.error || d.error}</p>}
        </div>
        <div className="dlg-foot">
          <p className="max-w-xs text-xs leading-snug text-slate-500">Perubahan langsung berlaku dan tercatat di Log audit. Mengubah tanggal SPM/SP2D dapat memindahkan transaksi ke tahapan lain; kolom yang dikosongkan dihapus.</p>
          <div className="flex gap-2"><button type="button" className="btn btn-ghost btn-sm" onClick={close}>Batal</button>
            <button className="btn btn-primary btn-sm" disabled={pending || payOut || (!!amount && val === null)}>{pending ? "Menyimpan..." : "Simpan perubahan"}</button></div>
        </div>
      </form>
      <form action={delAction} className="dlg-danger"><input type="hidden" name="id" value={row.id} />
        <ConfirmButton message="Hapus transaksi ini? Tindakan tidak dapat dibatalkan (jejak tetap ada di Log audit)." className="link text-sm text-red-700">{deleting ? "Menghapus..." : "Hapus transaksi ini"}</ConfirmButton></form>
    </>);
}

/** Tombol "Ubah" yang membuka dialog berisi formulir lengkap; galat tampil di dalam dialog dan filter/halaman daftar tetap. */
export function TransactionEditDialog({ row, info, methods, providers, contracts, year }: { row: EditRow; info: string[]; methods: Opt[]; providers: Opt[]; contracts: CO[]; year: number }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-haspopup="dialog">Ubah</button>
      <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby={`ed-${row.id}`} className="dlg">
        {open && <>
          <header className="dlg-head"><h2 id={`ed-${row.id}`} className="font-display text-lg font-bold text-navy-800">Ubah transaksi</h2>
            <div className="mt-1.5 space-y-0.5">{info.map((t) => <p key={t} className="text-xs leading-snug text-slate-600">{t}</p>)}</div>
            <button type="button" className="dlg-close" onClick={() => setOpen(false)} aria-label="Tutup">×</button></header>
          <EditForm row={row} info={info} methods={methods} providers={providers} contracts={contracts} year={year} close={() => setOpen(false)} /></>}
      </dialog>
    </>);
}
