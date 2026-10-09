import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CONTEXT_COOKIE, decodeContext } from "@/lib/context";
import { ContextPicker } from "@/components/context-picker";
import { Shell, type NavGroup } from "@/components/sidebar";
import { getSession } from "@/lib/server/session";
import { can, ROLE_LABELS } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const [{ data: years }, { data: stages }, { data: org }, saved, session] = await Promise.all([
    sb.from("budget_years").select("id, year").eq("is_active", true).order("year"),
    sb.from("budget_stages").select("id, code, name").eq("is_active", true).order("sort_order"),
    sb.from("organizations").select("name").maybeSingle(),
    cookies().then((c) => decodeContext(c.get(CONTEXT_COOKIE)?.value)),
    getSession()]);
  const y = years?.find((r) => r.id === saved?.yearId) ?? years?.[0];
  const s = stages?.find((r) => r.id === saved?.stageId) ?? stages?.[0];
  const groups: NavGroup[] = [
    { title: "Utama", items: [{ href: "/", label: "Beranda", icon: "home" }, { href: "/anggaran/impor", label: "Impor anggaran", icon: "upload" }, { href: "/rup", label: "Paket RUP", icon: "file" },
      { href: "/paket", label: "Paket pengadaan", icon: "package" }, { href: "/kas", label: "Anggaran kas", icon: "wallet" }, { href: "/realisasi", label: "Realisasi", icon: "chart" }] },
    { title: "Pengelolaan", items: [{ href: "/master", label: "Master data", icon: "database" },
      ...(session && can(session.roles, "users:read") ? [{ href: "/pengguna", label: "Pengguna", icon: "users" as const }] : []), { href: "/akun", label: "Akun saya", icon: "user" }] },
  ];
  const topbar = y && s
    ? <ContextPicker years={years!.map((r) => ({ id: r.id, label: String(r.year) }))} stages={stages!.map((r) => ({ id: r.id, label: r.name }))} yearId={y.id} stageId={s.id} />
    : <p className="text-sm text-slate-600">Tahun/tahapan anggaran belum disiapkan.</p>;
  return (
    <Shell groups={groups} orgName={org?.name ?? ""} topbar={topbar}
      user={{ name: session?.profile.full_name ?? "Pengguna", username: session?.profile.username ?? "-", role: session?.roles[0] ? ROLE_LABELS[session.roles[0]] : "Tanpa peran" }}>
      {s && s.code !== "MURNI" && <p className="alert alert-warn mb-5">Tahapan aktif: <b>{s.name}</b>. Seluruh data di bawah mengikuti tahapan ini.</p>}
      {children}
    </Shell>
  );
}
