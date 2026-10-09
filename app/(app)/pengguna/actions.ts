"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, type Session } from "@/lib/server/session";
import { can, canAssignRole, canManageTarget, type Role } from "@/lib/rbac";
import { usernameToEmail } from "@/lib/username";
import { createUserSchema, resetPasswordSchema, updateUserSchema, zodMessage } from "@/lib/users";

export type UserFormState = { error?: string; ok?: boolean; message?: string; credentials?: { username: string; password: string } };
type Admin = ReturnType<typeof createAdminClient>;
const DENIED = "Anda tidak berwenang mengelola pengguna.";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function requireManager(): Promise<Session | null> {
  const s = await getSession();
  return s && can(s.roles, "users:manage") ? s : null;
}
async function audit(admin: Admin, s: Session, action: string, recordId: string, data: Record<string, unknown>) {
  // Tidak pernah memuat password.
  await admin.from("audit_logs").insert({ organization_id: s.profile.organization_id, actor_id: s.userId, action, table_name: "profiles", record_id: recordId, new_data: data });
}
async function loadTarget(admin: Admin, s: Session, id: string) {
  const [{ data: p }, { data: r }] = await Promise.all([
    admin.from("profiles").select("id, organization_id, username, full_name, is_active").eq("id", id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", id)]);
  if (!p || p.organization_id !== s.profile.organization_id) return { error: "Pengguna tidak ditemukan." } as const;
  const roles = (r ?? []).map((x) => x.role as Role);
  if (!canManageTarget(s.roles, roles)) return { error: "Anda tidak berwenang mengelola akun ini." } as const;
  return { profile: p as { id: string; username: string; full_name: string; is_active: boolean }, roles } as const;
}
async function otherActiveSuperAdmins(admin: Admin, orgId: string, excludeId: string): Promise<number> {
  const { data } = await admin.from("user_roles").select("user_id, profiles!inner(is_active)")
    .eq("organization_id", orgId).eq("role", "super_admin").neq("user_id", excludeId).eq("profiles.is_active", true);
  return data?.length ?? 0;
}

export async function createUserAction(_p: UserFormState, fd: FormData): Promise<UserFormState> {
  const s = await requireManager(); if (!s) return { error: DENIED };
  const parsed = createUserSchema.safeParse({ username: str(fd, "username"), full_name: str(fd, "full_name"), nip: str(fd, "nip"), role: str(fd, "role"), password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data;
  if (!canAssignRole(s.roles, v.role)) return { error: "Anda tidak berwenang memberikan peran tersebut." };
  const admin = createAdminClient();
  const taken = await admin.from("profiles").select("id", { head: true, count: "exact" }).eq("username", v.username);
  if ((taken.count ?? 0) > 0) return { error: "Username sudah dipakai. Pilih username lain." };
  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(v.username), password: v.password, email_confirm: true,
    app_metadata: { must_change_password: true }, user_metadata: { username: v.username } });
  if (error || !data.user) return { error: error?.code === "email_exists" ? "Username sudah dipakai. Pilih username lain." : "Akun gagal dibuat. Periksa konfigurasi Supabase lalu coba lagi." };
  const id = data.user.id;
  const p = await admin.from("profiles").insert({ id, organization_id: s.profile.organization_id, username: v.username, full_name: v.full_name, nip: v.nip });
  if (p.error) { await admin.auth.admin.deleteUser(id); return { error: p.error.code === "23505" ? "Username sudah dipakai. Pilih username lain." : "Profil pengguna gagal disimpan." }; }
  const r = await admin.from("user_roles").insert({ user_id: id, organization_id: s.profile.organization_id, role: v.role, created_by: s.userId });
  if (r.error) { await admin.auth.admin.deleteUser(id); return { error: "Peran pengguna gagal disimpan. Akun dibatalkan." }; }
  await audit(admin, s, "USER_CREATE", id, { username: v.username, role: v.role });
  revalidatePath("/pengguna");
  return { ok: true, message: "Akun berhasil dibuat.", credentials: { username: v.username, password: v.password } };
}

export async function updateUserAction(_p: UserFormState, fd: FormData): Promise<UserFormState> {
  const s = await requireManager(); if (!s) return { error: DENIED };
  const parsed = updateUserSchema.safeParse({ id: str(fd, "id"), full_name: str(fd, "full_name"), nip: str(fd, "nip"), role: str(fd, "role") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data, admin = createAdminClient(), t = await loadTarget(admin, s, v.id);
  if ("error" in t) return { error: t.error };
  const roleChanged = !(t.roles.length === 1 && t.roles[0] === v.role);
  if (roleChanged) {
    if (v.id === s.userId) return { error: "Anda tidak dapat mengubah peran akun Anda sendiri." };
    if (!canAssignRole(s.roles, v.role)) return { error: "Anda tidak berwenang memberikan peran tersebut." };
    if (t.roles.includes("super_admin") && v.role !== "super_admin" && (await otherActiveSuperAdmins(admin, s.profile.organization_id, v.id)) === 0)
      return { error: "Tidak dapat mengubah peran Super Admin terakhir yang aktif." };
  }
  const up = await admin.from("profiles").update({ full_name: v.full_name, nip: v.nip }).eq("id", v.id);
  if (up.error) return { error: "Perubahan gagal disimpan." };
  if (roleChanged) {
    const del = await admin.from("user_roles").delete().eq("user_id", v.id).neq("role", v.role);
    if (del.error) return { error: "Peran gagal diperbarui." };
    if (!t.roles.includes(v.role)) {
      const ins = await admin.from("user_roles").insert({ user_id: v.id, organization_id: s.profile.organization_id, role: v.role, created_by: s.userId });
      if (ins.error) return { error: "Peran gagal diperbarui." };
    }
  }
  await audit(admin, s, "USER_UPDATE", v.id, { username: t.profile.username, role: v.role });
  revalidatePath("/pengguna");
  return { ok: true, message: "Perubahan tersimpan." };
}

export async function resetPasswordAction(_p: UserFormState, fd: FormData): Promise<UserFormState> {
  const s = await requireManager(); if (!s) return { error: DENIED };
  const parsed = resetPasswordSchema.safeParse({ id: str(fd, "id"), password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data;
  if (v.id === s.userId) return { error: "Ubah password Anda sendiri lewat menu Akun saya." };
  const admin = createAdminClient(), t = await loadTarget(admin, s, v.id);
  if ("error" in t) return { error: t.error };
  const { error } = await admin.auth.admin.updateUserById(v.id, { password: v.password, app_metadata: { must_change_password: true } });
  if (error) return { error: "Password gagal diatur ulang." };
  await audit(admin, s, "USER_PASSWORD_RESET", v.id, { username: t.profile.username });
  return { ok: true, message: "Password diatur ulang. Pengguna wajib menggantinya saat masuk.", credentials: { username: t.profile.username, password: v.password } };
}

export async function setActiveAction(_p: UserFormState, fd: FormData): Promise<UserFormState> {
  const s = await requireManager(); if (!s) return { error: DENIED };
  const id = str(fd, "id"), active = str(fd, "active") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Pengguna tidak valid." };
  if (id === s.userId) return { error: "Anda tidak dapat menonaktifkan akun Anda sendiri." };
  const admin = createAdminClient(), t = await loadTarget(admin, s, id);
  if ("error" in t) return { error: t.error };
  if (!active && t.roles.includes("super_admin") && (await otherActiveSuperAdmins(admin, s.profile.organization_id, id)) === 0)
    return { error: "Tidak dapat menonaktifkan Super Admin terakhir yang aktif." };
  const up = await admin.from("profiles").update({ is_active: active }).eq("id", id);
  if (up.error) return { error: "Status gagal diubah." };
  // Blokir juga di Supabase Auth agar sesi/refresh token yang sudah ada tidak bisa dipakai lagi.
  await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  await audit(admin, s, active ? "USER_ACTIVATE" : "USER_DEACTIVATE", id, { username: t.profile.username });
  revalidatePath("/pengguna");
  return { ok: true, message: active ? "Akun diaktifkan." : "Akun dinonaktifkan." };
}
