"use client";
import { useActionState, useState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/(app)/pengaturan/actions";
import type { PrintProfile } from "@/lib/settings";

export function SettingsForm({ initial }: { initial: PrintProfile }) {
  const [s, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  const [v, setV] = useState(initial);
  const set = (k: keyof PrintProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <form action={action} className="card space-y-4 p-5">
        <div><p className="eyebrow">Identitas &amp; kop cetak</p><h2>Profil OPD</h2></div>
        <label className="field-label">Nama OPD *<input name="org_name" value={v.orgName} onChange={set("orgName")} required maxLength={200} className="mt-1 w-full" /></label>
        <label className="field-label">Alamat<textarea name="address" value={v.address} onChange={set("address")} rows={2} maxLength={300} className="mt-1 w-full" /><span className="field-hint">Tampil di bawah nama OPD pada kop surat.</span></label>
        <label className="field-label">Kota/Kabupaten<input name="city" value={v.city} onChange={set("city")} maxLength={80} className="mt-1 w-full" placeholder="mis. Banjarmasin" /><span className="field-hint">Dipakai pada tanggal cetak, mis. &quot;Banjarmasin, 10 Oktober 2026&quot;.</span></label>
        <div className="border-t border-slate-200 pt-4"><h2>Pejabat penandatangan</h2><p className="text-sm text-slate-600">Tampil pada kolom &quot;Mengetahui&quot; di setiap dokumen cetak.</p></div>
        <label className="field-label">Jabatan<input name="head_title" value={v.headTitle} onChange={set("headTitle")} maxLength={120} className="mt-1 w-full" placeholder="mis. Kepala Dinas / Pengguna Anggaran" /></label>
        <label className="field-label">Nama lengkap<input name="head_name" value={v.headName} onChange={set("headName")} maxLength={120} className="mt-1 w-full" /></label>
        <label className="field-label">NIP<input name="head_nip" value={v.headNip} onChange={set("headNip")} inputMode="numeric" className="mt-1 w-full font-mono" placeholder="18 digit" /></label>
        {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
        {s.ok && <p role="status" className="alert alert-ok">Pengaturan tersimpan.</p>}
        <button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan pengaturan"}</button>
      </form>
      <aside className="space-y-2">
        <p className="eyebrow">Pratinjau kop &amp; tanda tangan</p>
        <div className="card space-y-4 p-5 text-center text-sm">
          <div className="border-b-[3px] border-double border-slate-800 pb-2"><p className="font-display font-bold uppercase">{v.orgName || "Nama OPD"}</p>{v.address && <p className="text-xs text-slate-700">{v.address}</p>}</div>
          <div><p>{v.city || ".........."}, tanggal cetak</p><p>Mengetahui,</p><p className="text-slate-600">{v.headTitle || "Kepala"}</p><div className="h-10" /><p className="font-semibold underline">{v.headName || ".........."}</p><p>NIP {v.headNip || ".........."}</p></div>
        </div>
      </aside>
    </div>
  );
}
