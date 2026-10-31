"use client";
import { useActionState } from "react";
import { saveStageDates, type StageDatesState } from "@/app/(app)/realisasi/unggah-actions";
import { fmtDate } from "@/lib/date";
import { effectiveStart, type StageVersion } from "@/lib/stage-rule";

/** Aturan tahapan anggaran: tanggal mulai berlaku tiap tahapan. Tanggal acuan transaksi menentukan tahapannya. */
export function StageDatesForm({ year, versions, canEdit }: { year: number; versions: StageVersion[]; canEdit: boolean }) {
  const [s, action, pending] = useActionState<StageDatesState, FormData>(saveStageDates, {});
  const missing = versions.filter((v) => v.stageCode !== "MURNI" && !v.effectiveFrom);
  return (
    <div className="card space-y-3 p-5">
      <div><p className="eyebrow">Aturan tahapan anggaran {year}</p><h2>Kapan tiap tahapan mulai berlaku?</h2>
        <p className="mt-1 text-sm text-slate-600">Setiap transaksi masuk ke tahapan yang berlaku pada <b>Tanggal SPM/SP2D</b> (bila sudah ada), atau pada <b>tanggal transaksi</b> (bila belum). Tahapan berlaku sejak tanggal mulainya sampai tahapan berikutnya mulai berlaku.</p></div>
      {!versions.length && <p className="alert alert-warn">Belum ada versi anggaran pada tahun ini. Siapkan di menu Impor anggaran (pilih tahapan di bagian atas layar).</p>}
      {!!missing.length && <p className="alert alert-warn">Tanggal berlaku {missing.map((v) => v.stageName).join(", ")} belum diatur, sehingga tahapan itu belum dipakai untuk menentukan transaksi.</p>}
      {!!versions.length && (
        <form action={action} className="space-y-3">
          <div className="overflow-x-auto"><table className="cash-table"><thead><tr><th>Tahapan</th><th>Versi</th><th>Berlaku mulai</th></tr></thead>
            <tbody>{versions.map((v) => { const st = effectiveStart(v, year); return (
              <tr key={v.id}><td><span className="badge badge-accent">{v.stageName}</span></td><td>{v.versionNo}</td>
                <td>{canEdit ? <label className="flex flex-wrap items-center gap-2"><input type="date" name={`v_${v.id}`} defaultValue={v.effectiveFrom ?? ""} min={`${year}-01-01`} max={`${year}-12-31`} aria-label={`Tanggal mulai berlaku ${v.stageName}`} />
                  {v.stageCode === "MURNI" && !v.effectiveFrom && <span className="text-xs text-slate-500">kosong = 1 Januari {year}</span>}</label>
                  : st ? fmtDate(st) : <span className="text-slate-500">belum diatur</span>}</td></tr>); })}</tbody></table></div>
          {canEdit ? <div className="flex items-center gap-3"><button disabled={pending} className="btn btn-ghost btn-sm">{pending ? "Menyimpan..." : "Simpan tanggal berlaku"}</button>
              {s.ok && <span role="status" className="text-sm font-medium text-emerald-700">Tersimpan.</span>}</div>
            : <p className="text-xs text-slate-500">Hanya Super Admin dan Admin OPD yang dapat mengubah tanggal ini.</p>}
          {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
        </form>)}
    </div>);
}
