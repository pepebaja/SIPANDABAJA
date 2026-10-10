import Link from "next/link";
import { getSession } from "@/lib/server/session";
import { getPrintProfile } from "@/lib/server/print-profile";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/rbac";
import { Sheet } from "@/components/report-sheet";
import { PrintButton } from "@/components/print-button";
export const metadata = { title: "Formulir permohonan akun" };
const Line = ({ label }: { label: string }) => <div className="grid grid-cols-[11rem_1fr] items-end gap-2 text-sm"><span>{label}</span><span className="field-line" /></div>;
const REQUESTABLE: Role[] = ROLES.filter((r) => r !== "super_admin");
export default async function FormulirAkun() {
  const s = await getSession(); if (!s) return null;
  const profile = await getPrintProfile(s);
  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3"><Link href="/laporan" className="link text-sm">← Laporan &amp; dokumen</Link><PrintButton label="Cetak formulir" /></div>
      <Sheet profile={profile} title="Formulir Permohonan Akun Pengguna SIPANDABAJA" subtitle="Nomor: ........ / ........ / ........" signatures={false} printer={{ name: s.profile.full_name, nip: s.profile.nip, role: "Administrator" }}>
        <h3>A. Data pemohon</h3>
        <div className="space-y-2"><Line label="Nama lengkap" /><Line label="NIP" /><Line label="Jabatan" /><Line label="Unit kerja / bidang" /><Line label="Nomor telepon aktif" /></div>
        <h3>B. Akun yang diminta</h3>
        <div className="space-y-2"><Line label="Username yang diusulkan" />
          <p className="pt-1 text-xs text-slate-600">Username 3-32 karakter: huruf kecil, angka, titik, garis bawah, atau strip (mis. budi.santoso). Tidak memakai email.</p>
          <p className="pt-2 text-sm font-semibold">Peran yang diminta (pilih satu):</p>
          <ul className="space-y-1 text-sm">{REQUESTABLE.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true">☐</span><span><b>{ROLE_LABELS[r]}</b>: {ROLE_DESCRIPTIONS[r]}</span></li>)}</ul>
          <Line label="Alasan / keperluan" /><div className="field-line" /></div>
        <h3>C. Pernyataan pemohon</h3>
        <p className="mb-2 text-sm">Dengan menandatangani formulir ini, saya menyatakan bahwa:</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Saya menjaga kerahasiaan password dan tidak membagikan akun kepada siapa pun.</li>
          <li>Saya segera mengganti password sementara saat pertama kali masuk.</li>
          <li>Saya menggunakan akun hanya untuk keperluan tugas dan bertanggung jawab atas seluruh aktivitas yang tercatat pada akun saya.</li>
          <li>Saya segera melapor kepada administrator bila akun diduga disalahgunakan atau password diketahui pihak lain.</li>
          <li>Saya memahami bahwa aktivitas pada aplikasi dicatat dalam log audit.</li>
        </ol>
        <div className="mt-8 grid grid-cols-3 gap-6 text-center text-sm [break-inside:avoid]">
          <div><p>Pemohon,</p><div className="h-20" /><p className="field-line" /><p className="text-xs">Nama &amp; tanggal</p></div>
          <div><p>Mengetahui atasan langsung,</p><div className="h-20" /><p className="field-line" /><p className="text-xs">Nama, NIP &amp; tanggal</p></div>
          <div><p>{profile.headTitle || "Kepala"},</p><div className="h-20" /><p className="font-semibold underline">{profile.headName || "......................"}</p><p>NIP {profile.headNip || "......................"}</p></div>
        </div>
        <h3>D. Diisi administrator</h3>
        <div className="space-y-2"><Line label="Akun dibuat pada tanggal" /><Line label="Username terdaftar" /><Line label="Peran diberikan" /><Line label="Password sementara disampaikan via" /><Line label="Nama administrator" /></div>
        <p className="mt-6 text-xs text-slate-600">Catatan administrator: jangan menulis password pada formulir ini. Sampaikan password sementara secara langsung atau melalui kanal yang aman.</p>
      </Sheet>
    </section>
  );
}
