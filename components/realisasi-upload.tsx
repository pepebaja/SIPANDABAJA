"use client";
import { useActionState } from "react";
import Link from "next/link";
import { confirmTxImport, stageTxImport, type Breakdown, type TxImportState } from "@/app/(app)/realisasi/unggah-actions";
import { formatRupiah } from "@/lib/format";
import { fmtDate } from "@/lib/date";
import { Icon } from "@/components/icons";
import { BASIS_LABEL, type Basis } from "@/lib/stage-rule";
const m = (v: string) => formatRupiah(v).replace(/^(-?)Rp /, "$1");

function Tiles({ title, items }: { title: string; items?: Breakdown[] }) {
  if (!items?.length) return null;
  return (
    <div className="card p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm">{items.map((x) => <li key={x.key} className="flex items-baseline justify-between gap-3"><span>{x.label}</span><span className="whitespace-nowrap tabular-nums"><b>{x.count}</b> baris · Rp {m(x.amount)}</span></li>)}</ul></div>);
}

/** Unggah realisasi: unduh template -> pilih file -> periksa (pratinjau tanpa menyimpan) -> terapkan. */
export function RealisasiUpload() {
  const [s, stage, staging] = useActionState<TxImportState, FormData>(stageTxImport, {});
  const [c, confirm, confirming] = useActionState<TxImportState, FormData>(confirmTxImport, {});
  const r = c.result, problems = (s.failed ?? 0) > 0, todo = (s.wouldInsert ?? 0) + (s.wouldUpdate ?? 0), canApply = !r && todo > 0;
  return (
    <div className="card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Cara tercepat</p><h2>Unggah realisasi dari Excel atau CSV</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Isi hanya 5 kolom wajib: tanggal transaksi, subkegiatan, rekening, nilai, dan (bila pengadaan) kode RUP serta metode pemilihan. Sistem menentukan <b>tahapan anggaran</b> dari <b>tanggal SPM/SP2D</b> (atau tanggal transaksi bila belum ada), memeriksa pagu dan anggaran kas, dan mengenali baris yang sudah tercatat. <b>Nomor SPM/SP2D dapat dilengkapi kemudian</b> dengan mengunggah ulang. Tidak ada yang tersimpan sebelum Anda menekan Catat.</p></div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/templates/realisasi" className="btn btn-ghost btn-sm"><Icon name="download" className="h-4 w-4" />Template Excel</a>
          <a href="/api/templates/realisasi?format=csv" className="btn btn-ghost btn-sm"><Icon name="download" className="h-4 w-4" />Template CSV</a>
        </div>
      </div>
      <form action={stage} className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="field-label">File (.xlsx atau .csv, maks. 5 MB, maks. 2.000 baris)<input name="file" type="file" accept=".xlsx,.csv" required className="mt-1 block text-sm" /></label>
        <button disabled={staging} className="btn btn-primary">{staging ? "Memeriksa..." : "Periksa file"}</button>
      </form>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.jobId && (
        <div className="space-y-4">
          <p className="text-sm"><b>{s.fileName}</b>: {s.total} baris data.{" "}
            <span className="badge badge-ok">{s.wouldInsert} baru</span>{" "}
            {!!s.wouldUpdate && <span className="badge badge-accent">{s.wouldUpdate} diperbarui</span>}{" "}
            {!!s.existing && <span className="badge badge-off">{s.existing} sudah tercatat (dilewati)</span>}{" "}
            {problems && <span className="badge badge-warn">{s.failed} bermasalah</span>}
            {!!s.skipped && <span className="text-slate-500">, {s.skipped} baris kosong dilewati</span>}</p>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <Tiles title="Tahapan anggaran" items={s.byStage} /><Tiles title="SPM/SP2D" items={s.byPayment} /><Tiles title="Proses pengadaan" items={s.byProses} /><Tiles title="Metode pemilihan" items={s.byMetode} />
          </div>
          {!!s.rows?.length && (
            <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
              <table className="cash-table"><thead><tr><th>Baris</th><th>Tindakan</th><th>Tgl transaksi</th><th>Tanggal acuan</th><th>Tahapan</th><th>Rekening</th><th>RUP / metode</th><th>No SPM/SP2D</th><th className="text-right">Nilai</th></tr></thead>
                <tbody>{s.rows.map((x) => (
                  <tr key={x.row} className={x.status === "ditolak" ? "!bg-amber-50" : ""}>
                    <td>{x.row}</td>
                    <td>{x.status === "baru" ? <span className="badge badge-ok">Baru</span> : x.status === "diperbarui" ? <span className="badge badge-accent">Diperbarui</span> : x.status === "sudah" ? <span className="badge badge-off">Sudah ada</span> : <span className="badge badge-warn">Ditolak</span>}</td>
                    <td className="whitespace-nowrap">{fmtDate(x.tanggal)}</td>
                    <td className="whitespace-nowrap">{fmtDate(x.acuan)} <span className="text-xs text-slate-500">({BASIS_LABEL[x.basis as Basis]})</span></td>
                    <td><span className="badge badge-accent">{x.tahapan}</span></td><td className="min-w-48 text-sm">{x.rekening}{x.pesan && <span className="mt-1 block text-xs font-semibold text-amber-900">Ditolak: {x.pesan}</span>}</td>
                    <td className="text-sm">{x.rup ? <span className="whitespace-nowrap">RUP {x.rup}</span> : <span className="text-slate-500">{x.proses}</span>}{x.metode && <span className="block text-xs text-slate-600">{x.metode}</span>}</td>
                    <td className="text-sm">{x.nomor ?? <span className="text-slate-400">-</span>}</td><td className="text-right tabular-nums">{m(x.nilai)}</td></tr>))}</tbody></table></div>)}
          {(s.ok ?? 0) > (s.rows?.length ?? 0) && <p className="text-xs text-slate-600">Pratinjau menampilkan {s.rows?.length} baris pertama; semua baris tetap diproses.</p>}
          {!!s.warnings?.length && (
            <details className="alert alert-warn" open={s.warnings.some((w) => w.row === 0)}><summary className="cursor-pointer font-semibold">{s.warnings.length} peringatan (tidak menghalangi)</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{s.warnings.map((w, i) => <li key={i}>{w.row === 0 ? "File" : `Baris ${w.row}`}: {w.message}</li>)}</ul></details>)}
          {!!s.errors?.length && (
            <div className="max-h-72 overflow-auto rounded-xl border border-red-200"><table className="cash-table"><thead><tr><th>Baris</th><th>Kolom</th><th>Masalah</th><th>Saran</th></tr></thead>
              <tbody>{s.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.field}</td><td className="text-sm">{e.message}</td><td className="text-sm">{e.hint}</td></tr>)}</tbody></table></div>)}
          {(s.ok ?? 0) === 0 && <p className="alert alert-warn">Tidak ada baris valid. Perbaiki file sesuai tabel di atas lalu unggah ulang.</p>}
          {canApply && (
            <form action={confirm} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input type="hidden" name="jobId" value={s.jobId} />
              {problems && <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="skip" required />Catat hanya baris yang lolos pemeriksaan; {s.failed} baris bermasalah diabaikan (perbaiki lalu unggah ulang)</label>}
              <p className="text-xs text-slate-600">Transaksi baru masuk sebagai <b>belum diverifikasi</b> (admin memverifikasinya dari tab Riwayat unggahan). Transaksi yang sudah terverifikasi hanya dapat dilengkapi bagian yang masih kosong (tanggal/nomor SPM-SP2D, metode); nilai dan rekening tidak berubah.</p>
              <button disabled={confirming} className="btn btn-dark">{confirming ? "Mencatat..." : `Catat ${s.wouldInsert} baru${s.wouldUpdate ? ` dan perbarui ${s.wouldUpdate}` : ""}`}</button>
            </form>)}
          {c.error && <p role="alert" className="alert alert-error">{c.error}</p>}
          {r && <p role="status" className="alert alert-ok">Selesai: {r.inserted} transaksi baru dicatat{r.updated ? `, ${r.updated} diperbarui` : ""}{r.existing ? `, ${r.existing} sudah tercatat (dilewati)` : ""}{r.failed ? `, ${r.failed} ditolak` : ""}. Lihat di <Link className="link" href="/realisasi?tab=daftar">Daftar transaksi</Link> atau verifikasi di <Link className="link" href="/realisasi?tab=riwayat">Riwayat unggahan</Link>.</p>}
        </div>)}
    </div>);
}
