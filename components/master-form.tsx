"use client";
import { useActionState } from "react";
import { saveMaster, type FormState } from "@/app/(app)/master/actions";
import type { Field } from "@/lib/masters";
export function MasterForm({ slug, fields, values, id }: { slug: string; fields: Field[]; values: Record<string, unknown>; id?: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(saveMaster, {});
  const cls = "mt-1 w-full";
  return (
    <form action={action} key={id ?? "new"} className="space-y-3 card p-4">
      <input type="hidden" name="slug" value={slug} />{id && <input type="hidden" name="id" value={id} />}
      <h2 className="font-semibold">{id ? "Ubah data" : "Tambah data"}</h2>
      {fields.map((f) => (
        <label key={f.name} className="block text-sm font-medium">{f.label}{f.required && " *"}
          {f.type === "bool" ? <input type="checkbox" name={f.name} defaultChecked={!!values[f.name]} className="ml-2" />
            : f.type === "text" ? <input name={f.name} defaultValue={String(values[f.name] ?? "")} className={cls} />
            : <select name={f.name} defaultValue={String(values[f.name] ?? "")} className={cls}><option value="">{f.required ? "Pilih..." : "(kosong)"}</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
        </label>))}
      {s.error && <p role="alert" className="alert alert-error">{s.error}</p>}{s.ok && <p role="status" className="alert alert-ok">Tersimpan.</p>}
      <button disabled={pending} className="btn btn-primary">{pending ? "Menyimpan..." : "Simpan"}</button>
      {id && <a href={`/master/${slug}`} className="link ml-3 text-sm">Batal</a>}
    </form>
  );
}
