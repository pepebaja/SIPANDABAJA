import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { CONTEXT_COOKIE, contextCookieOptions, encodeContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema, usernameToEmail } from "@/lib/username";

const WINDOW_MS = 15 * 60 * 1000, MAX_PER_USER = 5, MAX_PER_IP = 20;
const GENERIC = { error: "Username atau password salah." };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  const chosen = z.object({ yearId: z.string().uuid(), stageId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json(GENERIC, { status: 400 });
  const { username, password } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const failed = (col: "username" | "ip", val: string) =>
    admin.from("login_attempts").select("id", { count: "exact", head: true }).eq(col, val).eq("success", false).gte("created_at", since);
  const [u, i] = await Promise.all([failed("username", username), failed("ip", ip)]);
  if ((u.count ?? 0) >= MAX_PER_USER || (i.count ?? 0) >= MAX_PER_IP)
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, { status: 429 });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  let ok = !error && !!data.user;
  if (ok) {
    const { data: p } = await supabase.from("profiles").select("is_active").eq("id", data.user!.id).maybeSingle();
    if (!p?.is_active) { await supabase.auth.signOut(); ok = false; }
  }
  await admin.from("login_attempts").insert({ username, ip, success: ok }); // password tidak pernah dicatat
  // Bersihkan catatan percobaan >30 hari secara berkala agar tabel tidak membengkak.
  if (Math.random() < 0.02) await admin.from("login_attempts").delete().lt("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
  if (ok && chosen.success) {
    // Tahun & tahapan yang dipilih di halaman login menjadi konteks seluruh aplikasi. Divalidasi lewat RLS; id tidak valid diabaikan.
    const [y, st] = await Promise.all([
      supabase.from("budget_years").select("id").eq("id", chosen.data.yearId).eq("is_active", true).maybeSingle(),
      supabase.from("budget_stages").select("id").eq("id", chosen.data.stageId).eq("is_active", true).maybeSingle()]);
    if (y.data && st.data) (await cookies()).set(CONTEXT_COOKIE, encodeContext(chosen.data.yearId, chosen.data.stageId), contextCookieOptions());
  }
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json(GENERIC, { status: 401 });
}
