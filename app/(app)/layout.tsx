import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CONTEXT_COOKIE, decodeContext } from "@/lib/context";
import { ContextPicker } from "@/components/context-picker";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const [{ data: years }, { data: stages }, { data: org }, saved] = await Promise.all([
    sb.from("budget_years").select("id, year").eq("is_active", true).order("year"),
    sb.from("budget_stages").select("id, code, name").eq("is_active", true).order("sort_order"),
    sb.from("organizations").select("name").maybeSingle(),
    cookies().then((c) => decodeContext(c.get(CONTEXT_COOKIE)?.value))]);
  const y = years?.find((r) => r.id === saved?.yearId) ?? years?.[0];
  const s = stages?.find((r) => r.id === saved?.stageId) ?? stages?.[0];
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-navy-800 px-6 py-3 text-white">
        <div><p className="font-semibold">SIPANDA PBJ</p><p className="text-xs text-white/70">{org?.name}</p></div>
        {y && s ? <ContextPicker years={years!.map((r) => ({ id: r.id, label: String(r.year) }))} stages={stages!.map((r) => ({ id: r.id, label: r.name }))} yearId={y.id} stageId={s.id} />
          : <p className="text-sm">Tahun/tahapan anggaran belum disiapkan.</p>}
        <form action="/api/auth/logout" method="post"><button className="rounded border border-white/40 px-3 py-1 text-sm hover:bg-white/10">Keluar</button></form>
      </header>
      <nav className="flex gap-4 border-b bg-white px-6 py-2 text-sm"><Link href="/">Beranda</Link><Link href="/anggaran/impor">Impor anggaran</Link><Link href="/rup">Paket RUP</Link><Link href="/paket">Paket pengadaan</Link><Link href="/master">Master data</Link></nav>
      {s && s.code !== "MURNI" && <p className="bg-amber-100 px-6 py-1.5 text-sm text-amber-900">Tahapan aktif: <b>{s.name}</b>. Seluruh data di bawah mengikuti tahapan ini.</p>}
      <div className="p-6">{children}</div>
    </div>
  );
}
