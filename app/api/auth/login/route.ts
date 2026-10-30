import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { CONTEXT_COOKIE, contextCookieOptions, encodeContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema } from "@/lib/username";
import { clientIp, resolveLogin, type AuthLookupClient } from "@/lib/server/auth-email";

const WINDOW_MS = 15 * 60 * 1000, MAX_PER_USER = 5, MAX_PER_IP = 20;
const GENERIC = { error: "Username atau password salah." };
const json = (body: object, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rawUser = typeof body?.username === "string" ? body.username.trim() : "";
  // Pesan khusus (tidak membocorkan data akun) agar pengguna yang mengetik email tahu cara masuk yang benar.
  if (rawUser.includes("@")) return json({ error: "Masuk memakai username, bukan email. Contoh: admin" }, 400);
  const parsed = loginSchema.safeParse(body);
  const chosen = z.object({ yearId: z.string().uuid(), stageId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return json(GENERIC, 400);
  const { username, password } = parsed.data;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[login] Environment Supabase belum lengkap (URL / ANON_KEY / SERVICE_ROLE_KEY).");
    return json({ error: "Konfigurasi server belum lengkap. Hubungi administrator." }, 503);
  }
  try {
    const ip = clientIp(req.headers);
    const admin = createAdminClient();
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const failed = (col: "username" | "ip", val: string) =>
      admin.from("login_attempts").select("id", { count: "exact", head: true }).eq(col, val).eq("success", false).gte("created_at", since);
    const [u, i] = await Promise.all([failed("username", username), failed("ip", ip)]);
    if (u.error || i.error) console.error("[login] Tabel login_attempts tidak terbaca (migrasi belum dijalankan?):", u.error?.message ?? i.error?.message);
    if ((u.count ?? 0) >= MAX_PER_USER || (i.count ?? 0) >= MAX_PER_IP)
      return json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, 429);

    // Email Auth dicari dari profil (bukan ditebak), lalu kata sandi diperiksa oleh Supabase Auth.
    const target = await resolveLogin(admin as unknown as AuthLookupClient, username);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: target.email, password });
    let ok = !error && !!data.user, reason = error?.code ?? error?.message ?? "";
    if (ok) {
      const { data: p } = await supabase.from("profiles").select("is_active").eq("id", data.user!.id).maybeSingle();
      if (!p) { ok = false; reason = "profil_tidak_ada"; } else if (!p.is_active) { ok = false; reason = "akun_nonaktif"; }
      if (!ok) await supabase.auth.signOut();
    }
    await admin.from("login_attempts").insert({ username, ip, success: ok }); // password tidak pernah dicatat
    if (!ok) console.warn(`[login] gagal username=${username} sebab=${reason || "kredensial"}`); // sebab hanya di log server, bukan ke pengguna
    // Jejak akuntabilitas di log audit: login berhasil, dan kegagalan pada akun yang memang ada. Tanpa password.
    if (ok || target.userId)
      await admin.from("audit_logs").insert({ actor_id: ok ? data.user!.id : null, action: ok ? "LOGIN" : "LOGIN_FAILED", table_name: "profiles", record_id: target.userId, new_data: { username, ip } });
    // Bersihkan catatan percobaan >30 hari secara berkala agar tabel tidak membengkak.
    if (Math.random() < 0.02) await admin.from("login_attempts").delete().lt("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
    if (ok && chosen.success) {
      // Tahun & tahapan yang dipilih di halaman login menjadi konteks seluruh aplikasi. Divalidasi lewat RLS; id tidak valid diabaikan.
      const [y, st] = await Promise.all([
        supabase.from("budget_years").select("id").eq("id", chosen.data.yearId).eq("is_active", true).maybeSingle(),
        supabase.from("budget_stages").select("id").eq("id", chosen.data.stageId).eq("is_active", true).maybeSingle()]);
      if (y.data && st.data) (await cookies()).set(CONTEXT_COOKIE, encodeContext(chosen.data.yearId, chosen.data.stageId), contextCookieOptions());
    }
    return ok ? json({ ok: true }, 200) : json(GENERIC, 401);
  } catch (e) {
    console.error("[login] kesalahan tak terduga:", e);
    return json({ error: "Terjadi kesalahan di server. Coba lagi beberapa saat." }, 500);
  }
}
