"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { deletePackage, updatePackage } from "@/app/(app)/paket/actions";
import type { FormState } from "@/app/(app)/master/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { parseRupiah } from "@/lib/import/parse";
import { formatRupiah } from "@/lib/format";
import { JENIS_LABEL } from "@/lib/procurement-profile";
export type PkgSummary = { count: number; total: string; remaining: string; pct: string | null };
export type PkgRow = { id: string; code: string; name: string; pagu: string; status: string; method_id: string | null; execution_mode: string; procurement_type: string | null; is_recurring: boolean; due_date: string | null; summary?: PkgSummary | null; ppbj_id: string | null; ppk_id: string | null; pptk_id: string | null };
type Opt = { value: string; label: string };
const cls = "mt-1 w-full";

function EditForm({ row, statuses, methods, ppbj, ppk, pptk, close }: { row: PkgRow; statuses: Opt[]; methods: Opt[]; ppbj: Opt[]; ppk: Opt[]; pptk: Opt[]; close: () => void }) {
  const [s, action, pending] = useActionState<FormState, FormData>(updatePackage, {});
  const [pagu, setPagu] = useState(parseRupiah(row.pagu) ?? row.pagu), val = parseRupiah(pagu), [rec, setRec] = useState(row.is_recurring);
  useEffect(() => { if (s.ok) close(); }, [s, close]);
  const sel = (name: string, v: string | null, opts: Opt[], empty: string) => <select name={name} defaultValue={v ?? ""} className={cls}><option value="">{empty}</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={row.id} />
      {row.is_recurring && row.summary && <div className={`rounded-xl border p-3 text-sm ${Number(row.summary.pct ?? 0) >= 100 ? "border-red-300 bg-red-50" : Number(row.summary.pct ?? 0) >= 80 ? "border-amber-300 bg-amber-50" : "border-cyan-200 bg-cyan-50/60"}`} aria-label="Ringkasan pelaksanaan">
        <p className="font-semibold">Ringkasan pelaksanaan (paket berulang)</p><p><b>{row.summary.count}</b> pelaksanaan · terpakai <b>{formatRupiah(row.summary.total)}</b>{row.summary.pct !== null && <> ({row.summary.pct.replace(".", ",")}% dari pagu)</>} · sisa pagu <b>{formatRupiah(row.summary.remaining)}</b>{Number(row.summary.pct ?? 0) >= 80 && <b> · pagu menipis, periksa kebutuhan sampai akhir tahun</b>}</p></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">Nama paket *<input name="name" required maxLength={300} defaultValue={row.name} className={cls} /></label>
        <label className="block text-sm font-medium">Pagu paket (Rp) *<input name="pagu" required inputMode="decimal" autoComplete="off" value={pagu} onChange={(e) => setPagu(e.target.value)} className={cls} aria-invalid={!!pagu && val === null} />
          <span className="text-xs font-normal">{pagu && val === null ? <b className="text-red-700">Angka tidak dikenali</b> : val !== null ? <b>{formatRupiah(val)}</b> : null}</span></label>
        <label className="block text-sm font-medium">Status{<select name="status" required defaultValue={row.status} className={cls}>{statuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}</label>
        <label className="block text-sm font-medium">Metode pemilihan{sel("method_id", row.method_id, methods, "(belum ditentukan)")}</label>
        <label className="block text-sm font-medium">Jenis pengadaan<select name="procurement_type" defaultValue={row.procurement_type ?? "jasa_lainnya"} className={cls}>{Object.entries(JENIS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="block text-sm font-medium">Mode pelaksanaan<select name="execution_mode" defaultValue={row.execution_mode} className={cls}><option value="penyedia">Penyedia</option><option value="swakelola">Swakelola</option></select></label>
        {rec ? <div className="text-sm text-slate-600"><input type="hidden" name="due_date" value="" /><p className="mt-6">Paket berulang: tanpa tenggat tunggal.</p></div> : <label className="block text-sm font-medium">Tenggat<input type="date" name="due_date" defaultValue={row.due_date ?? ""} className={cls} /></label>}
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_recurring" checked={rec} onChange={(e) => setRec(e.target.checked)} className="mt-1" /><span><b>Paket berulang</b> (dibelanjakan berkali-kali, mis. konsumsi rapat, pemeliharaan kendaraan): banyak pelaksanaan, kontrak/SP, dan pembayaran di bawah satu kode RUP.</span></label>
        <label className="block text-sm font-medium">PPBJ{sel("ppbj_id", row.ppbj_id, ppbj, "(belum dipilih)")}</label>
        <label className="block text-sm font-medium">PPK{sel("ppk_id", row.ppk_id, ppk, "(belum dipilih)")}</label>
        <label className="block text-sm font-medium">PPTK{sel("pptk_id", row.pptk_id, pptk, "(belum dipilih)")}</label>
      </div>
      <p className="text-xs text-slate-500">Kode paket = kode RUP <b>{row.code}</b> (tidak diubah di sini). Mengubah pagu paket tidak mengubah pagu RUP atau anggaran. Isian pejabat/tenggat yang dikosongkan akan dihapus.</p>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending || (!!pagu && val === null)}>{pending ? "Menyimpan..." : "Simpan perubahan"}</button><button type="button" className="btn btn-ghost btn-sm" onClick={close}>Batal</button></div>
    </form>);
}

/** Tombol Ubah (dialog formulir lengkap) dan Hapus (dengan konfirmasi) pada setiap baris daftar paket. Galat tampil di tempat. */
export function PackageRowActions({ row, statuses, methods, ppbj, ppk, pptk }: { row: PkgRow; statuses: Opt[]; methods: Opt[]; ppbj: Opt[]; ppk: Opt[]; pptk: Opt[] }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDialogElement>(null), [d, delAction, deleting] = useActionState<FormState, FormData>(deletePackage, {});
  useEffect(() => { const el = ref.current; if (!el) return; if (open && !el.open) el.showModal(); if (!open && el.open) el.close(); }, [open]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Ubah paket ${row.code}`}>Ubah</button>
      <form action={delAction}><input type="hidden" name="id" value={row.id} />
        <ConfirmButton message={`Hapus paket ${row.code} - ${row.name}? Riwayat status paket ikut terhapus (jejak tetap ada di Log audit). Paket yang sudah punya transaksi atau kontrak tidak dapat dihapus.`} className="btn btn-danger btn-sm">{deleting ? "Menghapus..." : "Hapus"}</ConfirmButton></form>
      {d.error && <p role="alert" className="basis-full max-w-64 text-xs text-red-700">{d.error}</p>}
      <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby={`pk-${row.id}`} className="w-[min(42rem,94vw)] rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40">
        {open && <div className="space-y-3 p-5"><h2 id={`pk-${row.id}`} className="font-semibold">Ubah paket {row.code}</h2><EditForm row={row} statuses={statuses} methods={methods} ppbj={ppbj} ppk={ppk} pptk={pptk} close={() => setOpen(false)} /></div>}
      </dialog>
    </div>);
}
