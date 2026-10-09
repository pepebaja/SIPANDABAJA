import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { findMaster, type Field } from "@/lib/masters";
import { MasterForm } from "@/components/master-form";
import { toggleMaster } from "../actions";
const PAGE = 25;
export default async function MasterPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; page?: string; edit?: string }> }) {
  const def = findMaster((await params).slug); if (!def) notFound();
  const sp = await searchParams, sb = await createClient();
  const q = (sp.q ?? "").replace(/[%,()*]/g, " ").trim().slice(0, 80), page = Math.max(1, Number(sp.page) || 1);
  const fields: Field[] = await Promise.all(def.fields.map(async (f) => {
    if (f.type !== "ref" || !f.ref) return f;
    const { data } = await sb.from(f.ref.table).select(["id", ...f.ref.labelCols].join(",")).eq("is_active", true).order(f.ref.labelCols[0]!).limit(1000);
    return { ...f, options: (data ?? []).map((r) => { const row = r as unknown as Record<string, string>; return { value: row.id!, label: f.ref!.labelCols.map((c) => row[c]).join(" ") }; }) };
  }));
  const orderCol = def.fields.some((f) => f.name === "code") ? "code" : "name";
  let query = sb.from(def.table).select("*", { count: "exact" }).order(orderCol).range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.ilike("name", `%${q}%`);
  const [{ data, count, error }, editing] = await Promise.all([query, sp.edit ? sb.from(def.table).select("*").eq("id", sp.edit).maybeSingle() : Promise.resolve({ data: null })]);
  const show = (f: Field, row: Record<string, unknown>) => f.type === "bool" ? (row[f.name] ? "Ya" : "Tidak") : f.type === "ref" ? (f.options?.find((o) => o.value === row[f.name])?.label ?? "-") : f.type === "enum" ? (f.options?.find((o) => o.value === row[f.name])?.label ?? "-") : String(row[f.name] ?? "");
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE)), href = (p: number) => `/master/${def.slug}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3"><div><Link href="/master" className="link text-sm">← Master data</Link><h1 className="page-title mt-1">{def.title}</h1></div>
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Cari nama" className="w-64" /><button className="btn btn-primary">Cari</button></form>
        {error ? <p role="alert" className="alert alert-error">Data tidak dapat dimuat.</p> : !data?.length ? <p className="text-slate-600">{q ? "Tidak ada yang cocok." : "Belum ada data. Tambahkan lewat formulir."}</p> : (
          <div className="table-wrap"><table><thead><tr>{def.fields.map((f) => <th key={f.name}>{f.label}</th>)}<th>Status</th><th>Aksi</th></tr></thead>
            <tbody>{(data as Record<string, unknown>[]).map((r) => <tr key={String(r.id)}>{fields.map((f) => <td key={f.name}>{show(f, r)}</td>)}
              <td><span className={`badge ${r.is_active ? "badge-ok" : "badge-off"}`}>{r.is_active ? "Aktif" : "Nonaktif"}</span></td>
              <td><div className="flex items-center gap-4"><Link className="link" href={`/master/${def.slug}?edit=${r.id}`}>Ubah</Link>
                <form action={toggleMaster}><input type="hidden" name="slug" value={def.slug} /><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="active" value={String(!r.is_active)} />
                  <button className="link">{r.is_active ? "Nonaktifkan" : "Aktifkan"}</button></form></div></td></tr>)}</tbody></table></div>)}
        <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="link" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="link" href={href(page + 1)}>Berikutnya</Link>}</nav></div>
      <MasterForm slug={def.slug} fields={fields} values={(editing.data as Record<string, unknown> | null) ?? {}} id={editing.data ? String(sp.edit) : undefined} />
    </section>
  );
}
