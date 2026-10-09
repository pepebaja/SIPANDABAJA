"use client";
import { useActionState, useEffect, useState } from "react";
import { createFirstAdminAction, type SetupState } from "@/app/setup/actions";
import { PasswordInput, PasswordRules } from "@/components/password-input";

export function SetupForm() {
  const [s, action, pending] = useActionState<SetupState, FormData>(createFirstAdminAction, {});
  const [pw, setPw] = useState(""), [cf, setCf] = useState(""), [u, setU] = useState("");
  useEffect(() => { if (s.ok) window.location.href = "/login?baru=1"; }, [s]);
  return (
    <form action={action} className="space-y-4" autoComplete="off">
      <label className="field-label">Kode setup *<PasswordInput name="token" autoComplete="off" /><span className="field-hint">Nilai variabel SETUP_TOKEN yang Anda atur di Vercel.</span></label>
      <label className="field-label">Username *<input name="username" value={u} onChange={(e) => setU(e.target.value.toLowerCase())} required autoCapitalize="none" className="mt-1 w-full font-mono" placeholder="contoh: admin.utama" /></label>
      <label className="field-label">Nama lengkap *<input name="full_name" required className="mt-1 w-full" /></label>
      <div><label className="field-label">Password *<PasswordInput name="password" value={pw} onChange={setPw} /></label><PasswordRules password={pw} username={u} /></div>
      <label className="field-label">Ulangi password *<PasswordInput name="confirm" value={cf} onChange={setCf} /></label>
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}
      <button disabled={pending} className="btn btn-primary w-full">{pending ? "Membuat akun..." : "Buat Super Admin"}</button>
    </form>
  );
}
