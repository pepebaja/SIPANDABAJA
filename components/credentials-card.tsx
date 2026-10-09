"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";
export function CredentialsCard({ username, password, note }: { username: string; password: string; note: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* abaikan */ }
  }
  return (
    <div role="status" className="alert alert-ok space-y-2">
      <p className="font-semibold">{note}</p>
      <p>Catat dan sampaikan kredensial ini kepada pengguna. <b>Password hanya ditampilkan sekali</b> dan tidak dapat dilihat lagi.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 rounded-lg bg-white/70 px-3 py-2 font-mono text-sm">
        <dt className="text-slate-500">Username</dt><dd className="font-semibold">{username}</dd>
        <dt className="text-slate-500">Password</dt><dd className="select-all break-all font-semibold">{password}</dd>
      </dl>
      <button type="button" onClick={copy} className="btn btn-ghost btn-sm"><Icon name="copy" className="h-4 w-4" />{copied ? "Tersalin" : "Salin kredensial"}</button>
    </div>
  );
}
