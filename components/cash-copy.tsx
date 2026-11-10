"use client";
import { useActionState } from "react";
import { copyCashFromPrevious, type CopyState } from "@/app/(app)/kas/actions";

/** Menyalin anggaran kas tahapan sebelumnya ke tahapan aktif sebagai titik awal penyesuaian. */
export function CashCopy({ stageName, versionId }: { stageName: string; versionId: string }) {
  const [st, act, pending] = useActionState<CopyState, FormData>(copyCashFromPrevious, {});
  return (
    <form action={act} className="card space-y-3 p-4">
      <div><h2 className="text-base">Salin dari tahapan sebelumnya</h2>
        <p className="text-sm text-slate-600">Anggaran kas tahapan sebelumnya (mis. Murni) disalin ke <b>{stageName}</b> sebagai titik awal, lalu disesuaikan di tabel input atau lewat unggah Excel. Sub kegiatan atau belanja <b>baru</b> yang diimpor pada tahapan ini tidak punya padanan, sehingga dibiarkan kosong untuk Anda isi.</p></div>
      <input type="hidden" name="version_id" value={versionId} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overwrite" />Timpa nilai yang sudah terisi pada tahapan ini</label>
      <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Menyalin..." : "Salin anggaran kas"}</button>
      {st.error && <p role="alert" className="alert alert-error">{st.error}</p>}
      {st.ok && <div role="status" className="alert alert-info space-y-1 text-sm">
        <p>Disalin dari tahapan <b>{st.from}</b>: <b>{st.copied}</b> rekening disalin, {st.kept} dipertahankan (sudah terisi), <b>{st.newEntries}</b> rekening (baru atau belum punya padanan) belum ada kas dan perlu diisi.</p>
        {!!st.missing && <><p><b>{st.missing}</b> rekening tahapan sebelumnya tidak ada padanannya di tahapan ini (dihapus/berubah nomenklatur), sehingga tidak disalin:</p>
          <ul className="list-disc pl-5 text-xs">{st.missingList?.map((m, i) => <li key={i}>{m}</li>)}</ul></>}</div>}
    </form>
  );
}
