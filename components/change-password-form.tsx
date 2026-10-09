"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { changePasswordAction, type AccountState } from "@/app/(app)/akun/actions";
import { PasswordInput, PasswordRules } from "@/components/password-input";

export function ChangePasswordForm({ username, forced }: { username: string; forced: boolean }) {
  const [s, action, pending] = useActionState<AccountState, FormData>(changePasswordAction, {});
  const [pw, setPw] = useState(""), [cf, setCf] = useState(""); const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.ok) { ref.current?.reset(); setPw(""); setCf(""); if (forced) window.location.href = "/"; } }, [s, forced]);
  return (
    <form ref={ref} action={action} className="card space-y-4 p-5">
      <div><p className="eyebrow">Keamanan</p><h2>Ganti password</h2></div>
      <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
      <label className="field-label">Password saat ini *<PasswordInput name="current" autoComplete="current-password" /></label>
      <div><label className="field-label">Password baru *<PasswordInput name="password" value={pw} onChange={setPw} /></label><PasswordRules password={pw} username={username} /></div>
      <label className="field-label">Ulangi password baru *<PasswordInput name="confirm" value={cf} onChange={setCf} />
        {cf && pw !== cf && <span className="mt-1 block text-xs font-medium text-red-700">Konfirmasi belum sama.</span>}</label>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      {s.ok && <p role="status" className="alert alert-ok">Password berhasil diganti.</p>}
      <button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan password baru"}</button>
    </form>
  );
}
