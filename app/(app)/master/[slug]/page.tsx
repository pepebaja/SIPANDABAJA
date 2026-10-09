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
      <div className="space-y-3"><h1 className="text-2xl font-semibold text-navy-800">{def.title}</h1>
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Cari nama" className="w-64 rounded border px-3 py-2" /><button className="rounded bg-teal-600 px-4 py-2 text-white">Cari</button></form>
        {error ? <p role="alert" className="text-red-800">Data tidak dapat dimuat.</p> : !data?.length ? <p className="text-slate-600">{q ? "Tidak ada yang cocok." : "Belum ada data. Tambahkan lewat formulir."}</p> : (
          <table className="w-full text-left text-sm"><thead><tr className="border-b">{def.fields.map((f) => <th key={f.name} className="p-2">{f.label}</th>)}<th className="p-2">Status</th><th className="p-2">Aksi</th></tr></thead>
            <tbody>{(data as Record<string, unknown>[]).map((r) => <tr key={String(r.id)} className="border-b">{fields.map((f) => <td key={f.name} className="p-2">{show(f, r)}</td>)}
              <td className="p-2">{r.is_active ? "Aktif" : "Nonaktif"}</td>
              <td className="flex gap-3 p-2"><Link className="underline" href={`/master/${def.slug}?edit=${r.id}`}>Ubah</Link>
                <form action={toggleMaster}><input type="hidden" name="slug" value={def.slug} /><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="active" value={String(!r.is_active)} />
                  <button className="underline">{r.is_active ? "Nonaktifkan" : "Aktifkan"}</button></form></td></tr>)}</tbody></table>)}
        <nav className="flex items-center gap-3 text-sm" aria-label="Halaman">{page > 1 && <Link className="underline" href={href(page - 1)}>Sebelumnya</Link>}<span>Halaman {page} dari {pages}</span>{page < pages && <Link className="underline" href={href(page + 1)}>Berikutnya</Link>}</nav></div>
      <MasterForm slug={def.slug} fields={fields} values={(editing.data as Record<string, unknown> | null) ?? {}} id={editing.data ? String(sp.edit) : undefined} />
    </section>
  );
}
