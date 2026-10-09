"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { passwordIssues } from "@/lib/users";

export function PasswordInput({ name, value, onChange, autoComplete = "new-password", id, placeholder }: { name: string; value?: string; onChange?: (v: string) => void; autoComplete?: string; id?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const controlled = value !== undefined;
  return (
    <div className="relative mt-1">
      <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required placeholder={placeholder} className="w-full pr-12"
        {...(controlled ? { value, onChange: (e) => onChange?.(e.target.value) } : {})} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-cyan-800"><Icon name={show ? "eyeoff" : "eye"} className="h-5 w-5" /></button>
    </div>
  );
}

const RULES: [string, (p: string) => boolean][] = [
  ["Minimal 10 karakter", (p) => p.length >= 10], ["Huruf besar (A-Z)", (p) => /[A-Z]/.test(p)],
  ["Huruf kecil (a-z)", (p) => /[a-z]/.test(p)], ["Angka (0-9)", (p) => /\d/.test(p)],
];
export function PasswordRules({ password, username }: { password: string; username?: string }) {
  const extra = password ? passwordIssues(password, username).filter((i) => i.startsWith("tidak")) : [];
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-label="Syarat password">
      {RULES.map(([label, ok]) => { const pass = ok(password); return (
        <li key={label} className={pass ? "font-medium text-emerald-700" : "text-slate-500"}><span aria-hidden="true">{pass ? "✓" : "○"}</span> {label}</li>); })}
      {extra.map((e) => <li key={e} className="col-span-2 font-medium text-red-700">✗ Password {e}</li>)}
    </ul>
  );
}
