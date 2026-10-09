import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { formatRupiah } from "@/lib/format";
import { parseRupiah } from "@/lib/import/parse";
const PAGE = 25;
export default async function PaketPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams; const ctx = await getBudgetContext();
  if (!ctx?.versionId) return <p>Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const q = (sp.q ?? "").replace(/[%,()*]/g, " ").trim().slice(0, 80), page = Math.max(1, Number(sp.page) || 1);
  const sb = await createClient();
  let query = sb.from("procurement_packages").select("id, internal_code, name, pagu, status, rup_package_id", { count: "exact" })
    .eq("budget_version_id", ctx.versionId).order("internal_code").range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,internal_code.ilike.%${q}%`);
  const [{ data, count, error }, { data: sts }] = await Promise.all([query, sb.from("package_statuses").select("code, name")]);
  const statusName = new Map((sts ?? []).map((s) => [s.code, s.name])); const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/paket?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-800">Paket pengadaan <span className="text-base font-normal text-slate-600">Tahun {ctx.year}, {ctx.stageName}</span></h1>
      <Link href="/paket/baru" className="inline-block rounded bg-navy-800 px-4 py-2 text-white">Tambah paket</Link>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Cari kode atau nama paket" className="w-72 rounded border px-3 py-2" />
        <button className="rounded bg-teal-600 px-4 py-2 text-white">Cari</button></form>
      {error ? <p role="alert" className="text-red-800">Data tidak dapat dimuat. Muat ulang halaman.</p>
        : !data?.length ? <p className="text-slate-600">{q ? "Tidak ada paket yang cocok." : "Belum ada paket pada tahun/tahapan ini."}</p> : (
        <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Kode</th><th className="p-2">Nama paket</th><th className="p-2 text-right">Pagu</th><th className="p-2">Status</th></tr></thead>
          <tbody>{data.map((p) => <tr key={p.id} className="border-b"><td className="p-2"><Link className="underline" href={`/paket/${p.id}`}>{p.internal_code}</Link></td>
            <td className="p-2">{p.name}{!p.rup_package_id && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Belum ada kode RUP</span>}</td>
            <td className="p-2 text-right tabular-nums">{formatRupiah(parseRupiah(p.pagu) ?? "0.00")}</td><td className="p-2">{statusName.get(p.status) ?? p.status}</td></tr>)}</tbody></table>)}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">
        {page > 1 && <Link className="underline" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages} ({count ?? 0} paket)</span>
        {page < pages && <Link className="underline" href={href(page + 1)}>Berikutnya</Link>}</nav>
    </section>
  );
}
