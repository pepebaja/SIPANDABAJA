"use server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/username";
import { createUserSchema, zodMessage } from "@/lib/users";

export type SetupState = { error?: string; ok?: boolean };
const digest = (v: string) => createHash("sha256").update(v).digest();

// Membuat Super Admin pertama. Hanya berfungsi selama belum ada satu pun profil.
export async function createFirstAdminAction(_p: SetupState, fd: FormData): Promise<SetupState> {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return { error: "SETUP_TOKEN belum diatur di environment server." };
  if (!timingSafeEqual(digest(String(fd.get("token") ?? "")), digest(expected))) return { error: "Kode setup salah." };
  const parsed = createUserSchema.safeParse({ username: String(fd.get("username") ?? ""), full_name: String(fd.get("full_name") ?? ""), nip: "", role: "super_admin", password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data, admin = createAdminClient();
  const existing = await admin.from("profiles").select("id", { head: true, count: "exact" });
  if ((existing.count ?? 0) > 0) return { error: "Setup sudah dilakukan. Silakan masuk." };
  const { data: org } = await admin.from("organizations").select("id").limit(1).maybeSingle();
  if (!org) return { error: "Data organisasi belum ada. Jalankan supabase/seed.sql terlebih dahulu." };
  const { data, error } = await admin.auth.admin.createUser({ email: usernameToEmail(v.username), password: v.password, email_confirm: true, user_metadata: { username: v.username } });
  if (error || !data.user) return { error: "Akun gagal dibuat. Periksa SUPABASE_SERVICE_ROLE_KEY dan URL Supabase." };
  const id = data.user.id;
  const p = await admin.from("profiles").insert({ id, organization_id: org.id, username: v.username, full_name: v.full_name });
  if (p.error) { await admin.auth.admin.deleteUser(id); return { error: "Profil gagal disimpan. Pastikan migrasi database sudah dijalankan." }; }
  const r = await admin.from("user_roles").insert({ user_id: id, organization_id: org.id, role: "super_admin" });
  if (r.error) { await admin.auth.admin.deleteUser(id); return { error: "Peran gagal disimpan. Akun dibatalkan." }; }
  await admin.from("audit_logs").insert({ organization_id: org.id, actor_id: id, action: "SETUP_FIRST_ADMIN", table_name: "profiles", record_id: id, new_data: { username: v.username } });
  return { ok: true };
}
