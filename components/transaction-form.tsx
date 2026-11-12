"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addTransaction } from "@/app/(app)/realisasi/actions";
import type { FormState } from "@/app/(app)/master/actions";
import type { FormEntry, FormMethod, FormProvider, FormRup, StageData } from "@/lib/server/realization-form-data";
import { quarterOf, QUARTER_MONTHS, type StageWindow } from "@/lib/stage-rule";
import { checkTransactionInput, payDateOutOfYear } from "@/lib/realization-checks";
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
export function TransactionForm({ year, entries, rups, methods, providers, allocByRup, hasCashPlan, windows, stageData, currentStageId, prefill }: { year: number; entries: FormEntry[]; rups: FormRup[]; methods: FormMethod[]; providers: FormProvider[]; allocByRup: Record<string, string[]>; hasCashPlan: boolean; windows: StageWindow[]; stageData: Record<string, StageData>; currentStageId: string; prefill?: { rupCode?: string; description?: string } }) {
  const [s, action, pending] = useActionState<FormState, FormData>(addTransaction, {});
  const [rupId, setRupId] = useState(() => (prefill?.rupCode ? (rups.find((r) => r.code === prefill.rupCode)?.id ?? "") : "")), [entryId, setEntryId] = useState(""), [date, setDate] = useState(today), [amount, setAmount] = useState(""), [methodId, setMethodId] = useState(""), [methodTouched, setMethodTouched] = useState(false);
  const [qRup, setQRup] = useState(""), [qEntry, setQEntry] = useState(""), [qProv, setQProv] = useState("");
  const [providerId, setProviderId] = useState(""), [provTouched, setProvTouched] = useState(false), [newProv, setNewProv] = useState("");
  const [payDate, setPayDate] = useState(""), [payNo, setPayNo] = useState(""), [notes, setNotes] = useState(""), [desc, setDesc] = useState(prefill?.description ?? "");
  const amountRef = useRef<HTMLInputElement>(null);
  // Setelah tersimpan: kosongkan isian yang khas per transaksi, pertahankan RUP/rekening/tanggal/metode/penyedia untuk input berikutnya.
  useEffect(() => { if (s.ok) { setAmount(""); setPayDate(""); setPayNo(""); setNotes(""); setDesc(""); amountRef.current?.focus(); } }, [s]);
  const rup = rups.find((r) => r.id === rupId) ?? null, entry = entries.find((e) => e.id === entryId) ?? null;
  const allocated = useMemo(() => new Set(rupId ? allocByRup[rupId] ?? [] : []), [rupId, allocByRup]);
  const rupOpts = useMemo(() => rups.filter((r) => r.id === rupId || hit(`${r.code} ${r.name}`, qRup)).slice(0, ENTRY_CAP), [rups, qRup, rupId]);
  const entryOpts = useMemo(() => entries.filter((e) => e.id === entryId || hit(`${e.sub} ${e.acc} ${e.desc} ${e.fund} ${e.pptk}`, qEntry))
    .sort((a, b) => Number(allocated.has(b.id)) - Number(allocated.has(a.id))).slice(0, ENTRY_CAP), [entries, qEntry, entryId, allocated]);
  // Tanggal acuan = Tanggal SPM/SP2D bila diisi, jika belum = tanggal transaksi. Tahapan = tahapan dengan tanggal penetapan terakhir <= tanggal acuan;
  // triwulan dari tanggal acuan. Batas kas memakai anggaran kas TAHAPAN itu, bukan tahapan yang sedang dipilih di layar.
  const refDate = payDate || date, q = year ? (Number(refDate.slice(0, 4)) === year ? quarterOf(refDate) : null) : null, outOfYear = !!date && Number(date.slice(0, 4)) !== year;
  const stageW = windows.find((w) => refDate >= w.start && refDate <= w.end) ?? null, sd = stageW ? stageData[stageW.id] : undefined, sl = entry && sd ? sd.entries[entry.id] : null;
  const stageEntry = entry && sl ? { ...entry, pagu: sl.pagu, cash: sl.cash, realized: sl.realized } : null;
  const stageRup = rup && stageW ? (sd?.rups[rup.code] ?? null) : null;
  const lim = stageEntry && q ? computeLimits(stageEntry, q, rup ? (stageRup ?? { pagu: rup.pagu, realized: rup.realized }) : null) : null;
  const noStageMatch = !!entry && !!stageW && !sl, noStageRup = !!rup && !!stageW && !stageRup;
  const val = parseRupiah(amount), isPayment = val !== null && toCents(val) > 0n, over = isPayment && lim && toCents(val!) > toCents(lim.max);
  const method = methodTouched ? methodId : (rup?.methodId ?? methodId);        // metode mengikuti rencana RUP sampai diubah pengguna
  const provider = provTouched ? providerId : (rup?.providerId ?? providerId);          // penyedia mengikuti kontrak paket RUP sampai diubah pengguna
  const provOpts = useMemo(() => providers.filter((p) => p.id === provider || hit(p.name, qProv)).slice(0, ENTRY_CAP), [providers, qProv, provider]);
  const payOut = payDateOutOfYear(payDate, year);
  const checks = checkTransactionInput({ year, date, payDate, hasRup: !!rupId, hasMethod: !!method, hasProvider: !!provider, hasNewProvider: !provider && newProv.trim().length >= 3 });
  const f = (v: string) => formatRupiah(v);
  return (
    <form action={action} className="card space-y-4 p-4">
      <h2 className="font-semibold">Catat realisasi</h2>
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
          <p><span className="text-slate-500">Pagu rekening{stageW ? ` (${stageW.name})` : ""}:</span> {f(stageEntry?.pagu ?? entry.pagu)}</p>{lim && <p><span className="text-slate-500">Sisa pagu rekening:</span> <b>{f(lim.entryLeft)}</b></p>}
        </div>)}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">3. Tanggal transaksi *<input type="date" name="transaction_date" required value={date} onChange={(e) => setDate(e.target.value)} className={cls} />
          <span className="text-xs font-normal text-slate-500">{outOfYear ? <b className="text-red-700">Harus di tahun anggaran {year}</b> : q && stageW ? `${stageW.name} · ${QUARTER_SHORT[q - 1]}${payDate ? " (mengikuti tanggal SPM/SP2D)" : ""}` : ""}</span></label>
        <label className="block text-sm font-medium">Nilai (Rp) *<input name="amount" ref={amountRef} required inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} className={cls} aria-invalid={!!over || (!!amount && val === null)} />
          <span className="text-xs font-normal text-slate-500">{amount && val === null ? <b className="text-red-700">Angka tidak dikenali. Contoh: 1.250.000 atau 1250000,50</b> : val !== null && toCents(val) < 0n ? <b className="text-amber-800">Koreksi {f(val)} (mengurangi realisasi)</b> : val !== null ? <b className="text-slate-800">{f(val)}</b> : "Isi minus (-) untuk koreksi/pengurangan"}</span></label>
        <label className="block text-sm font-medium">Metode pemilihan <span className="font-normal text-slate-500">(opsional)</span><select name="procurement_method_id" value={method} onChange={(e) => { setMethodId(e.target.value); setMethodTouched(true); }} className={cls}><option value="">(non-pengadaan / belum ditentukan)</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </div>
      {date && !outOfYear && (stageW && q ? (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 text-sm" aria-label="Tahapan dan triwulan">
          <p>Tanggal acuan <b>{refDate}</b> ({payDate ? "Tanggal SPM/SP2D" : "tanggal transaksi"}) termasuk tahapan <b>{stageW.name}</b> (penetapan {stageW.start}, berlaku s.d. {stageW.end}), <b>triwulan {QUARTER_SHORT[q - 1]?.replace("TW ", "")}</b> ({QUARTER_MONTHS[q - 1]}).
            {stageW.id !== currentStageId && <> Dicatat pada tahapan {stageW.name} dan dibatasi anggaran kas tahapan {stageW.name}, walaupun layar sedang memakai tahapan lain.</>}</p></div>
      ) : <p role="alert" className="alert alert-warn text-sm">Belum ada tahapan anggaran yang berlaku pada tanggal {refDate}. Atur tanggal penetapan tahapan di tab Unggah (panel Aturan tahapan anggaran).</p>)}
      {noStageMatch && <p role="alert" className="alert alert-warn text-sm">Rekening ini tidak ada (atau tidak unik) pada tahapan {stageW?.name}. Tambahkan/impor rekening padanannya pada tahapan itu (menu Kelola anggaran) atau pilih tanggal lain.</p>}
      {noStageRup && <p role="alert" className="alert alert-warn text-sm">Kode RUP {rup?.code} belum ada pada tahapan {stageW?.name}. Sinkronkan RUP tahapan itu (menu Paket RUP) atau pilih tanggal lain.</p>}
      {entry && lim && (
        <div className="space-y-2">
          <div className="overflow-x-auto"><table className="cash-table"><thead><tr><th>Anggaran kas {stageW?.name}</th>{QUARTER_SHORT.map((t) => <th key={t} className="text-right">{t}</th>)}</tr></thead>
            <tbody><tr><td>Kas triwulan</td>{lim.rows.map((r) => <td key={r.quarter} className="text-right tabular-nums">{f(r.cash)}</td>)}</tr>
              <tr><td>Kas kumulatif</td>{lim.rows.map((r) => <td key={r.quarter} className="text-right tabular-nums">{f(r.cashCum)}</td>)}</tr>
              <tr><td>Realisasi kumulatif</td>{lim.rows.map((r) => <td key={r.quarter} className="text-right tabular-nums">{f(r.realCum)}</td>)}</tr>
              <tr className="font-semibold"><td>Sisa kas kumulatif</td>{lim.rows.map((r) => <td key={r.quarter} className={`text-right tabular-nums ${q === r.quarter ? "bg-cyan-50" : ""}`}>{f(r.left)}</td>)}</tr></tbody></table></div>
          {!sd?.cashPrepared ? <p className="alert alert-warn">Anggaran kas tahapan {stageW?.name} belum disusun. Susun di menu Anggaran kas (pilih tahapan {stageW?.name}); pembayaran ditolak sampai kas tahapan ini diisi.</p> : lim.rows.every((r) => toCents(r.cash) === 0n) ? <p className="alert alert-warn">Anggaran kas rekening ini pada tahapan {stageW?.name} belum diisi (menu Anggaran kas). Pembayaran akan ditolak sampai kas diisi.</p> : null}
          {isPayment && <p className={`text-sm ${over ? "font-semibold text-red-700" : "text-slate-700"}`}>Maksimal yang dapat dicatat pada {q ? QUARTER_SHORT[q - 1] : "tanggal ini"}: <b>{f(lim.max)}</b> <span className="text-slate-500">(dibatasi oleh {lim.limitedBy === "kas" ? "sisa kas kumulatif" : lim.limitedBy === "pagu" ? "pagu rekening" : "pagu RUP"})</span>{over && " - nilai melebihi batas, akan ditolak."}</p>}
          <p className="text-xs text-slate-500">Sisa dihitung dari semua transaksi tercatat . Kas triwulan berikutnya tidak dapat dipakai untuk triwulan sebelumnya. Triwulan: I Jan-Mar, II Apr-Jun, III Jul-Sep, IV Okt-Des.</p>
        </div>)}
      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="text-sm font-medium">4. Penyedia pelaksana pekerjaan <span className="font-normal text-slate-500">(untuk pengadaan; boleh menyusul)</span></p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1"><input value={qProv} onChange={(e) => setQProv(e.target.value)} placeholder="Cari nama penyedia" className="w-full py-1.5" aria-label="Cari penyedia" />
            <select name="provider_id" value={provider} onChange={(e) => { setProviderId(e.target.value); setProvTouched(true); if (e.target.value) setNewProv(""); }} className="w-full"><option value="">(belum dipilih)</option>{provOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            {rup?.providerId && provider === rup.providerId && !provTouched && <p className="text-xs text-slate-600">Terisi otomatis dari penyedia pada kontrak paket RUP ini.</p>}</div>
          <label className="block text-sm">Atau tambah penyedia baru<input name="new_provider_name" value={newProv} onChange={(e) => { setNewProv(e.target.value); if (e.target.value) { setProviderId(""); setProvTouched(true); } }} maxLength={200} disabled={!!provider} placeholder={provider ? "Kosongkan pilihan di kiri untuk mengetik nama baru" : "Ketik nama lengkap, mis. PT Maju Jaya"} autoComplete="off" className={cls} />
            <span className="text-xs text-slate-500">Nama yang sudah ada (tanpa membedakan huruf, spasi, dan titik/koma) dipakai ulang, tidak dibuat dobel.</span></label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">Tanggal SPM/SP2D <span className="font-normal text-slate-500">(penentu tahapan &amp; pengakuan realisasi)</span><input type="date" name="payment_date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={cls} aria-invalid={payOut} />{payOut && <span className="mt-1 block text-xs font-semibold text-red-700">Harus di tahun anggaran {year}</span>}<span className="mt-1 block text-xs font-normal text-slate-600">Boleh dikosongkan: transaksi dicatat dengan status <b>belum_spm_sp2d</b> (belum diakui sebagai realisasi, tetap menahan pagu) dan baru diakui setelah tanggal ini diisi lewat Daftar transaksi &gt; Ubah. Tahapan sementara mengikuti tanggal transaksi.</span></label>
        <label className="block text-sm font-medium">No SPM/SP2D <span className="font-normal text-slate-500">(dapat dilengkapi kemudian)</span><input name="payment_number" maxLength={100} value={payNo} onChange={(e) => setPayNo(e.target.value)} autoComplete="off" className={cls} /></label>
        <label className="block text-sm font-medium sm:col-span-3">Uraian / keperluan <span className="font-normal text-slate-500">(untuk belanja berulang, mis. Konsumsi rapat koordinasi 12 Nov; uraian berbeda = transaksi berbeda)</span><input name="description" maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} autoComplete="off" className={cls} /></label>
        <label className="block text-sm font-medium">Catatan<input name="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} autoComplete="off" className={cls} /></label>
      </div>
      {checks.length > 0 && <ul className="space-y-1" aria-label="Pemeriksaan isian">{checks.map((c) => <li key={c.text} className={`alert text-sm ${c.level === "warn" ? "alert-warn" : "alert-info"}`}>{c.text}</li>)}</ul>}
      {entry && val !== null && date && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 text-sm" aria-label="Ringkasan sebelum simpan"><p className="font-semibold">Periksa sebelum menyimpan</p>
          <p>{toCents(val) < 0n ? "Koreksi" : "Pembayaran"} <b>{f(val)}</b> pada <b>{date}</b> untuk <b>{entry.sub.split(" ")[0]} / {entry.acc.split(" ")[0]}</b>{rup ? <>, RUP <b>{rup.code}</b></> : ", tanpa RUP"}{method ? <>, metode <b>{methods.find((m) => m.id === method)?.name}</b></> : ""}{provider ? <>, penyedia <b>{providers.find((p) => p.id === provider)?.name}</b></> : newProv.trim() ? <>, penyedia baru <b>{newProv.trim()}</b></> : ""}.
            {payDate ? <> Diakui sebagai realisasi (SPM/SP2D {payDate}).</> : <> Belum diakui sebagai realisasi (menunggu tanggal SPM/SP2D).</>}</p></div>)}
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.ok && <p role="status" className="alert alert-ok">Tersimpan. Sisa pagu dan kas sudah diperbarui. RUP, rekening, tanggal, metode, dan penyedia dipertahankan agar input berikutnya cepat; ubah bila berbeda.</p>}
      <button disabled={pending || !!over || outOfYear || payOut || (!!date && !stageW) || noStageMatch || noStageRup || (!!amount && val === null)} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan realisasi"}</button>
    </form>);
}
