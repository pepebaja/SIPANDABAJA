"use client";
import { useActionState, useMemo, useState } from "react";
import { addTransaction } from "@/app/(app)/realisasi/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { FormEntry, FormMethod, FormRup } from "@/lib/server/realization-form-data";
import { computeLimits, quarterOfDate } from "@/lib/realization-limits";
import { QUARTER_SHORT } from "@/lib/cash";
import { parseRupiah } from "@/lib/import/parse";
import { fromCents, toCents } from "@/lib/money";
import { formatRupiah } from "@/lib/format";
const cls = "mt-1 w-full";
const ENTRY_CAP = 300;
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);   // WIB
const hit = (hay: string, q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.toLowerCase().includes(w));

/** Input Realisasi terpadu: pilih RUP (opsional) dan rekening dari arsip anggaran; sisa pagu RUP, pagu rekening, dan kas kumulatif tampil langsung. */
export function TransactionForm({ year, entries, rups, methods, allocByRup, hasCashPlan }: { year: number; entries: FormEntry[]; rups: FormRup[]; methods: FormMethod[]; allocByRup: Record<string, string[]>; hasCashPlan: boolean }) {
  const [s, action, pending] = useActionState<FormState, FormData>(addTransaction, {});
  const [rupId, setRupId] = useState(""), [entryId, setEntryId] = useState(""), [date, setDate] = useState(today), [amount, setAmount] = useState(""), [methodId, setMethodId] = useState(""), [methodTouched, setMethodTouched] = useState(false);
  const [qRup, setQRup] = useState(""), [qEntry, setQEntry] = useState("");
  const rup = rups.find((r) => r.id === rupId) ?? null, entry = entries.find((e) => e.id === entryId) ?? null;
  const allocated = useMemo(() => new Set(rupId ? allocByRup[rupId] ?? [] : []), [rupId, allocByRup]);
  const rupOpts = useMemo(() => rups.filter((r) => r.id === rupId || hit(`${r.code} ${r.name}`, qRup)).slice(0, ENTRY_CAP), [rups, qRup, rupId]);
  const entryOpts = useMemo(() => entries.filter((e) => e.id === entryId || hit(`${e.sub} ${e.acc} ${e.desc} ${e.fund} ${e.pptk}`, qEntry))
    .sort((a, b) => Number(allocated.has(b.id)) - Number(allocated.has(a.id))).slice(0, ENTRY_CAP), [entries, qEntry, entryId, allocated]);
  const q = quarterOfDate(date, year), outOfYear = !!date && Number(date.slice(0, 4)) !== year;
  const lim = entry && q ? computeLimits(entry, q, rup) : null;
  const val = parseRupiah(amount), isPayment = val !== null && toCents(val) > 0n, over = isPayment && lim && toCents(val!) > toCents(lim.max);
  const method = methodTouched ? methodId : (rup?.methodId ?? methodId);        // metode mengikuti rencana RUP sampai diubah pengguna
  const f = (v: string) => formatRupiah(v);
  return (
    <form action={action} className="card space-y-4 p-4">
      <h2 className="font-semibold">Catat realisasi <span className="text-xs font-normal text-slate-500">(masuk sebagai belum diverifikasi)</span></h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1"><label className="block text-sm font-medium">1. Kode RUP <span className="font-normal text-slate-500">(kosongkan bila belanja non-pengadaan)</span></label>
          <input value={qRup} onChange={(e) => setQRup(e.target.value)} placeholder="Cari kode atau nama RUP" className="w-full py-1.5" aria-label="Cari RUP" />
          <select name="rup_package_id" value={rupId} onChange={(e) => { setRupId(e.target.value); setMethodTouched(false); }} className="w-full"><option value="">(tanpa RUP)</option>{rupOpts.map((r) => <option key={r.id} value={r.id}>{r.code} - {r.name} (sisa {f(fromCents(toCents(r.pagu) - toCents(r.realized)))})</option>)}</select>
          {rup && <p className="text-xs text-slate-600">Pagu RUP {f(rup.pagu)}; sudah terealisasi {f(rup.realized)}. Kode RUP yang sama boleh dipakai berulang selama pagu RUP mencukupi.</p>}</div>
        <div className="space-y-1"><label className="block text-sm font-medium">2. Rekening anggaran *{rupId && allocated.size > 0 && <span className="font-normal text-slate-500"> (★ = teralokasi untuk RUP ini)</span>}</label>
          <input value={qEntry} onChange={(e) => setQEntry(e.target.value)} placeholder="Cari sub kegiatan, rekening, uraian, PPTK" className="w-full py-1.5" aria-label="Cari rekening" />
          <select name="budget_entry_id" required value={entryId} onChange={(e) => setEntryId(e.target.value)} className="w-full"><option value="">Pilih rekening...</option>
            {entryOpts.map((e) => <option key={e.id} value={e.id}>{allocated.has(e.id) ? "★ " : ""}{e.sub.split(" ")[0]} / {e.acc.split(" ")[0]}: {e.desc}</option>)}</select>
          {(qEntry || qRup) && <p className="text-xs text-slate-500">Menampilkan maks. {ENTRY_CAP} hasil pencarian.</p>}</div>
      </div>
      {entry && (
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
          <p><span className="text-slate-500">Program:</span> {entry.prog}</p><p><span className="text-slate-500">Kegiatan:</span> {entry.act}</p>
          <p><span className="text-slate-500">Sub kegiatan:</span> {entry.sub}</p><p><span className="text-slate-500">Rekening:</span> {entry.acc}</p>
          <p><span className="text-slate-500">Sumber dana:</span> {entry.fund}</p><p><span className="text-slate-500">PPTK:</span> {entry.pptk}</p>
          <p><span className="text-slate-500">Pagu rekening:</span> {f(entry.pagu)}</p>{lim && <p><span className="text-slate-500">Sisa pagu rekening:</span> <b>{f(lim.entryLeft)}</b></p>}
        </div>)}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">3. Tanggal transaksi *<input type="date" name="transaction_date" required value={date} onChange={(e) => setDate(e.target.value)} className={cls} />
          <span className="text-xs font-normal text-slate-500">{outOfYear ? <b className="text-red-700">Harus di tahun anggaran {year}</b> : q ? `Masuk ${QUARTER_SHORT[q - 1]}` : ""}</span></label>
        <label className="block text-sm font-medium">Nilai (Rp) *<input name="amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={cls} aria-invalid={!!over} />
          <span className="text-xs font-normal text-slate-500">{val !== null && toCents(val) < 0n ? <b className="text-amber-800">Nilai minus dicatat sebagai koreksi (mengurangi realisasi)</b> : "Isi minus (-) untuk koreksi/pengurangan"}</span></label>
        <label className="block text-sm font-medium">Metode pemilihan <span className="font-normal text-slate-500">(opsional)</span><select name="procurement_method_id" value={method} onChange={(e) => { setMethodId(e.target.value); setMethodTouched(true); }} className={cls}><option value="">(non-pengadaan / belum ditentukan)</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </div>
      {entry && lim && (
        <div className="space-y-2">
          <div className="overflow-x-auto"><table className="cash-table"><thead><tr><th>Anggaran kas</th>{QUARTER_SHORT.map((t) => <th key={t} className="text-right">{t}</th>)}</tr></thead>
            <tbody><tr><td>Kas triwulan</td>{lim.rows.map((r) => <td key={r.quarter} className="text-right tabular-nums">{f(r.cash)}</td>)}</tr>
              <tr><td>Kas kumulatif</td>{lim.rows.map((r) => <td key={r.quarter} className="text-right tabular-nums">{f(r.cashCum)}</td>)}</tr>
              <tr><td>Realisasi kumulatif</td>{lim.rows.map((r) => <td key={r.quarter} className="text-right tabular-nums">{f(r.realCum)}</td>)}</tr>
              <tr className="font-semibold"><td>Sisa kas kumulatif</td>{lim.rows.map((r) => <td key={r.quarter} className={`text-right tabular-nums ${q === r.quarter ? "bg-cyan-50" : ""}`}>{f(r.left)}</td>)}</tr></tbody></table></div>
          {!hasCashPlan || lim.rows.every((r) => toCents(r.cash) === 0n) ? <p className="alert alert-warn">Anggaran kas rekening ini belum diisi (menu Anggaran kas). Pembayaran akan ditolak sampai kas diisi.</p> : null}
          {isPayment && <p className={`text-sm ${over ? "font-semibold text-red-700" : "text-slate-700"}`}>Maksimal yang dapat dicatat pada {q ? QUARTER_SHORT[q - 1] : "tanggal ini"}: <b>{f(lim.max)}</b> <span className="text-slate-500">(dibatasi oleh {lim.limitedBy === "kas" ? "sisa kas kumulatif" : lim.limitedBy === "pagu" ? "pagu rekening" : "pagu RUP"})</span>{over && " - nilai melebihi batas, akan ditolak."}</p>}
          <p className="text-xs text-slate-500">Sisa dihitung dari semua transaksi tercatat (terverifikasi maupun belum). Kas triwulan berikutnya tidak dapat dipakai untuk triwulan sebelumnya.</p>
        </div>)}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">Tanggal SPM/SP2D <span className="font-normal text-slate-500">(penentu tahapan)</span><input type="date" name="payment_date" className={cls} /></label>
        <label className="block text-sm font-medium">No SPM/SP2D <span className="font-normal text-slate-500">(dapat dilengkapi kemudian)</span><input name="payment_number" maxLength={100} className={cls} /></label>
        <label className="block text-sm font-medium">Catatan<input name="notes" maxLength={500} className={cls} /></label>
      </div>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.ok && <p role="status" className="alert alert-ok">Tersimpan. Sisa pagu dan kas sudah diperbarui.</p>}
      <button disabled={pending || !!over || outOfYear} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan realisasi"}</button>
    </form>);
}
