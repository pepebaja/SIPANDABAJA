"use client";
import { useActionState } from "react";
import { confirmBudgetImport, stageBudgetImport, type ImportState } from "@/app/(app)/anggaran/impor/actions";
export function ImportForm() {
  const [s, stage, staging] = useActionState<ImportState, FormData>(stageBudgetImport, {});
  const [c, confirm, confirming] = useActionState<ImportState, FormData>(confirmBudgetImport, {});
  return (
    <div className="space-y-4">
      <form action={stage} className="flex flex-wrap items-end gap-3 card p-4">
        <label className="text-sm font-medium">File Excel (.xlsx, maks. 5 MB)
          <input name="file" type="file" accept=".xlsx" required className="mt-1 block text-sm" /></label>
        <button disabled={staging} className="btn btn-primary">{staging ? "Memeriksa..." : "Periksa file"}</button>
      </form>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.jobId && (
        <div className="space-y-3 card p-4">
          <p className="text-sm"><b>{s.fileName}</b>: {s.total} baris, <b>{s.ok}</b> valid, <b>{s.failed}</b> bermasalah. Data belum disimpan ke anggaran.</p>
          {!!s.errors?.length && (
            <div className="max-h-80 overflow-auto"><div className="table-wrap"><table>
              <thead><tr><th>Baris</th><th>Kolom</th><th>Masalah</th><th>Saran</th></tr></thead>
              <tbody>{s.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.field}</td><td>{e.message}</td><td>{e.hint}</td></tr>)}</tbody></table></div>
              {(s.failed ?? 0) > s.errors.length && <p className="mt-1 text-xs text-slate-600">Menampilkan {s.errors.length} baris pertama.</p>}</div>)}
          {s.failed === 0 && !c.confirmed ? (
            <form action={confirm}><input type="hidden" name="jobId" value={s.jobId} />
              <button disabled={confirming} className="btn btn-dark">{confirming ? "Menyimpan..." : `Konfirmasi dan simpan ${s.ok} baris`}</button></form>
          ) : s.failed ? <p className="alert alert-warn">Perbaiki baris di atas atau master data, lalu unggah ulang. Konfirmasi hanya tersedia jika semua baris valid.</p> : null}
          {c.error && <p role="alert" className="alert alert-error">{c.error}</p>}
          {c.confirmed !== undefined && <p role="status" className="alert alert-ok">Berhasil menyimpan {c.confirmed} baris anggaran.</p>}
        </div>)}
    </div>
  );
}
