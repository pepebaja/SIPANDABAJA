"use client";
import { useActionState } from "react";
import { confirmRupImport, stageRupImport, type RupImportState } from "@/app/(app)/rup/actions";
import { formatRupiah } from "@/lib/format";
import { Icon } from "@/components/icons";
const m = (v: string) => formatRupiah(v).replace(/^(-?)Rp /, "$1");
export function RupImport() {
  const [s, stage, staging] = useActionState<RupImportState, FormData>(stageRupImport, {});
  const [c, confirm, confirming] = useActionState<RupImportState, FormData>(confirmRupImport, {});
  const r = c.result, miss = s.missing ?? [], missAlloc = miss.reduce((a, x) => a + x.allocations, 0);
  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Sinkronisasi SIRUP</p><h2>Unggah file RUP dari SIRUP</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Paket dicocokkan lewat <b>kode RUP</b>: kode baru ditambah, kode yang sama diperbarui bila isinya berubah. Anda melihat pratinjau perubahan lebih dulu. <b>Tidak ada yang tersimpan sebelum Anda menekan Terapkan.</b></p></div>
        <a href="/api/templates/rup" className="btn btn-ghost btn-sm"><Icon name="download" className="h-4 w-4" />Unduh template Excel</a>
      </div>
      <form action={stage} className="flex flex-wrap items-end gap-3">
        <label className="field-label">File Excel (.xlsx, maks. 5 MB)<input name="file" type="file" accept=".xlsx" required className="mt-1 block text-sm" /></label>
        <button disabled={staging} className="btn btn-primary">{staging ? "Memeriksa..." : "Periksa file"}</button>
      </form>
      <details className="text-sm text-slate-600"><summary className="cursor-pointer font-semibold text-cyan-800">Format file yang dibaca</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Berkas ekspor SIRUP dibaca langsung (kolom <b>ID, Paket, Pagu (Rp), Jenis Pengadaan, Metode Pemilihan</b>); judul/keterangan di atas tabel dilewati otomatis. Template sendiri memakai kolom kode_rup, nama_paket, jenis_pengadaan, metode_pemilihan, pagu.</li>
          <li>Metode pemilihan dicocokkan dengan master <i>Metode pemilihan</i>; bila tidak ditemukan, kolom dikosongkan (bukan kesalahan).</li>
          <li>Paket yang sudah ada tetapi <b>tidak ada di file</b> tidak disentuh, kecuali Anda memilih menghapusnya pada langkah Terapkan.</li>
        </ul></details>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.jobId && (
        <div className="space-y-3">
          <p className="text-sm"><b>{s.fileName}</b>: {s.total} baris data. <span className="badge badge-ok">{s.added} baru</span> <span className="badge badge-info">{s.changed} diubah</span> <span className="badge badge-off">{s.unchanged} tidak berubah</span>
            {!!s.failed && <> <span className="badge badge-warn">{s.failed} bermasalah</span></>}{!!miss.length && <> <span className="badge badge-accent">{miss.length} tidak ada di file</span></>}{!!s.skipped && <>, {s.skipped} baris kosong dilewati</>}.</p>
          {!!s.rows?.length && (
            <div className="max-h-96 overflow-auto rounded-xl border border-slate-200"><table className="cash-table"><thead><tr><th>Baris</th><th>Kode RUP</th><th>Nama</th><th>Perubahan</th><th className="text-right">Pagu</th></tr></thead>
              <tbody>{s.rows.map((x) => <tr key={x.code} className={x.overAlloc ? "!bg-amber-50" : ""}><td>{x.row}</td><td className="whitespace-nowrap">{x.code}</td><td className="text-sm">{x.name}</td>
                <td className="text-sm">{x.action === "baru" ? <span className="badge badge-ok">Baru</span> : <>Ubah: {x.changes.join(", ")}</>}{x.overAlloc && <span className="badge badge-warn ml-2">Pagu di bawah alokasi</span>}</td><td className="text-right tabular-nums">{m(x.pagu)}</td></tr>)}</tbody></table></div>)}
          {(s.added ?? 0) + (s.changed ?? 0) > (s.rows?.length ?? 0) && <p className="text-xs text-slate-600">Pratinjau menampilkan {s.rows?.length} baris pertama.</p>}
          {!!s.warnings?.length && (
            <details className="alert alert-warn"><summary className="cursor-pointer font-semibold">{s.warnings.length} peringatan (tidak menghalangi)</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{s.warnings.map((w, i) => <li key={i}>Baris {w.row} ({w.code}): {w.message}</li>)}</ul></details>)}
          {!!s.errors?.length && (
            <div className="max-h-72 overflow-auto rounded-xl border border-red-200"><table className="cash-table"><thead><tr><th>Baris</th><th>Kolom</th><th>Masalah</th><th>Saran</th></tr></thead>
              <tbody>{s.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.field}</td><td className="text-sm">{e.message}</td><td className="text-sm">{e.hint}</td></tr>)}</tbody></table></div>)}
          {!!miss.length && (
            <details className="rounded-xl border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-semibold">{miss.length} paket RUP ada di aplikasi tetapi tidak ada di file</summary>
              <div className="mt-2 max-h-60 overflow-auto"><table className="cash-table"><thead><tr><th>Kode RUP</th><th>Nama</th><th className="text-right">Pagu</th><th>Alokasi</th><th>Paket pengadaan</th></tr></thead>
                <tbody>{miss.map((x) => <tr key={x.code}><td>{x.code}</td><td className="text-sm">{x.name}</td><td className="text-right tabular-nums">{m(x.pagu)}</td><td>{x.allocations}</td><td>{x.linkedPackages}</td></tr>)}</tbody></table></div></details>)}
          {!r && (s.ok ?? 0) > 0 && (
            <form action={confirm} className="space-y-2">
              <input type="hidden" name="jobId" value={s.jobId} />
              {(s.failed ?? 0) > 0 && <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="skip" required />Terapkan hanya baris yang valid, abaikan {s.failed} baris bermasalah</label>}
              {!!miss.length && !s.failed && <label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" name="delete_missing" className="mt-1" /><span>Hapus juga {miss.length} paket RUP yang tidak ada di file<span className="block text-xs font-normal text-slate-600">Dipakai bila file SIRUP memuat <b>seluruh</b> RUP terbaru. {missAlloc > 0 ? `${missAlloc} alokasi rekening pada paket tersebut ikut terhapus; ` : ""}paket pengadaan yang bertaut tidak dihapus, hanya tautan RUP-nya dikosongkan.</span></span></label>}
              <button disabled={confirming} className="btn btn-dark">{confirming ? "Menerapkan..." : `Terapkan ${(s.added ?? 0) + (s.changed ?? 0)} perubahan`}</button>
            </form>)}
          {(s.ok ?? 0) === 0 && <p className="alert alert-warn">Tidak ada baris valid yang dapat diterapkan. Perbaiki file lalu unggah ulang.</p>}
          {c.error && <p role="alert" className="alert alert-error">{c.error}</p>}
          {r && <p role="status" className="alert alert-ok">Selesai: {r.added} ditambah, {r.updated} diubah, {r.unchanged} tidak berubah{r.deleted ? `, ${r.deleted} dihapus (${r.allocations_removed} alokasi ikut terhapus)` : ""}. Daftar di bawah sudah diperbarui.</p>}
        </div>)}
    </div>);
}
