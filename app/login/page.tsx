"use client";
import { useState } from "react";
export default function LoginPage() {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: f.get("username"), password: f.get("password") }) });
    if (res.ok) { window.location.href = "/"; return; }
    setError((await res.json().catch(() => null))?.error ?? "Terjadi kesalahan. Coba lagi."); setBusy(false);
  }
  return (
    <main className="min-h-screen grid place-items-center bg-navy-900 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg bg-white p-8 shadow-xl space-y-5">
        <div><h1 className="text-xl font-semibold text-navy-800">SIPANDA PBJ</h1>
          <p className="text-sm text-slate-600">Masuk dengan username dan password Anda.</p></div>
        <label className="block text-sm font-medium">Username
          <input name="username" autoComplete="username" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium">Password
          <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded bg-teal-600 py-2 font-medium text-white hover:bg-teal-700 disabled:opacity-60">{busy ? "Memproses..." : "Masuk"}</button>
      </form>
    </main>
  );
}
