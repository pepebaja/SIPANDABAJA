"use client";
import { useActionState } from "react";
import { confirmBudgetImport, stageBudgetImport, type ImportState } from "@/app/(app)/anggaran/impor/actions";
export function ImportForm() {
  const [s, stage, staging] = useActionState<ImportState, FormData>(stageBudgetImport, {});
  const [c, confirm, confirming] = useActionState<ImportState, FormData>(confirmBudgetImport, {});
  return (
    <div className="space-y-4">
      <form action={stage} className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <label className="text-sm font-medium">File Excel (.xlsx, maks. 5 MB)
          <input name="file" type="file" accept=".xlsx" required className="mt-1 block text-sm" /></label>
        <button disabled={staging} className="rounded bg-teal-600 px-4 py-2 text-white hover:bg-teal-700 disabled:opacity-60">{staging ? "Memeriksa..." : "Periksa file"}</button>
      </form>
      {s.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{s.error}</p>}
      {s.jobId && (
        <div className="space-y-3 rounded border bg-white p-4">
          <p className="text-sm"><b>{s.fileName}</b>: {s.total} baris, <b>{s.ok}</b> valid, <b>{s.failed}</b> bermasalah. Data belum disimpan ke anggaran.</p>
          {!!s.errors?.length && (
            <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm">
              <thead><tr className="border-b"><th className="p-1">Baris</th><th className="p-1">Kolom</th><th className="p-1">Masalah</th><th className="p-1">Saran</th></tr></thead>
              <tbody>{s.errors.map((e, i) => <tr key={i} className="border-b"><td className="p-1">{e.row}</td><td className="p-1">{e.field}</td><td className="p-1">{e.message}</td><td className="p-1">{e.hint}</td></tr>)}</tbody></table>
              {(s.failed ?? 0) > s.errors.length && <p className="mt-1 text-xs text-slate-600">Menampilkan {s.errors.length} baris pertama.</p>}</div>)}
          {s.failed === 0 && !c.confirmed ? (
            <form action={confirm}><input type="hidden" name="jobId" value={s.jobId} />
              <button disabled={confirming} className="rounded bg-navy-800 px-4 py-2 text-white disabled:opacity-60">{confirming ? "Menyimpan..." : `Konfirmasi dan simpan ${s.ok} baris`}</button></form>
          ) : s.failed ? <p className="text-sm text-amber-800">Perbaiki baris di atas atau master data, lalu unggah ulang. Konfirmasi hanya tersedia jika semua baris valid.</p> : null}
          {c.error && <p role="alert" className="text-sm text-red-800">{c.error}</p>}
          {c.confirmed !== undefined && <p role="status" className="text-sm text-teal-700">Berhasil menyimpan {c.confirmed} baris anggaran.</p>}
        </div>)}
    </div>
  );
}
