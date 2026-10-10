import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { formatRupiah } from "@/lib/format";
import { parseRupiah } from "@/lib/import/parse";
import { todayIso } from "@/lib/date";
import { Icon } from "@/components/icons";
export const metadata = { title: "Paket pengadaan" };
const PAGE = 25;
const KELOMPOK: Record<string, string> = { sudah_diproses: "Sudah diproses", belum_diproses: "Belum diproses", selesai: "Selesai", tidak_aktif: "Tidak aktif" };
const safe = (codes: string[]) => codes.filter((c) => /^[A-Za-z0-9_]+$/.test(c));
export default async function PaketPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string; kelompok?: string; filter?: string }> }) {
  const sp = await searchParams; const ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const q = (sp.q ?? "").replace(/[%,()*]/g, " ").trim().slice(0, 80), page = Math.max(1, Number(sp.page) || 1);
  const sb = await createClient();
  const { data: sts } = await sb.from("package_statuses").select("code, name, stage_group, needs_followup").eq("is_active", true).order("sort_order");
  const meta = sts ?? [], codes = (f: (s: (typeof meta)[number]) => boolean) => safe(meta.filter(f).map((s) => s.code));
  const status = meta.some((s) => s.code === sp.status) ? sp.status! : "", kelompok = KELOMPOK[sp.kelompok ?? ""] ? sp.kelompok! : "", tl = sp.filter === "tindak-lanjut";
  let query = sb.from("procurement_packages").select("id, internal_code, name, pagu, status, due_date, rup_package_id", { count: "exact" })
    .eq("budget_version_id", ctx.versionId).order("internal_code").range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,internal_code.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  else if (kelompok) { const set = kelompok === "sudah_diproses" ? codes((s) => s.stage_group === "diproses" || s.stage_group === "selesai") : codes((s) => s.stage_group === kelompok); query = query.in("status", set.length ? set : ["__none__"]); }
  else if (tl) {
    const active = codes((s) => s.stage_group !== "tidak_aktif"), done = codes((s) => s.stage_group === "selesai"), fu = codes((s) => s.needs_followup);
    query = query.in("status", active.length ? active : ["__none__"]).or(["rup_package_id.is.null", ...(fu.length ? [`status.in.(${fu.join(",")})`] : []), `and(due_date.lt.${todayIso()},status.not.in.(${done.join(",") || "__none__"}))`].join(","));
  }
  const { data, count, error } = await query;
  const statusName = new Map(meta.map((s) => [s.code, s.name])), pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/paket?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(kelompok ? { kelompok } : {}), ...(tl ? { filter: "tindak-lanjut" } : {}), page: String(p) })}`;
  const active = status ? `Status: ${statusName.get(status)}` : kelompok ? `Kelompok: ${KELOMPOK[kelompok]}` : tl ? "Perlu tindak lanjut" : "";
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Pengadaan</p><h1 className="page-title">Paket pengadaan <span className="page-sub">Tahun {ctx.year} · {ctx.stageName}</span></h1></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/laporan/paket-pengadaan" className="btn btn-ghost"><Icon name="printer" className="h-4 w-4" />Cetak</Link>
          <a href="/api/laporan/paket-pengadaan" className="btn btn-ghost"><Icon name="download" className="h-4 w-4" />Excel</a>
          <Link href="/paket/baru" className="btn btn-primary"><Icon name="plus" className="h-4 w-4" />Tambah paket</Link></div>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="Cari kode atau nama paket" className="w-full max-w-xs" />
        <select name="status" defaultValue={status} aria-label="Filter status"><option value="">Semua status</option>{meta.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
        <button className="btn btn-dark">Terapkan</button>
        {(q || active) && <Link href="/paket" className="link text-sm">Reset</Link>}
      </form>
      {active && <p className="alert alert-info inline-block py-2 text-sm">Filter aktif: <b>{active}</b></p>}
      {error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat. Muat ulang halaman.</p>
        : !data?.length ? <p className="text-slate-600">{q || active ? "Tidak ada paket yang cocok." : "Belum ada paket pada tahun/tahapan ini."}</p> : (
        <div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama paket</th><th className="text-right">Pagu</th><th>Status</th><th>Tenggat</th></tr></thead>
          <tbody>{data.map((p) => <tr key={p.id}><td><Link className="link" href={`/paket/${p.id}`}>{p.internal_code}</Link></td>
            <td>{p.name}{!p.rup_package_id && <span className="badge badge-warn ml-2">Belum ada kode RUP</span>}</td>
            <td className="text-right tabular-nums">{formatRupiah(parseRupiah(p.pagu) ?? "0.00")}</td><td><span className="badge badge-info">{statusName.get(p.status) ?? p.status}</span></td>
            <td className={p.due_date && p.due_date < todayIso() ? "font-semibold text-amber-800" : ""}>{p.due_date ? p.due_date.split("-").reverse().join("/") : "-"}</td></tr>)}</tbody></table></div>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">
        {page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages} ({count ?? 0} paket)</span>
        {page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
    </section>
  );
}
