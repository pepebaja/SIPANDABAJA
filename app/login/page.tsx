"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Brand } from "@/components/logo";
import { Icon, type IconName } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";

const FEATURES: [IconName, string, string][] = [
  ["database", "Anggaran & RUP terpadu", "Impor anggaran, kelola paket RUP dan paket pengadaan dalam satu tempat."],
  ["chart", "Realisasi terverifikasi", "Pantau pagu, realisasi, dan sisa anggaran secara akurat dan real-time."],
  ["shield", "Akses berbasis peran", "Setiap pengguna hanya melihat dan mengubah data sesuai kewenangannya."],
];

function LoginForm() {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const baru = useSearchParams().get("baru");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: f.get("username"), password: f.get("password") }) });
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
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      <button disabled={busy} className="btn btn-primary w-full py-3.5 text-base">{busy ? "Memproses..." : "Masuk"}</button>
      <p className="text-center text-sm text-slate-500">Belum punya akun? Hubungi administrator aplikasi.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="grid-bg absolute inset-0" aria-hidden="true" />
        <div className="absolute -left-24 top-1/3 h-96 w-96 animate-float rounded-full bg-cyan-500/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -right-20 bottom-10 h-96 w-96 animate-float rounded-full bg-indigo-500/25 blur-3xl [animation-delay:-4s]" aria-hidden="true" />
        <div className="relative"><Brand /></div>
        <div className="relative max-w-lg space-y-8">
          <div><h2 className="font-display text-4xl font-bold leading-tight text-white">Kelola pengadaan dan anggaran <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">lebih cepat, rapi, dan transparan.</span></h2></div>
          <ul className="space-y-5">{FEATURES.map(([icon, t, d]) => (
            <li key={t} className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-300"><Icon name={icon} /></span>
              <span><span className="block font-semibold text-white">{t}</span><span className="text-sm leading-relaxed text-slate-300">{d}</span></span></li>))}</ul>
        </div>
        <p className="relative text-xs text-slate-400">© {new Date().getFullYear()} SIPANDABAJA</p>
      </section>
      <section className="grid place-items-center bg-white p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex lg:hidden"><span className="rounded-xl bg-navy-900 px-4 py-3"><Brand compact /></span></div>
          <Suspense><LoginForm /></Suspense>
        </div>
      </section>
    </main>
  );
}
