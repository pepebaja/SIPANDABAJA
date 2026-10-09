import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { UserForm } from "@/components/user-form";
import { UserManage } from "@/components/user-manage";
import { assignableRoles, can, canManageTarget, ROLE_LABELS, type Role } from "@/lib/rbac";
export const metadata = { title: "Pengguna" };
const PAGE = 25;
export default async function PenggunaPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const s = await getSession();
  if (!s || !can(s.roles, "users:read")) return <p role="alert" className="alert alert-error max-w-xl">Anda tidak berwenang melihat daftar pengguna.</p>;
  const sp = await searchParams, sb = await createClient(), manage = can(s.roles, "users:manage");
  const q = (sp.q ?? "").replace(/[%,()*]/g, " ").trim().slice(0, 60), page = Math.max(1, Number(sp.page) || 1);
  let query = sb.from("profiles").select("id, username, full_name, nip, is_active", { count: "exact" }).order("username").range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
  const { data, count, error } = await query;
  const ids = (data ?? []).map((u) => u.id);
  const { data: rl } = ids.length ? await sb.from("user_roles").select("user_id, role").in("user_id", ids) : { data: [] as { user_id: string; role: string }[] };
  const rolesOf = (id: string) => (rl ?? []).filter((r) => r.user_id === id).map((r) => r.role as Role);
  const mine = assignableRoles(s.roles), pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/pengguna?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <section className={`grid gap-6 ${manage ? "xl:grid-cols-[1fr_24rem]" : ""}`}>
      <div className="min-w-0 space-y-4">
        <div><p className="eyebrow">Pengelolaan</p><h1 className="page-title">Pengguna</h1>
          <p className="page-desc">Akun masuk memakai <b>username</b> (bukan email). {manage ? "Buat akun, atur peran, reset password, dan nonaktifkan akun yang tidak lagi dipakai." : "Anda hanya dapat melihat daftar pengguna."}</p></div>
        <form className="flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Cari username atau nama" className="w-full max-w-xs" /><button className="btn btn-dark">Cari</button></form>
        {error ? <p role="alert" className="alert alert-error">Data pengguna tidak dapat dimuat.</p> : !data?.length ? <p className="text-slate-600">{q ? "Tidak ada pengguna yang cocok." : "Belum ada pengguna."}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>Status</th>{manage && <th>Aksi</th>}</tr></thead>
            <tbody>{data.map((u) => { const roles = rolesOf(u.id), self = u.id === s.userId; return (
              <tr key={u.id}>
                <td className="font-mono font-semibold text-navy-800">{u.username}{self && <span className="badge badge-info ml-2">Anda</span>}</td>
                <td>{u.full_name}{u.nip && <span className="block font-mono text-xs text-slate-500">NIP {u.nip}</span>}</td>
                <td>{roles.length ? roles.map((r) => <span key={r} className="badge badge-accent mr-1">{ROLE_LABELS[r]}</span>) : <span className="text-slate-400">-</span>}</td>
                <td><span className={`badge ${u.is_active ? "badge-ok" : "badge-off"}`}>{u.is_active ? "Aktif" : "Nonaktif"}</span></td>
                {manage && <td>{canManageTarget(s.roles, roles) ? <UserManage user={{ id: u.id, username: u.username, full_name: u.full_name, nip: u.nip, role: roles[0] ?? null, is_active: u.is_active }} roles={mine} isSelf={self} /> : <span className="text-xs text-slate-400">Dilindungi</span>}</td>}
              </tr>); })}</tbody></table></div>)}
        <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages} ({count ?? 0} pengguna)</span>{page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
      </div>
      {manage && <aside><UserForm roles={mine} /></aside>}
    </section>
  );
}
