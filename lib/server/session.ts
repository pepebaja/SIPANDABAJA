import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/rbac";

export type Session = {
  userId: string;
  profile: { id: string; organization_id: string; username: string; full_name: string; nip: string | null; is_active: boolean };
  roles: Role[];
};
// Sesi dibaca lewat klien pengguna (tunduk RLS): profil & role sendiri selalu terbaca.
export async function getSession(): Promise<Session | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    sb.from("profiles").select("id, organization_id, username, full_name, nip, is_active").eq("id", user.id).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", user.id)]);
  if (!profile || !profile.is_active) return null;
  return { userId: user.id, profile, roles: (roles ?? []).map((r) => r.role as Role) };
}
