import { getSession } from "@/lib/server/session";
import { getPrintProfile } from "@/lib/server/print-profile";
import { can } from "@/lib/rbac";
import { SettingsForm } from "@/components/settings-form";
export const metadata = { title: "Pengaturan" };
export default async function PengaturanPage() {
  const s = await getSession();
  if (!s || !can(s.roles, "print-profile:write")) return <p role="alert" className="alert alert-error max-w-xl">Hanya Super Admin dan Admin OPD yang dapat membuka pengaturan.</p>;
  const profile = await getPrintProfile(s);
  return (
    <section className="max-w-5xl space-y-5">
      <div><p className="eyebrow">Pengelolaan</p><h1 className="page-title">Pengaturan</h1><p className="page-desc">Nama OPD, alamat, dan pejabat penandatangan dipakai otomatis pada kop dan tanda tangan semua laporan dan dokumen cetak.</p></div>
      <SettingsForm initial={profile} />
    </section>
  );
}
