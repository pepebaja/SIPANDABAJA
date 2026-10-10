"use client";
import { useActionState } from "react";
import { confirmCashImport, stageCashImport, type CashImportState } from "@/app/(app)/kas/actions";
import { formatRupiah } from "@/lib/format";
import { QUARTER_SHORT } from "@/lib/cash";
import { Icon } from "@/components/icons";

const m = (v: string | null) => (v === null ? "-" : formatRupiah(v).replace(/^(-?)Rp /, "$1"));
export function CashUpload() {
  const [s, stage, staging] = useActionState<CashImportState, FormData>(stageCashImport, {});
  const [c, confirm, confirming] = useActionState<CashImportState, FormData>(confirmCashImport, {});
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Unggah file</p><h2>Isi anggaran kas dari Excel atau PDF</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Sistem mencocokkan baris dengan rekening anggaran lewat kode sub kegiatan dan kode rekening, lalu menampilkan pratinjau. <b>Tidak ada yang tersimpan sebelum Anda menekan Terapkan.</b></p></div>
        <a href="/api/templates/kas" className="btn btn-ghost btn-sm"><Icon name="download" className="h-4 w-4" />Unduh template Excel</a>
      </div>
      <form action={stage} className="flex flex-wrap items-end gap-3">
        <label className="field-label">File (.xlsx atau .pdf, maks. 5 MB)<input name="file" type="file" accept=".xlsx,.pdf" required className="mt-1 block text-sm" /></label>
        <button disabled={staging} className="btn btn-primary">{staging ? "Memeriksa..." : "Periksa file"}</button>
      </form>
      <details className="text-sm text-slate-600"><summary className="cursor-pointer font-semibold text-cyan-800">Tentang pembacaan Excel dan PDF</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Excel</b> paling akurat. Unduh template (berisi seluruh rekening anggaran Anda), isi kolom tw1-tw4, lalu unggah. Kolom bulanan jan-des juga dibaca dan otomatis dijumlahkan per triwulan.</li>
          <li><b>PDF</b> dibaca otomatis (best-effort) dari teks tabel: baris yang memuat kode rekening dari anggaran Anda diambil, 4 angka triwulan dipilih (atau 12 angka bulanan dijumlahkan). PDF hasil scan/gambar tidak dapat dibaca. <b>Selalu periksa pratinjau.</b></li>
          <li>Nilai yang diterapkan menimpa nilai triwulan yang sama; triwulan yang dikosongkan di file tidak diubah.</li>
        </ul></details>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.jobId && (
        <div className="space-y-3">
          <p className="text-sm"><b>{s.fileName}</b> ({s.fileKind === "pdf" ? "PDF" : "Excel"}): <b>{s.ok}</b> baris cocok, <b className={s.failed ? "text-red-700" : ""}>{s.failed}</b> bermasalah{!!s.skipped && <>, {s.skipped} baris tanpa nilai dilewati</>}.{!!s.over && <> <span className="badge badge-warn">{s.over} melebihi pagu</span></>}</p>
          {!!s.preview?.length && (
            <div className="max-h-96 overflow-auto rounded-xl border border-slate-200"><table className="cash-table"><thead><tr><th>Baris</th><th>Rekening anggaran</th><th className="text-right">Pagu</th>{QUARTER_SHORT.map((q) => <th key={q} className="text-right">{q}</th>)}<th className="text-right">Total</th></tr></thead>
              <tbody>{s.preview.map((r) => <tr key={r.row} className={r.over ? "!bg-amber-50" : ""}><td>{r.row}</td><td className="text-sm">{r.label}</td><td className="text-right tabular-nums">{m(r.pagu)}</td>
                {r.q.map((v, i) => <td key={i} className="text-right tabular-nums">{m(v)}</td>)}<td className={`text-right font-semibold tabular-nums ${r.over ? "text-red-700" : ""}`}>{m(r.total)}</td></tr>)}</tbody></table></div>)}
          {(s.ok ?? 0) > (s.preview?.length ?? 0) && <p className="text-xs text-slate-600">Pratinjau menampilkan {s.preview?.length} baris pertama.</p>}
          {!!s.errors?.length && (
            <div className="max-h-72 overflow-auto rounded-xl border border-red-200"><table className="cash-table"><thead><tr><th>Baris</th><th>Kolom</th><th>Masalah</th><th>Saran</th></tr></thead>
              <tbody>{s.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.field}</td><td className="text-sm">{e.message}</td><td className="text-sm">{e.hint}</td></tr>)}</tbody></table></div>)}
          {c.applied === undefined && (s.ok ?? 0) > 0 && (
            <form action={confirm} className="flex flex-wrap items-center gap-4">
              <input type="hidden" name="jobId" value={s.jobId} />
              {(s.failed ?? 0) > 0 && <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="skip" required />Terapkan hanya baris yang cocok, abaikan {s.failed} baris bermasalah</label>}
              <button disabled={confirming} className="btn btn-dark">{confirming ? "Menerapkan..." : `Terapkan ${s.ok} baris ke Anggaran Kas`}</button>
            </form>)}
          {(s.ok ?? 0) === 0 && <p className="alert alert-warn">Tidak ada baris yang dapat diterapkan. Perbaiki file lalu unggah ulang.</p>}
          {c.error && <p role="alert" className="alert alert-error">{c.error}</p>}
          {c.applied !== undefined && <p role="status" className="alert alert-ok">Berhasil menerapkan {c.applied} nilai triwulan. Tabel di bawah sudah diperbarui; periksa hasilnya.</p>}
        </div>)}
    </div>
  );
}
