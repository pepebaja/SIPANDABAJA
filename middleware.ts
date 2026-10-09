import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
type C = { name: string; value: string; options: CookieOptions };
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list: C[]) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;
  const open = pathname === "/login" || pathname === "/api/auth/login" || pathname === "/setup";
  if (!user && !open) return NextResponse.redirect(new URL("/login", req.url));
  if (user && (pathname === "/login" || pathname === "/setup")) return NextResponse.redirect(new URL("/", req.url));
  // Akun yang dibuat/di-reset admin wajib mengganti password sementara (app_metadata hanya bisa ditulis server).
  if (user?.app_metadata?.must_change_password === true && pathname !== "/akun" && pathname !== "/api/auth/logout")
    return NextResponse.redirect(new URL("/akun?wajib=1", req.url));
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
