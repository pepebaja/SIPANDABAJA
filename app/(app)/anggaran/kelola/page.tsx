import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getSession } from "@/lib/server/session";
import { fetchAll } from "@/lib/server/fetch-all";
import { can } from "@/lib/rbac";
import { rp } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import { addBudgetEntry, deleteBudgetEntry, updateBudgetEntry } from "./actions";
export const metadata = { title: "Kelola anggaran" };
const PAGE = 30;
const MSG: Record<string, string> = { denied: "Anda tidak berwenang mengubah anggaran.", version: "Versi anggaran belum disiapkan.", input: "Isian tidak lengkap/tidak valid (pilih subkegiatan, rekening, sumber dana; isi uraian dan pagu).", dup: "Rekening dengan subkegiatan, rekening, sumber dana, dan uraian yang sama sudah ada.",
  save: "Gagal menyimpan.", below: "Pagu tidak boleh lebih kecil daripada realisasi kumulatif rekening ini.", "used-tx": "Rekening tidak dapat dihapus karena sudah memiliki transaksi realisasi. Hapus/pindahkan transaksinya dulu, atau ubah pagunya.", "used-cash": "Rekening tidak dapat dihapus karena sudah memiliki anggaran kas. Kosongkan kas rekening ini dulu di menu Anggaran kas.", "used-alloc": "Rekening tidak dapat dihapus karena dipakai alokasi paket RUP. Hapus alokasinya dulu." };
const OK: Record<string, string> = { add: "Rekening anggaran ditambahkan.", edit: "Rekening anggaran diperbarui.", del: "Rekening anggaran dihapus." };

export default async function KelolaAnggaranPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string; ok?: string }> }) {
  const [ctx, s, sp] = await Promise.all([getBudgetContext(), getSession(), searchParams]); if (!s) return null;
  if (!ctx?.versionId) return <p className="alert alert-info max-w-xl">Belum ada versi anggaran untuk konteks ini. Siapkan di menu Impor anggaran.</p>;
  const sb = await createClient(), canEdit = can(s.roles, "budget:import"), q = (sp.q ?? "").replace(/[%,()*]/g, " ").trim().slice(0, 80), page = Math.max(1, Number(sp.page) || 1);
  let query = sb.from("budget_entries").select("id, description, amount, subactivities(code, name), expenditure_accounts(code, name), funding_sources(code)", { count: "exact" }).eq("budget_version_id", ctx.versionId).order("entry_key").range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.ilike("description", `%${q}%`);
  const [{ data, count }, subs, accs, funds] = await Promise.all([query,
    canEdit ? fetchAll<any>((f, t) => sb.from("subactivities").select("id, code, name").eq("is_active", true).order("code").range(f, t)) : Promise.resolve([] as any[]),
    canEdit ? fetchAll<any>((f, t) => sb.from("expenditure_accounts").select("id, code, name").eq("is_active", true).order("code").range(f, t)) : Promise.resolve([] as any[]),
    canEdit ? sb.from("funding_sources").select("id, code, name").eq("is_active", true).order("code").then((r) => r.data ?? []) : Promise.resolve([] as any[])]);
  const rows = (data ?? []) as any[], pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `/anggaran/kelola?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <section className="max-w-6xl space-y-5">
      <div><p className="eyebrow">Penganggaran</p><h1 className="page-title">Kelola anggaran <span className="page-sub">Tahun {ctx.year} · {ctx.stageName}</span></h1>
        <p className="page-desc">Tambah, ubah, atau hapus rekening anggaran (subkegiatan + belanja + pagu) langsung di aplikasi, tanpa impor ulang. Subkegiatan, kegiatan, program, rekening, dan sumber dana baru ditambahkan di <Link className="link" href="/master">Master data</Link>, lalu dipasangkan di sini pada tahapan yang dipilih. Realisasi tahapan sebelumnya otomatis terbawa ke rekening yang sepadan (subkegiatan + rekening + sumber dana).</p></div>
      {sp.error && <p role="alert" className="alert alert-error">{MSG[sp.error] ?? MSG.save}</p>}{sp.ok && <p role="status" className="alert alert-info">{OK[sp.ok]}</p>}
      {canEdit && <form action={addBudgetEntry} className="card grid gap-3 p-4 md:grid-cols-6">
        <h2 className="text-base md:col-span-6">Tambah rekening anggaran</h2>
        <label className="text-xs md:col-span-2">Subkegiatan<select name="subactivity_id" required className="mt-0.5 w-full"><option value="">Pilih...</option>{subs.map((x: any) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}</select></label>
        <label className="text-xs md:col-span-2">Rekening belanja<select name="account_id" required className="mt-0.5 w-full"><option value="">Pilih...</option>{accs.map((x: any) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}</select></label>
        <label className="text-xs">Sumber dana<select name="funding_source_id" required className="mt-0.5 w-full"><option value="">Pilih...</option>{funds.map((x: any) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></label>
        <label className="text-xs">Pagu (Rp)<input name="amount" required inputMode="decimal" className="mt-0.5 w-full" /></label>
        <label className="text-xs md:col-span-5">Uraian<input name="description" required maxLength={500} className="mt-0.5 w-full" /></label>
        <div className="flex items-end"><button className="btn btn-primary w-full">Tambah</button></div></form>}
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Cari uraian" className="w-64" /><button className="btn btn-primary">Cari</button></form>
      {!rows.length ? <p className="text-slate-600">Belum ada rekening anggaran{q ? " yang cocok" : ""}.</p> : <div className="table-wrap"><table><thead><tr><th>Subkegiatan</th><th>Rekening</th><th>Dana</th><th>Uraian</th><th className="text-right">Pagu</th>{canEdit && <th>Aksi</th>}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="text-sm"><b>{r.subactivities?.code}</b><span className="block text-xs text-slate-600">{r.subactivities?.name}</span></td><td className="text-sm"><b>{r.expenditure_accounts?.code}</b><span className="block text-xs text-slate-600">{r.expenditure_accounts?.name}</span></td><td className="text-sm">{r.funding_sources?.code}</td><td className="min-w-56 text-sm">{r.description}</td><td className="text-right tabular-nums">{rp(r.amount)}</td>
          {canEdit && <td className="min-w-44"><details><summary className="link cursor-pointer text-xs">Ubah</summary><form action={updateBudgetEntry} className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2"><input type="hidden" name="id" value={r.id} />
            <label className="block text-xs">Uraian<input name="description" defaultValue={r.description} required maxLength={500} className="mt-0.5 w-full py-1" /></label>
            <label className="block text-xs">Pagu (Rp)<input name="amount" defaultValue={r.amount} required inputMode="decimal" className="mt-0.5 w-full py-1" /></label><button className="btn btn-ghost btn-sm">Simpan</button></form></details>
            <form action={deleteBudgetEntry} className="mt-1"><input type="hidden" name="id" value={r.id} /><ConfirmButton message="Hapus rekening anggaran ini?" className="link text-xs text-red-700">Hapus</ConfirmButton></form></td>}</tr>)}</tbody></table></div>}
      <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav>
    </section>);
}
