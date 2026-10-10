"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import type { ContextOptions } from "@/lib/server/context-options";

export function LoginForm({ options }: { options: ContextOptions | null }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [yearId, setYearId] = useState(options?.defaultYearId ?? ""), [stageId, setStageId] = useState(options?.defaultStageId ?? "");
  const baru = useSearchParams().get("baru");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: f.get("username"), password: f.get("password"), ...(options ? { yearId, stageId } : {}) }) });
      if (res.ok) { window.location.href = "/"; return; }
      setError((await res.json().catch(() => null))?.error ?? "Terjadi kesalahan. Coba lagi.");
    } catch { setError("Tidak dapat terhubung ke server. Periksa koneksi Anda."); }
    setBusy(false);
  }
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
      <div><p className="eyebrow">Selamat datang</p><h1 className="mt-1 font-display text-3xl font-bold">Masuk ke akun Anda</h1>
        <p className="mt-2 text-slate-600">Gunakan username dan password yang diberikan administrator.</p></div>
      {baru && <p role="status" className="alert alert-ok">Akun Super Admin berhasil dibuat. Silakan masuk.</p>}
      <label className="field-label">Username
        <div className="relative mt-1"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-slate-400"><Icon name="user" className="h-5 w-5" /></span>
          <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus placeholder="username Anda" className="w-full py-3 pl-11" /></div></label>
      <label className="field-label">Password<PasswordInput name="password" autoComplete="current-password" placeholder="••••••••••" /></label>
      {options && (
        <fieldset className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-800">Tahun &amp; tahapan anggaran</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label">Tahun<select value={yearId} onChange={(e) => setYearId(e.target.value)} className="mt-1 w-full">{options.years.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label className="field-label">Tahapan<select value={stageId} onChange={(e) => setStageId(e.target.value)} className="mt-1 w-full">{options.stages.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          </div>
          <p className="mt-2 text-xs text-slate-600">Seluruh data aplikasi akan mengikuti pilihan ini. Dapat diganti kapan saja di bagian atas aplikasi.</p>
        </fieldset>)}
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3.5 text-base">{busy ? "Memproses..." : "Masuk"}</button>
      <p className="text-center text-sm text-slate-500">Belum punya akun? Hubungi administrator aplikasi.</p>
    </form>
  );
}
