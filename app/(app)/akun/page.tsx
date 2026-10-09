import { getSession } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/rbac";
export const metadata = { title: "Akun saya" };
export default async function AkunPage({ searchParams }: { searchParams: Promise<{ wajib?: string }> }) {
  const s = await getSession(); if (!s) return null;
  const sp = await searchParams, { data: { user } } = await (await createClient()).auth.getUser();
  const forced = user?.app_metadata?.must_change_password === true;
  return (
    <section className="max-w-4xl space-y-5">
      <div><p className="eyebrow">Profil</p><h1 className="page-title">Akun saya</h1></div>
      {(forced || sp.wajib) && <p role="alert" className="alert alert-warn">Demi keamanan, ganti password sementara Anda sebelum menggunakan aplikasi.</p>}
      <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="card space-y-4 p-5">
          <h2>Informasi akun</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-500">Username</dt><dd className="font-mono text-base font-semibold">{s.profile.username}</dd></div>
            <div><dt className="text-slate-500">Nama lengkap</dt><dd className="text-base font-medium">{s.profile.full_name}</dd></div>
            {s.profile.nip && <div><dt className="text-slate-500">NIP</dt><dd className="font-mono">{s.profile.nip}</dd></div>}
            <div><dt className="text-slate-500">Peran</dt><dd>{s.roles.length ? s.roles.map((r) => <div key={r} className="mt-1"><span className="badge badge-accent">{ROLE_LABELS[r]}</span><p className="mt-1 text-slate-600">{ROLE_DESCRIPTIONS[r]}</p></div>) : "-"}</dd></div>
          </dl>
          <p className="text-xs text-slate-500">Username dan peran diatur oleh administrator.</p>
        </div>
        <ChangePasswordForm username={s.profile.username} forced={forced} />
      </div>
    </section>
  );
}
