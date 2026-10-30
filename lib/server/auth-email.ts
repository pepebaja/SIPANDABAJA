import "server-only";
import { usernameToEmail } from "@/lib/username";

// Antarmuka minimal agar mudah diuji tanpa Supabase sungguhan.
export type AuthLookupClient = {
  from(table: "profiles"): { select(cols: string): { eq(col: string, v: string): { maybeSingle(): PromiseLike<{ data: { id: string; is_active: boolean } | null }> } } };
  auth: { admin: { getUserById(id: string): PromiseLike<{ data: { user: { email?: string | null } | null } | null }> } };
};
export type ResolvedLogin = { email: string; userId: string | null; active: boolean };

/**
 * Mencari email Supabase Auth yang SEBENARNYA milik sebuah username.
 * Pengguna hanya mengenal username; email hanyalah detail internal. Dengan mencari lewat profil
 * (bukan menebak `username@domain`), akun tetap bisa masuk walau dibuat lewat dashboard Supabase,
 * dibuat oleh versi lama, atau AUTH_EMAIL_DOMAIN pernah berubah.
 * Bila profil tidak ada, dipakai email turunan sebagai cadangan (hasilnya tetap gagal masuk dengan pesan generik).
 */
export async function resolveLogin(admin: AuthLookupClient, username: string): Promise<ResolvedLogin> {
  const { data: p } = await admin.from("profiles").select("id, is_active").eq("username", username).maybeSingle();
  if (p) {
    const { data } = await admin.auth.admin.getUserById(p.id);
    const email = data?.user?.email;
    if (email) return { email, userId: p.id, active: p.is_active };
  }
  return { email: usernameToEmail(username), userId: p?.id ?? null, active: p?.is_active ?? false };
}

/** IP klien. Di Vercel, header x-vercel-forwarded-for diisi platform dan tidak dapat dipalsukan klien. */
export function clientIp(h: { get(name: string): string | null }): string {
  const v = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for");
  return (v?.split(",")[0]?.trim() || "unknown").slice(0, 64);
}
