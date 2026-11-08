"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createPackage } from "@/app/(app)/paket/actions";
import type { FormState } from "@/app/(app)/master/actions";
import { formatRupiah } from "@/lib/format";
const cls = "mt-1 w-full";
export type RupInfo = { code: string; name: string; pagu: string; type: string; method: string | null; pptkId: string | null; entries: string[]; hasPackage: boolean };
export type Person = { value: string; label: string };
const Sel = ({ name, label, opts, value, onChange }: { name: string; label: string; opts: Person[]; value?: string; onChange?: (v: string) => void }) => (
  <label className="block text-sm font-medium">{label}<select name={name} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} defaultValue={onChange ? undefined : ""} className={cls}><option value="">(belum ditentukan)</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>);

/** Isi kode RUP: nama paket, pagu, metode, anggaran, dan PPTK tampil otomatis dari data yang sudah ada di sistem. */
export function PackageForm({ rups, ppbj, ppk, pptk, canManage }: { rups: RupInfo[]; ppbj: Person[]; ppk: Person[]; pptk: Person[]; canManage: boolean }) {
  const [s, action, pending] = useActionState<FormState, FormData>(createPackage, {});
  const [code, setCode] = useState(""), [pt, setPt] = useState(""), [touched, setTouched] = useState(false);
  const clean = code.replace(/[\s\u00a0]+/g, "").replace(/\.0+$/, ""), hit = useMemo(() => rups.find((r) => r.code === clean), [rups, clean]);
  const pptkValue = touched ? pt : hit?.pptkId ?? "";
  const only = (l: Person[]) => (l.length === 1 ? l[0]!.value : "");
  return (
    <form action={action} className="grid max-w-3xl gap-3 card p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium">Kode RUP *<input name="rup_code" required value={code} onChange={(e) => { setCode(e.target.value); setTouched(false); }} list="rup-list" autoComplete="off" inputMode="numeric" placeholder="Ketik atau pilih kode RUP" className={cls} /></label>
        <datalist id="rup-list">{rups.filter((r) => !r.hasPackage).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</datalist>
        <p className="mt-1 text-xs text-slate-600">Kode paket sama dengan kode RUP. Data di bawah terisi otomatis setelah kode RUP dikenali.</p>
        {clean && !hit && <p role="alert" className="alert alert-warn mt-2 py-2 text-sm">Kode RUP {clean} belum dikenali pada tahun/tahapan ini. Periksa kodenya atau sinkronkan RUP lebih dulu.</p>}
        {hit?.hasPackage && <p role="alert" className="alert alert-warn mt-2 py-2 text-sm">Kode RUP {hit.code} sudah memiliki paket. Buka paketnya di daftar paket untuk mengubah.</p>}
      </div>
      {hit && !hit.hasPackage && (
        <dl className="grid gap-x-6 gap-y-1 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3 text-sm sm:col-span-2 sm:grid-cols-2" aria-live="polite">
          <div className="sm:col-span-2"><dt className="text-xs text-slate-600">Nama paket</dt><dd className="font-semibold">{hit.name}</dd></div>
          <div><dt className="text-xs text-slate-600">Pagu</dt><dd className="font-semibold tabular-nums">{formatRupiah(hit.pagu)}</dd></div>
          <div><dt className="text-xs text-slate-600">Jenis / metode pemilihan</dt><dd>{hit.type}{hit.method ? ` · ${hit.method}` : ""}</dd></div>
          {!!hit.entries.length && <div className="sm:col-span-2"><dt className="text-xs text-slate-600">Anggaran (subkegiatan / rekening)</dt><dd className="text-xs">{hit.entries.join("; ")}</dd></div>}
        </dl>)}
      <Sel name="pptk_id" label="PPTK" opts={pptk} value={pptkValue} onChange={(v) => { setTouched(true); setPt(v); }} />
      <Sel name="ppk_id" label="PPK" opts={ppk} value={undefined} />
      <Sel name="ppbj_id" label="PPBJ (pejabat pengadaan)" opts={ppbj} value={undefined} />
      <label className="block text-sm font-medium">Target selesai (tenggat)<input type="date" name="due_date" className={cls} /><span className="mt-1 block text-xs font-normal text-slate-600">Boleh kosong. Tanggal mulai dan selesai proses terisi otomatis saat status paket diubah.</span></label>
      {s.error && <p role="alert" className="alert alert-error sm:col-span-2">{s.error}</p>}
      <div className="sm:col-span-2"><button disabled={pending || !hit || hit.hasPackage} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan paket"}</button>
        <Link href="/paket" className="link ml-3 text-sm">Kembali</Link>
        {canManage && <Link href="/master/pejabat" className="link ml-3 text-sm">Kelola nama &amp; NIP pejabat</Link>}
        {!only(ppk) && !ppk.length && <span className="ml-3 text-xs text-slate-500">Belum ada data PPK: tambahkan di Master data &gt; Pejabat.</span>}</div>
    </form>);
}
