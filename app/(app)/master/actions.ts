"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildSchema, findMaster } from "@/lib/masters";
export type FormState = { error?: string; ok?: boolean; warning?: string };
export async function saveMaster(_p: FormState, fd: FormData): Promise<FormState> {
  const def = findMaster(String(fd.get("slug")));
  if (!def) return { error: "Jenis data master tidak dikenal." };
  const raw = Object.fromEntries(def.fields.map((f) => [f.name, f.type === "bool" ? fd.get(f.name) : String(fd.get(f.name) ?? "")]));
  const parsed = buildSchema(def).safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${def.fields.find((f) => f.name === i.path[0])?.label ?? ""}: ${i.message}`).join("; ") };
  const sb = await createClient(), id = String(fd.get("id") ?? "");
  const res = id ? await sb.from(def.table).update(parsed.data).eq("id", id).select("id") : await sb.from(def.table).insert(parsed.data).select("id");
  if (res.error?.code === "23505") return { error: "Data dengan kode/nama/NIP yang sama sudah ada." };
  if (res.error || !res.data?.length) return { error: "Gagal menyimpan. Anda mungkin tidak berwenang mengelola master data." };
  revalidatePath(`/master/${def.slug}`);
  return { ok: true };
}
export async function toggleMaster(fd: FormData): Promise<void> {
  const def = findMaster(String(fd.get("slug"))); if (!def) return;
  await (await createClient()).from(def.table).update({ is_active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
  revalidatePath(`/master/${def.slug}`);
}
