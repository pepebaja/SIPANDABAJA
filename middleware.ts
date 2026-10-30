import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { UID_HEADER } from "@/lib/auth-header";
type C = { name: string; value: string; options: CookieOptions };
export async function middleware(req: NextRequest) {
  const pending: C[] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list: C[]) { list.forEach(({ name, value }) => req.cookies.set(name, value)); pending.push(...list); },
    },
  });
  // Satu-satunya pemeriksaan sesi ke Supabase Auth per permintaan; hasilnya diteruskan ke server lewat UID_HEADER.
  const { data: { user } } = await supabase.auth.getUser();
  const withCookies = (res: NextResponse) => { pending.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); return res; };
  const { pathname } = req.nextUrl;
  const open = pathname === "/login" || pathname === "/api/auth/login" || pathname === "/setup";
  if (!user && !open) return withCookies(NextResponse.redirect(new URL("/login", req.url)));
  if (user && (pathname === "/login" || pathname === "/setup")) return withCookies(NextResponse.redirect(new URL("/", req.url)));
  // Akun yang dibuat/di-reset admin wajib mengganti password sementara (app_metadata hanya bisa ditulis server).
  if (user?.app_metadata?.must_change_password === true && pathname !== "/akun" && pathname !== "/api/auth/logout")
    return withCookies(NextResponse.redirect(new URL("/akun?wajib=1", req.url)));
  const headers = new Headers(req.headers); // sudah memuat cookie sesi yang disegarkan
  headers.delete(UID_HEADER);                // buang kiriman klien; hanya nilai dari middleware yang dipercaya
  if (user) headers.set(UID_HEADER, user.id);
  return withCookies(NextResponse.next({ request: { headers } }));
}
export const config = { // Berkas gambar statis (logo, ikon) harus dapat dimuat sebelum login.
matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|gif)$).*)"] };
