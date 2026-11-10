"use client";
import { useState } from "react";
import Link from "next/link";
import { CEK_OPTIONS, type TxFilter } from "@/lib/realization-filter";
import { inJenis, jenisOfCode, jenisOptions } from "@/lib/belanja";
type Prog = { id: string; code: string; name: string }; type Acc = Prog; type Act = Prog & { program_id: string }; type Sub = Prog & { activity_id: string };
const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Filter Daftar transaksi: dropdown bertingkat Program → Kegiatan → Sub kegiatan, rentang tanggal, dan kontrol kelengkapan. Dikirim sebagai GET (URL dapat dibagikan). */
export function RealizationFilter({ programs, activities, subs, accounts, value, active }: { programs: Prog[]; activities: Act[]; subs: Sub[]; accounts: Acc[]; value: TxFilter; active: boolean }) {
  const [program, setProgram] = useState(value.program), [kegiatan, setKegiatan] = useState(value.kegiatan), [sub, setSub] = useState(value.sub);
  const [jenis, setJenis] = useState(value.jenis), [rekening, setRekening] = useState(value.rekening);
  const jenisList = jenisOptions(accounts.map((a) => a.code)), accList = accounts.filter((a) => inJenis(a.code, jenis));
  const onJenis = (v: string) => { setJenis(v); setRekening(""); };
  const onRekening = (v: string) => { setRekening(v); const a = accounts.find((x) => x.id === v); if (a && !inJenis(a.code, jenis)) setJenis(jenisOfCode(a.code)); else if (a && !jenis) setJenis(jenisOfCode(a.code)); };
  const acts = program ? activities.filter((a) => a.program_id === program) : activities;
  const actIds = new Set(kegiatan ? [kegiatan] : acts.map((a) => a.id));
  const subList = subs.filter((s) => actIds.has(s.activity_id));
  const onProgram = (v: string) => { setProgram(v); setKegiatan(""); setSub(""); };
  const onKegiatan = (v: string) => { setKegiatan(v); setSub(""); if (v) { const a = activities.find((x) => x.id === v); if (a) setProgram(a.program_id); } };
  const onSub = (v: string) => { setSub(v); if (v) { const s = subs.find((x) => x.id === v), a = s && activities.find((x) => x.id === s.activity_id); if (a) { setKegiatan(a.id); setProgram(a.program_id); } } };
  const lbl = "block text-xs font-semibold text-slate-700";
  return (
    <form method="get" action="/realisasi" className="card space-y-3 p-4" aria-label="Filter daftar transaksi">
      <input type="hidden" name="tab" value="daftar" />
      <div className="grid gap-3 md:grid-cols-3">
        <label className={lbl}>Program
          <select name="program" value={program} onChange={(e) => onProgram(e.target.value)} className="mt-1 w-full"><option value="">Semua program</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {short(p.name)}</option>)}</select></label>
        <label className={lbl}>Kegiatan
          <select name="kegiatan" value={kegiatan} onChange={(e) => onKegiatan(e.target.value)} className="mt-1 w-full"><option value="">Semua kegiatan{program ? " pada program ini" : ""}</option>
            {acts.map((a) => <option key={a.id} value={a.id}>{a.code} · {short(a.name)}</option>)}</select></label>
        <label className={lbl}>Sub kegiatan
          <select name="sub" value={sub} onChange={(e) => onSub(e.target.value)} className="mt-1 w-full"><option value="">Semua sub kegiatan{kegiatan || program ? " pada pilihan ini" : ""}</option>
            {subList.map((s) => <option key={s.id} value={s.id}>{s.code} · {short(s.name)}</option>)}</select></label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={lbl}>Jenis belanja
          <select name="jenis" value={jenis} onChange={(e) => onJenis(e.target.value)} className="mt-1 w-full"><option value="">Semua jenis belanja</option>
            {jenisList.map((j) => <option key={j.prefix} value={j.prefix}>{j.level === 2 ? `${j.prefix} · ${j.label} (semua)` : `\u00A0\u00A0${j.prefix} · ${j.label}`}</option>)}</select></label>
        <label className={`${lbl} md:col-span-2`}>Rekening belanja
          <select name="rekening" value={rekening} onChange={(e) => onRekening(e.target.value)} className="mt-1 w-full"><option value="">Semua rekening belanja{jenis ? " pada jenis ini" : ""}</option>
            {accList.map((a) => <option key={a.id} value={a.id}>{a.code} · {short(a.name, 90)}</option>)}</select></label>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className={lbl}>Filter tanggal berdasarkan
          <select name="basis" defaultValue={value.basis} className="mt-1 w-full"><option value="transaksi">Tanggal transaksi</option><option value="spm">Tanggal SPM/SP2D</option></select></label>
        <label className={lbl}>Dari tanggal<input type="date" name="dari" defaultValue={value.from} className="mt-1 w-full" /></label>
        <label className={lbl}>Sampai tanggal<input type="date" name="sampai" defaultValue={value.to} className="mt-1 w-full" /></label>
        <label className={lbl}>Kontrol kelengkapan data
          <select name="cek" defaultValue={value.cek} className="mt-1 w-full">{CEK_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <details className="text-sm" open={!!(value.pay || value.proses)}><summary className="cursor-pointer font-medium text-slate-700">Filter lainnya (pengakuan, proses)</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          <label className={lbl}>Pengakuan
            <select name="pay" defaultValue={value.pay} className="mt-1 w-full"><option value="">Semua</option><option value="sudah">Sudah diakui (ada tanggal SPM/SP2D)</option><option value="belum">Belum diakui (belum ada tanggal)</option></select></label>
          <label className={lbl}>Proses
            <select name="proses" defaultValue={value.proses} className="mt-1 w-full"><option value="">Semua</option><option value="pengadaan">Pengadaan</option><option value="non">Non-pengadaan</option></select></label></div></details>
      <div className="flex flex-wrap items-center gap-2"><button className="btn btn-dark btn-sm">Terapkan filter</button>
        {active && <Link href="/realisasi?tab=daftar" className="btn btn-ghost btn-sm">Reset filter</Link>}
        {active && <span className="text-xs text-slate-600">Filter aktif: ringkasan dan daftar di bawah mengikuti pilihan ini.</span>}</div>
    </form>);
}
