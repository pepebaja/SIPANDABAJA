"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { createUserAction, type UserFormState } from "@/app/(app)/pengguna/actions";
import { PasswordInput, PasswordRules } from "@/components/password-input";
import { CredentialsCard } from "@/components/credentials-card";
import { Icon } from "@/components/icons";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/rbac";
import { generatePassword } from "@/lib/users";

export function UserForm({ roles }: { roles: Role[] }) {
  const [s, action, pending] = useActionState<UserFormState, FormData>(createUserAction, {});
  const [pw, setPw] = useState(""), [cf, setCf] = useState(""), [username, setUsername] = useState(""), [role, setRole] = useState<Role>(roles.includes("viewer") ? "viewer" : roles[0]!);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.ok) { ref.current?.reset(); setPw(""); setCf(""); setUsername(""); } }, [s]);
  const gen = () => { const p = generatePassword(); setPw(p); setCf(p); };
  return (
    <form ref={ref} action={action} className="card space-y-4 p-5" autoComplete="off">
      <div><p className="eyebrow">Akun baru</p><h2>Tambah pengguna</h2></div>
      <label className="field-label">Username *
        <input name="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required minLength={3} maxLength={32} autoCapitalize="none" spellCheck={false} placeholder="contoh: budi.santoso" className="mt-1 w-full font-mono" />
        <span className="field-hint">3-32 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Dipakai untuk masuk, tidak dapat diubah.</span></label>
      <label className="field-label">Nama lengkap *<input name="full_name" required maxLength={120} className="mt-1 w-full" /></label>
      <label className="field-label">NIP (opsional)<input name="nip" inputMode="numeric" maxLength={24} placeholder="18 digit" className="mt-1 w-full font-mono" /></label>
      <label className="field-label">Peran *
        <select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 w-full">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
        <span className="field-hint">{ROLE_DESCRIPTIONS[role]}</span></label>
      <div>
        <div className="flex items-end justify-between"><label htmlFor="new-password" className="field-label">Password sementara *</label>
          <button type="button" onClick={gen} className="link inline-flex items-center gap-1 text-sm"><Icon name="refresh" className="h-4 w-4" />Buat acak</button></div>
        <PasswordInput id="new-password" name="password" value={pw} onChange={setPw} />
        <PasswordRules password={pw} username={username} />
      </div>
      <label className="field-label">Ulangi password *<PasswordInput name="confirm" value={cf} onChange={setCf} />
        {cf && pw !== cf && <span className="mt-1 block text-xs font-medium text-red-700">Konfirmasi belum sama.</span>}</label>
      <p className="alert alert-info text-xs">Pengguna akan diminta mengganti password ini saat pertama kali masuk.</p>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.ok && s.credentials && <CredentialsCard username={s.credentials.username} password={s.credentials.password} note={s.message ?? "Akun dibuat."} />}
      <button disabled={pending} className="btn btn-primary w-full"><Icon name="plus" className="h-4 w-4" />{pending ? "Membuat akun..." : "Buat akun"}</button>
    </form>
  );
}
