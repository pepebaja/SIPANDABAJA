import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { ACTION_LABELS, TABLE_LABELS, actionLabel, auditSummary, tableLabel } from "@/lib/audit-labels";
import { fmtDateTime } from "@/lib/date";
export const metadata = { title: "Log audit" };
const PAGE = 50;
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tabel?: string; aksi?: string; page?: string }> }) {
  const s = await getSession();
  if (!s || !can(s.roles, "audit:read")) return <p role="alert" className="alert alert-error max-w-xl">Anda tidak berwenang membuka log audit.</p>;
  const sp = await searchParams, sb = await createClient(), page = Math.max(1, Number(sp.page) || 1);
  const tabel = sp.tabel && TABLE_LABELS[sp.tabel] ? sp.tabel : "", aksi = sp.aksi && ACTION_LABELS[sp.aksi] ? sp.aksi : "";
  let q = sb.from("audit_logs").select("id, created_at, actor_id, action, table_name, new_data, old_data", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (tabel) q = q.eq("table_name", tabel);
  if (aksi) q = q.eq("action", aksi);
  const { data, count, error } = await q;
  const ids = [...new Set((data ?? []).map((l) => l.actor_id).filter(Boolean))] as string[];
  const { data: us } = ids.length ? await sb.from("profiles").select("id, username").in("id", ids) : { data: [] as { id: string; username: string }[] };
  const un = new Map((us ?? []).map((u) => [u.id, u.username])), pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/audit?${new URLSearchParams({ ...(tabel ? { tabel } : {}), ...(aksi ? { aksi } : {}), page: String(p) })}`;
  return (
    <section className="max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Pengelolaan</p><h1 className="page-title">Log audit</h1><p className="page-desc">Jejak siapa mengubah apa dan kapan. Catatan tidak dapat diubah dari aplikasi.</p></div>
        <div className="flex gap-2"><Link href="/laporan/log-audit" className="btn btn-ghost btn-sm">Cetak</Link><a href="/api/laporan/log-audit" className="btn btn-ghost btn-sm">Excel</a></div>
      </div>
      <form className="flex flex-wrap items-end gap-3">
        <label className="field-label">Objek<select name="tabel" defaultValue={tabel} className="mt-1 block"><option value="">Semua</option>{Object.entries(TABLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field-label">Aksi<select name="aksi" defaultValue={aksi} className="mt-1 block"><option value="">Semua</option>{Object.entries(ACTION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button className="btn btn-dark">Terapkan</button>
      </form>
      {error ? <p role="alert" className="alert alert-error">Log audit tidak dapat dimuat.</p> : !data?.length ? <p className="text-slate-600">Tidak ada catatan.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Objek</th><th>Keterangan</th></tr></thead>
          <tbody>{data.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
            <td className="font-mono text-sm">{l.actor_id ? (un.get(l.actor_id) ?? "-") : "Sistem"}</td>
            <td><span className={`badge ${l.action === "DELETE" || l.action === "USER_DEACTIVATE" ? "badge-warn" : "badge-info"}`}>{actionLabel(l.action)}</span></td>
            <td>{tableLabel(l.table_name)}</td><td className="max-w-md break-words text-slate-700">{auditSummary(l)}</td></tr>)}</tbody></table></div>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages} ({count ?? 0} catatan)</span>{page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
    </section>
  );
}
