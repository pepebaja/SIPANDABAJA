import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema, usernameToEmail } from "@/lib/username";

const WINDOW_MS = 15 * 60 * 1000, MAX_PER_USER = 5, MAX_PER_IP = 20;
const GENERIC = { error: "Username atau password salah." };

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
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
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json(GENERIC, { status: 401 });
}
