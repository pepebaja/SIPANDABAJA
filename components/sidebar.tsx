"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Brand } from "@/components/logo";

export type NavItem = { href: string; label: string; icon: IconName };
export type NavGroup = { title: string; items: NavItem[] };

export function Shell({ groups, orgName, user, topbar, children }: { groups: NavGroup[]; orgName: string; user: { name: string; username: string; role: string }; topbar: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname(), [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(`${h}/`));
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      {open && <button aria-label="Tutup menu" className="fixed inset-0 z-30 bg-navy-950/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden bg-navy-950 text-slate-300 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center justify-between px-5 pb-4 pt-6"><Link href="/" aria-label="Beranda"><Brand /></Link>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu"><Icon name="x" /></button></div>
        <p className="relative mx-5 mb-2 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300" title={orgName}>{orgName || "Organisasi"}</p>
        <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 py-3" aria-label="Menu utama">
          {groups.map((g) => (
            <div key={g.title}><p className="mb-2 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{g.title}</p>
              <ul className="space-y-1">{g.items.map((it) => { const on = active(it.href); return (
                <li key={it.href}><Link href={it.href} aria-current={on ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium transition ${on ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-white ring-1 ring-cyan-400/30" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                  <Icon name={it.icon} className={`h-5 w-5 ${on ? "text-cyan-300" : "text-slate-400 group-hover:text-cyan-300"}`} />{it.label}</Link></li>); })}</ul></div>))}
        </nav>
        <div className="relative border-t border-white/10 p-3">
          <Link href="/akun" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-sm font-bold text-white">{initials || "?"}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{user.name}</span><span className="block truncate text-xs text-slate-400">@{user.username} · {user.role}</span></span></Link>
          <form action="/api/auth/logout" method="post" className="mt-1"><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-red-500/10 hover:text-red-300"><Icon name="logout" className="h-5 w-5" />Keluar</button></form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-8">
          <button className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Icon name="menu" /></button>
          <div className="flex min-w-0 flex-1 items-center justify-end lg:justify-between">{topbar}</div>
        </header>
        <main className="mx-auto w-full max-w-[96rem] flex-1 animate-rise p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
