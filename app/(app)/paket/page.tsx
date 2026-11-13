import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { formatRupiah } from "@/lib/format";
import { todayIso } from "@/lib/date";
import { Icon } from "@/components/icons";
import { generatePackagesFromRup, syncWithRealization } from "./actions";
import { JENIS_LABEL } from "@/lib/procurement-profile";
import { PackageRowActions } from "@/components/package-row-actions";
import { loadPackageExecutions } from "@/lib/server/package-executions";
import { summarizeExecutions } from "@/lib/package-executions";
import { parseRupiah } from "@/lib/import/parse";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
export const metadata = { title: "Paket pengadaan" };
const PAGE = 25;
const LENGKAPI: Record<string, string> = { ppbj: "PPBJ belum dipilih", mulai: "Tanggal mulai proses kosong", tenggat: "Tenggat kosong", serah: "Tanggal serah terima kosong", kontrak: "Belum ada kontrak/SP", metode: "Metode pemilihan kosong", kendala: "Terlambat tanpa kategori kendala" };
const KELOMPOK: Record<string, string> = { sudah_diproses: "Sudah diproses", belum_diproses: "Belum diproses", selesai: "Selesai", tidak_aktif: "Tidak aktif" };
const safe = (codes: string[]) => codes.filter((c) => /^[A-Za-z0-9_]+$/.test(c));
export default async function PaketPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string; kelompok?: string; filter?: string; made?: string; sync?: string; lengkapi?: string; carried?: string; refreshed?: string; error?: string }> }) {
  const sp = await searchParams; const ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const q = (sp.q ?? "").replace(/[%,()*]/g, " ").trim().slice(0, 80), page = Math.max(1, Number(sp.page) || 1);
  const sb = await createClient(), session = await getSession(), canWrite = !!session && can(session.roles, "rup:write");
  const { data: sts } = await sb.from("package_statuses").select("code, name, stage_group, needs_followup").eq("is_active", true).order("sort_order");
  const meta = sts ?? [], codes = (f: (s: (typeof meta)[number]) => boolean) => safe(meta.filter(f).map((s) => s.code));
  const status = meta.some((s) => s.code === sp.status) ? sp.status! : "", kelompok = KELOMPOK[sp.kelompok ?? ""] ? sp.kelompok! : "", tl = sp.filter === "tindak-lanjut", lengkapi = LENGKAPI[sp.lengkapi ?? ""] ? sp.lengkapi! : "";
  let query = sb.from("procurement_packages").select("id, internal_code, name, pagu, status, due_date, rup_package_id, method_id, execution_mode, procurement_type, is_recurring, carried_from, ppbj_id, ppk_id, pptk_id, due_date, process_start, process_end, handover_date, obstacle_category, notes, method:procurement_methods(name)" + (lengkapi === "kontrak" ? ", contracts_or_orders(id)" : ""), { count: "exact" })
    .eq("budget_version_id", ctx.versionId).order("internal_code").range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,internal_code.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  else if (kelompok) { const set = kelompok === "sudah_diproses" ? codes((s) => s.stage_group === "diproses" || s.stage_group === "selesai") : codes((s) => s.stage_group === kelompok); query = query.in("status", set.length ? set : ["__none__"]); }
  else if (tl) {
    const active = codes((s) => s.stage_group !== "tidak_aktif"), done = codes((s) => s.stage_group === "selesai"), fu = codes((s) => s.needs_followup);
    query = query.in("status", active.length ? active : ["__none__"]).or(["rup_package_id.is.null", ...(fu.length ? [`status.in.(${fu.join(",")})`] : []), `and(due_date.lt.${todayIso()},is_recurring.eq.false,status.not.in.(${done.join(",") || "__none__"}))`].join(","));
  }
  if (lengkapi) {   // paket yang datanya perlu dilengkapi untuk Laporan Kinerja PPBJ
    const act = codes((s) => s.stage_group !== "tidak_aktif"), run = codes((s) => s.stage_group === "diproses" || s.stage_group === "selesai"), fin = codes((s) => s.stage_group === "selesai"), done = fin;
    query = query.in("status", act.length ? act : ["__none__"]);
    if (lengkapi === "ppbj") query = query.is("ppbj_id", null);
    if (lengkapi === "mulai") query = query.is("process_start", null).in("status", run.length ? run : ["__none__"]);
    if (lengkapi === "tenggat") query = query.is("due_date", null).eq("is_recurring", false);
    if (lengkapi === "serah") query = query.is("handover_date", null).in("status", fin.length ? fin : ["__none__"]);
    if (lengkapi === "kontrak") query = query.is("contracts_or_orders", null).in("status", run.length ? run : ["__none__"]);
    if (lengkapi === "metode") query = query.is("method_id", null);
    if (lengkapi === "kendala") query = query.lt("due_date", todayIso()).eq("is_recurring", false).is("obstacle_category", null).not("status", "in", `(${done.join(",") || "__none__"})`);
  }
  const { data: data0, count, error } = await query, data = (data0 ?? []) as any[];
  const sums = new Map(await Promise.all((data ?? []).filter((p) => p.is_recurring).map(async (p) => [p.id, summarizeExecutions(await loadPackageExecutions(sb, { id: p.id, internal_code: p.internal_code, budget_version_id: ctx.versionId! }), parseRupiah(p.pagu) ?? "0.00")] as const)));   // ringkasan pelaksanaan paket berulang
  const [methodsRes, offRes] = canWrite ? await Promise.all([sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name"), sb.from("officials").select("id, name, nip, official_type").eq("is_active", true).order("name").limit(1000)]) : [null, null];
  const methodOpts = (methodsRes?.data ?? []).map((m) => ({ value: m.id as string, label: m.name as string })), statusOpts = meta.map((m) => ({ value: m.code as string, label: m.name as string }));
  const off = (t: string) => (offRes?.data ?? []).filter((r) => r.official_type === t).map((r) => ({ value: r.id as string, label: r.nip ? `${r.name} - NIP ${r.nip}` : (r.name as string) }));
  const statusName = new Map(meta.map((s) => [s.code, s.name])), pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/paket?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(kelompok ? { kelompok } : {}), ...(tl ? { filter: "tindak-lanjut" } : {}), ...(lengkapi ? { lengkapi } : {}), page: String(p) })}`;
  const active = status ? `Status: ${statusName.get(status)}` : kelompok ? `Kelompok: ${KELOMPOK[kelompok]}` : tl ? "Perlu tindak lanjut" : lengkapi ? `Perlu dilengkapi: ${LENGKAPI[lengkapi]}` : "";
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Pengadaan</p><h1 className="page-title">Paket pengadaan <span className="page-sub">Tahun {ctx.year} · {ctx.stageName}</span></h1></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/laporan/paket-pengadaan" className="btn btn-ghost"><Icon name="printer" className="h-4 w-4" />Cetak</Link>
          <a href="/api/laporan/paket-pengadaan" className="btn btn-ghost"><Icon name="download" className="h-4 w-4" />Excel</a>
          <form action={syncWithRealization}><button className="btn btn-ghost" title="Paket yang sudah punya transaksi di Input Realisasi otomatis dikonfirmasi: status, tanggal proses/serah terima, metode, dan dokumen kontrak dari realisasi">Sinkronkan dengan realisasi</button></form>
          <form action={generatePackagesFromRup}><button className="btn btn-ghost" title="Membuat paket untuk semua RUP yang belum punya paket; paket yang sudah berjalan di tahapan sebelumnya dibawa beserta status dan kontraknya">Buat paket dari semua RUP</button></form>
          <Link href="/paket/baru" className="btn btn-primary"><Icon name="plus" className="h-4 w-4" />Tambah paket</Link></div>
      </div>
      {sp.made !== undefined && <p role="status" className="alert alert-info">{Number(sp.made) + Number(sp.refreshed ?? 0) > 0 ? `${sp.made} paket dibuat dari RUP${Number(sp.carried) > 0 ? `, ${sp.carried} di antaranya dibawa dari tahapan sebelumnya (status, pejabat, dan kontrak ikut)` : ""}${Number(sp.refreshed) > 0 ? `; ${sp.refreshed} paket Rencana disegarkan dari tahapan sebelumnya` : ""}. Lengkapi data yang masih kosong di rincian paket.` : "Semua RUP sudah punya paket."}</p>}
      {sp.sync && (() => { const [c = 0, f = 0, k = 0] = sp.sync.split("-").map(Number); return <p role="status" className="alert alert-info">Sinkronisasi dengan realisasi: <b>{c}</b> paket dikonfirmasi (status dimajukan), <b>{f}</b> paket dilengkapi tanggal/metodenya, <b>{k}</b> dokumen kontrak dibuat dari realisasi{c + f + k === 0 ? ". Tidak ada paket yang perlu diselaraskan." : ". Lengkapi nomor/tanggal dokumen dan data lain di Ubah paket."}</p>; })()}
      {sp.error && <p role="alert" className="alert alert-error">Gagal membuat paket dari RUP. Anda mungkin tidak berwenang.</p>}
      <p className="text-sm text-slate-600">Setiap paket mewakili satu kode RUP (kode paket = kode RUP). Paket yang sudah berjalan pada tahapan sebelumnya dibawa dengan status, pejabat, dan kontraknya saat Anda menekan <b>Buat paket dari semua RUP</b>. Paket berulang (mis. konsumsi rapat, pemeliharaan kendaraan) ditandai <i>Berulang</i> dan dapat memiliki banyak pelaksanaan.</p>
      <form className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="Cari kode RUP atau nama paket" className="w-full max-w-xs" />
        <select name="status" defaultValue={status} aria-label="Filter status"><option value="">Semua status</option>{meta.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
        <button className="btn btn-dark">Terapkan</button>
        {(q || active) && <Link href="/paket" className="link text-sm">Reset</Link>}
      </form>
      {active && <p className="alert alert-info inline-block py-2 text-sm">Filter aktif: <b>{active}</b></p>}
      {error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat. Muat ulang halaman.</p>
        : !data?.length ? <p className="text-slate-600">{q || active ? "Tidak ada paket yang cocok." : "Belum ada paket pada tahun/tahapan ini."}</p> : (
        <div className="table-wrap"><table><thead><tr><th>Kode RUP</th><th>Nama paket</th><th>Jenis · metode</th><th className="text-right">Pagu</th><th>Status</th><th>Tenggat</th>{canWrite && <th>Aksi</th>}</tr></thead>
          <tbody>{data.map((p) => <tr key={p.id}><td><Link className="link" href={`/paket/${p.id}`}>{p.internal_code}</Link></td>
            <td>{p.name}{!p.rup_package_id && <span className="badge badge-warn ml-2">Belum ada kode RUP</span>}{p.is_recurring && <span className="badge badge-info ml-2">Berulang</span>}{sums.get(p.id) && <span className={`mt-0.5 block text-xs ${Number(sums.get(p.id)!.pct ?? 0) >= 100 ? "font-semibold text-red-700" : Number(sums.get(p.id)!.pct ?? 0) >= 80 ? "font-semibold text-amber-800" : "text-slate-600"}`}>{sums.get(p.id)!.count} pelaksanaan · terpakai {sums.get(p.id)!.pct?.replace(".", ",") ?? "0"}% · sisa {formatRupiah(sums.get(p.id)!.remaining)}</span>}{p.carried_from && <span className="badge badge-off ml-2" title="Status, pejabat, dan kontrak dibawa dari tahapan sebelumnya">Dibawa</span>}</td>
            <td className="text-sm">{p.procurement_type ? JENIS_LABEL[p.procurement_type] : <span className="text-amber-800">jenis belum diisi</span>}<span className="block text-xs text-slate-600">{(p as any).method?.name ?? "metode belum ditentukan"}</span></td>
            <td className="text-right tabular-nums">{formatRupiah(parseRupiah(p.pagu) ?? "0.00")}</td><td><span className="badge badge-info">{statusName.get(p.status) ?? p.status}</span></td>
            <td className={!p.is_recurring && p.due_date && p.due_date < todayIso() ? "font-semibold text-amber-800" : ""}>{p.is_recurring ? <span className="text-slate-500">berulang</span> : p.due_date ? p.due_date.split("-").reverse().join("/") : "-"}</td>
            {canWrite && <td className="min-w-40"><PackageRowActions statuses={statusOpts} methods={methodOpts} ppbj={off("ppbj")} ppk={off("ppk")} pptk={off("pptk")}
              row={{ id: p.id, code: p.internal_code, name: p.name, pagu: String(p.pagu), status: p.status, method_id: p.method_id, execution_mode: p.execution_mode, procurement_type: p.procurement_type, is_recurring: !!p.is_recurring, summary: sums.get(p.id) ?? null, due_date: p.due_date, process_start: p.process_start, process_end: p.process_end, handover_date: p.handover_date, obstacle_category: p.obstacle_category, notes: p.notes, ppbj_id: p.ppbj_id, ppk_id: p.ppk_id, pptk_id: p.pptk_id }} /></td>}</tr>)}</tbody></table></div>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">
        {page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages} ({count ?? 0} paket)</span>
        {page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
    </section>
  );
}
