"use client";
import { useActionState, useEffect, useState } from "react";
import { resetPasswordAction, setActiveAction, updateUserAction, type UserFormState } from "@/app/(app)/pengguna/actions";
import { PasswordInput, PasswordRules } from "@/components/password-input";
import { CredentialsCard } from "@/components/credentials-card";
import { Icon } from "@/components/icons";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/rbac";
import { generatePassword } from "@/lib/users";

export type ManagedUser = { id: string; username: string; full_name: string; nip: string | null; role: Role | null; is_active: boolean };
type Tab = "data" | "password" | "status";
const Msg = ({ s }: { s: UserFormState }) => <>{s.error && <p role="alert" className="alert alert-error">{s.error}</p>}{s.ok && !s.credentials && <p role="status" className="alert alert-ok">{s.message}</p>}</>;

export function UserManage({ user, roles, isSelf }: { user: ManagedUser; roles: Role[]; isSelf: boolean }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState<Tab>("data");
  const [u, upd, updPending] = useActionState<UserFormState, FormData>(updateUserAction, {});
  const [r, reset, resetPending] = useActionState<UserFormState, FormData>(resetPasswordAction, {});
  const [a, act, actPending] = useActionState<UserFormState, FormData>(setActiveAction, {});
  const [pw, setPw] = useState(""), [cf, setCf] = useState(""), [role, setRole] = useState<Role>(user.role ?? roles[0]!);
  useEffect(() => { if (r.ok) { setPw(""); setCf(""); } }, [r]);
  useEffect(() => { if (!open) return; const f = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [open]);
  const roleOptions = user.role && !roles.includes(user.role) ? [user.role, ...roles] : roles;
  const tabs: [Tab, string][] = [["data", "Data & peran"], ["password", "Reset password"], ["status", "Status akun"]];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">Kelola</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Kelola ${user.username}`} className="card max-h-[92vh] w-full max-w-lg animate-rise overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div><p className="eyebrow">Kelola akun</p><h2 className="font-mono">{user.username}</h2><p className="text-sm text-slate-600">{user.full_name}</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Icon name="x" /></button>
            </div>
            <div role="tablist" className="flex gap-1 border-b border-slate-200 px-5 pt-3">
              {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
                className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? "border-cyan-700 text-cyan-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>)}
            </div>
            <div className="space-y-4 p-5">
              {tab === "data" && (
                <form action={upd} className="space-y-4">
                  <input type="hidden" name="id" value={user.id} />
                  <label className="field-label">Nama lengkap *<input name="full_name" defaultValue={user.full_name} required maxLength={120} className="mt-1 w-full" /></label>
                  <label className="field-label">NIP<input name="nip" defaultValue={user.nip ?? ""} inputMode="numeric" className="mt-1 w-full font-mono" /></label>
                  <label className="field-label">Peran *
                    <select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf} className="mt-1 w-full">{roleOptions.map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}</select>
                    {isSelf && <input type="hidden" name="role" value={role} />}
                    <span className="field-hint">{isSelf ? "Peran akun sendiri tidak dapat diubah." : ROLE_DESCRIPTIONS[role]}</span></label>
                  <Msg s={u} />
                  <button disabled={updPending} className="btn btn-primary">{updPending ? "Menyimpan..." : "Simpan perubahan"}</button>
                </form>)}
              {tab === "password" && (isSelf ? <p className="alert alert-info">Ubah password Anda sendiri lewat menu <b>Akun saya</b>.</p> : (
                <form action={reset} className="space-y-4" autoComplete="off">
                  <input type="hidden" name="id" value={user.id} />
                  <div><div className="flex items-end justify-between"><label htmlFor={`pw-${user.id}`} className="field-label">Password sementara baru *</label>
                    <button type="button" onClick={() => { const p = generatePassword(); setPw(p); setCf(p); }} className="link inline-flex items-center gap-1 text-sm"><Icon name="refresh" className="h-4 w-4" />Buat acak</button></div>
                    <PasswordInput id={`pw-${user.id}`} name="password" value={pw} onChange={setPw} /><PasswordRules password={pw} username={user.username} /></div>
                  <label className="field-label">Ulangi password *<PasswordInput name="confirm" value={cf} onChange={setCf} /></label>
                  <p className="alert alert-info text-xs">Pengguna wajib mengganti password ini saat masuk berikutnya.</p>
                  <Msg s={r} />{r.ok && r.credentials && <CredentialsCard username={r.credentials.username} password={r.credentials.password} note={r.message ?? "Password diatur ulang."} />}
                  <button disabled={resetPending} className="btn btn-primary">{resetPending ? "Memproses..." : "Atur ulang password"}</button>
                </form>))}
              {tab === "status" && (
                <form action={act} className="space-y-4">
                  <input type="hidden" name="id" value={user.id} /><input type="hidden" name="active" value={String(!user.is_active)} />
                  <p className="text-sm text-slate-700">Status saat ini: <span className={`badge ${user.is_active ? "badge-ok" : "badge-off"}`}>{user.is_active ? "Aktif" : "Nonaktif"}</span></p>
                  <p className="text-sm text-slate-600">{user.is_active ? "Akun nonaktif tidak dapat masuk dan sesi yang berjalan akan ditolak. Data historis tetap tersimpan." : "Mengaktifkan kembali akan mengizinkan pengguna masuk lagi."}</p>
                  <Msg s={a} />
                  {isSelf ? <p className="alert alert-info">Anda tidak dapat menonaktifkan akun Anda sendiri.</p>
                    : <button disabled={actPending} className={`btn ${user.is_active ? "btn-danger" : "btn-primary"}`}>{actPending ? "Memproses..." : user.is_active ? "Nonaktifkan akun" : "Aktifkan akun"}</button>}
                </form>)}
            </div>
          </div>
        </div>)}
    </>
  );
}
