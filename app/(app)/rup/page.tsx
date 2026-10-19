import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { fetchAll } from "@/lib/server/fetch-all";
import { can } from "@/lib/rbac";
import { RupForm } from "@/components/rup-form";
import { RupImport } from "@/components/rup-import";
import { ConfirmButton } from "@/components/confirm-button";
import { rp } from "@/lib/format";
import { fmtDateTime } from "@/lib/date";
import { parseRupiah } from "@/lib/import/parse";
import { toCents } from "@/lib/money";
import { deleteRup, deleteRupImportJob } from "./actions";
const TYPES: Record<string, string> = { barang: "Barang", konstruksi: "Konstruksi", konsultansi: "Konsultansi", jasa_lainnya: "Jasa lainnya" };
const PAGE = 50;
export default async function RupPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; deleted?: string; error?: string }> }) {
  const sp = await searchParams, ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const [sb, session] = [await createClient(), await getSession()];
  const canWrite = !!session && can(session.roles, "rup:write"), vid = ctx.versionId;
  const q = (sp.q ?? "").trim().slice(0, 80).replace(/[%,()*\\]/g, " "), page = Math.max(1, Number(sp.page) || 1);
  let query = sb.from("rup_packages").select("id, rup_code, name, procurement_type, pagu, verification_status", { count: "exact" }).eq("budget_version_id", vid).order("rup_code").range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`rup_code.ilike.%${q}%,name.ilike.%${q}%`);
  const [{ data, count, error }, { data: m }, { data: jobs }] = await Promise.all([query,
    sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name"),
    sb.from("import_jobs").select("id, file_name, status, ok_rows, error_rows, created_at").eq("kind", "rup_packages").eq("budget_version_id", vid).order("created_at", { ascending: false }).limit(5)]);
  const ids = (data ?? []).map((r) => r.id);
  const al = ids.length ? await fetchAll<any>((a, b) => sb.from("package_budget_allocations").select("id, rup_package_id, amount").in("rup_package_id", ids).order("id").range(a, b)) : [];
  const used = new Map<string, bigint>(); for (const a of al) used.set(a.rup_package_id, (used.get(a.rup_package_id) ?? 0n) + toCents(parseRupiah(a.amount) ?? "0.00"));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE)), href = (p: number) => `/rup?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <section className="space-y-6">
      <h1 className="page-title">Paket RUP <span className="page-sub">Tahun {ctx.year}, {ctx.stageName}</span></h1>
      <p className="max-w-4xl text-sm text-slate-600">Data diperoleh dari <b>unggahan file RUP SIRUP</b> dan/atau <b>input manual</b>. Saat anggaran bergeser atau berubah sehingga RUP ikut disesuaikan, unggah file SIRUP terbaru atau ubah/tambah/hapus paket secara manual.</p>
      {sp.deleted && <p role="status" className="alert alert-ok">Paket RUP dihapus.</p>}
      {sp.error && <p role="alert" className="alert alert-error">Aksi gagal. Anda mungkin tidak berwenang.</p>}
      {canWrite && <RupImport />}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-3">
          <form className="flex flex-wrap items-end gap-2" role="search"><label className="text-sm font-medium">Cari kode atau nama<input name="q" defaultValue={q} className="ml-2 py-1.5" /></label><button className="btn btn-ghost btn-sm">Cari</button>{q && <Link className="link text-sm" href="/rup">Reset</Link>}</form>
          {error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat.</p> : !data?.length ? <p className="text-slate-600">{q ? "Tidak ada paket yang cocok." : `Belum ada paket RUP. Unggah file SIRUP${canWrite ? " atau tambahkan lewat formulir" : ""}.`}</p> : (
            <div className="table-wrap"><table><thead><tr><th>Kode RUP</th><th>Nama</th><th>Jenis</th><th className="text-right">Pagu</th><th className="text-right">Dialokasikan</th><th>Verifikasi</th>{canWrite && <th>Aksi</th>}</tr></thead>
              <tbody>{data.map((r) => { const u = used.get(r.id) ?? 0n, over = u > toCents(parseRupiah(r.pagu) ?? "0.00"); return (
                <tr key={r.id}><td><Link className="link" href={`/rup/${r.id}`}>{r.rup_code}</Link></td><td>{r.name}</td><td>{TYPES[r.procurement_type]}</td><td className="text-right tabular-nums">{rp(r.pagu)}</td>
                  <td className="text-right tabular-nums">{rp(`${u / 100n}.${String(u % 100n).padStart(2, "0")}`)}{over && <span className="badge badge-warn ml-2">Melebihi pagu</span>}</td>
                  <td>{r.verification_status === "verified" ? "Terverifikasi" : "Belum diverifikasi"}</td>
                  {canWrite && <td className="whitespace-nowrap"><Link className="link mr-3" href={`/rup/${r.id}`}>Ubah</Link>
                    <form action={deleteRup} className="inline"><input type="hidden" name="id" value={r.id} /><ConfirmButton className="link text-red-700" message={`Hapus paket RUP ${r.rup_code}? Alokasi rekening paket ini ikut terhapus; paket pengadaan yang bertaut hanya dilepas tautannya.`}>Hapus</ConfirmButton></form></td>}</tr>); })}</tbody></table></div>)}
          <nav className="flex items-center gap-3 text-sm" aria-label="Halaman"><span>{count ?? 0} paket</span>{page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
          {!!jobs?.length && (
            <div className="space-y-1"><h2 className="font-semibold">Riwayat unggahan RUP <span className="text-xs font-normal text-slate-500">(waktu dalam WIB)</span></h2>
              <div className="table-wrap"><table><thead><tr><th>File</th><th>Status</th><th>Valid</th><th>Bermasalah</th><th>Waktu</th>{canWrite && <th>Aksi</th>}</tr></thead>
                <tbody>{jobs.map((j) => <tr key={j.id}><td>{j.file_name}</td><td>{j.status === "confirmed" ? "Diterapkan" : "Menunggu konfirmasi"}</td><td>{j.ok_rows}</td><td>{j.error_rows}</td><td className="whitespace-nowrap">{fmtDateTime(j.created_at)}</td>
                  {canWrite && <td>{j.status === "confirmed" ? <span className="text-xs text-slate-500">Arsip</span> : <form action={deleteRupImportJob}><input type="hidden" name="jobId" value={j.id} /><ConfirmButton className="btn btn-danger btn-sm" message={`Hapus riwayat unggahan "${j.file_name}"?`}>Hapus</ConfirmButton></form>}</td>}</tr>)}</tbody></table></div></div>)}
        </div>
        {canWrite && <div><RupForm methods={(m ?? []).map((r) => ({ value: r.id, label: r.name }))} /></div>}
      </div>
    </section>);
}
