import { pickContext } from "@/lib/context";
import { getContextBase } from "@/lib/server/budget-context";
import { ContextPicker } from "@/components/context-picker";
import { Shell, type NavGroup } from "@/components/sidebar";
import { getSession } from "@/lib/server/session";
import { can, ROLE_LABELS } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [base, session] = await Promise.all([getContextBase(), getSession()]); // dibagi dengan halaman: tanpa kueri ganda
  const { years, stages, orgName } = base, { y, s } = pickContext(years, stages, base.saved);
  const groups: NavGroup[] = [
    { title: "Utama", items: [{ href: "/", label: "Beranda", icon: "home" }, { href: "/anggaran/impor", label: "Impor anggaran", icon: "upload" }, { href: "/rup", label: "Paket RUP", icon: "file" },
      { href: "/kas", label: "Anggaran kas", icon: "wallet" }, { href: "/realisasi", label: "Input Realisasi", icon: "chart", also: ["/paket"] }, { href: "/laporan", label: "Laporan & dokumen", icon: "printer" }] },
    { title: "Pengelolaan", items: [{ href: "/master", label: "Master data", icon: "database" },
      ...(session && can(session.roles, "users:read") ? [{ href: "/pengguna", label: "Pengguna", icon: "users" as const }] : []),
      ...(session && can(session.roles, "audit:read") ? [{ href: "/audit", label: "Log audit", icon: "clipboard" as const }] : []),
      ...(session && can(session.roles, "print-profile:write") ? [{ href: "/pengaturan", label: "Pengaturan", icon: "settings" as const }] : []),
      { href: "/panduan", label: "Panduan", icon: "book" }, { href: "/akun", label: "Akun saya", icon: "user" }] },
  ];
  const topbar = y && s
    ? <ContextPicker years={years.map((r) => ({ id: r.id, label: String(r.year) }))} stages={stages.map((r) => ({ id: r.id, label: r.name }))} yearId={y.id} stageId={s.id} />
    : <p className="text-sm text-slate-600">Tahun/tahapan anggaran belum disiapkan.</p>;
  return (
    <Shell groups={groups} orgName={orgName} topbar={topbar}
      user={{ name: session?.profile.full_name ?? "Pengguna", username: session?.profile.username ?? "-", role: session?.roles[0] ? ROLE_LABELS[session.roles[0]] : "Tanpa peran" }}>
      {s && s.code !== "MURNI" && <p className="alert alert-warn mb-5 print:hidden">Tahapan aktif: <b>{s.name}</b>. Seluruh data di bawah mengikuti tahapan ini.</p>}
      {children}
    </Shell>
  );
}
