import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { UID_HEADER, UUID_RE } from "@/lib/auth-header";
import type { Role } from "@/lib/rbac";

export type Session = {
  userId: string;
  profile: { id: string; organization_id: string; username: string; full_name: string; nip: string | null; is_active: boolean };
  roles: Role[];
};
/** Id pengguna terverifikasi. Dibaca dari header middleware (tanpa panggilan jaringan); cadangan: tanya Supabase Auth. */
export const getAuthUserId = cache(async (): Promise<string | null> => {
  const id = (await headers()).get(UID_HEADER);
  if (id && UUID_RE.test(id)) return id;
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user?.id ?? null;
});
// Sesi dibaca lewat klien pengguna (tunduk RLS): profil & role sendiri selalu terbaca.
// cache(): dipakai bersama oleh layout, halaman, dan komponen dalam satu permintaan (2 kueri paralel satu kali, bukan berulang di tiap komponen).
export const getSession = cache(async (): Promise<Session | null> => {
  const uid = await getAuthUserId();
  if (!uid) return null;
  const sb = await createClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([ // paralel: satu putaran jaringan
    sb.from("profiles").select("id, organization_id, username, full_name, nip, is_active").eq("id", uid).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", uid)]);
  if (!profile || !profile.is_active) return null;
  return { userId: uid, profile, roles: (roles ?? []).map((r) => r.role as Role) };
});
