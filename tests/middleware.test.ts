import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UID_HEADER } from "@/lib/auth-header";

let currentUser: { id: string; app_metadata?: Record<string, unknown> } | null = null;
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }) }));
import { middleware } from "../middleware";

const FORGED = "99999999-9999-9999-9999-999999999999", REAL = "11111111-1111-1111-1111-111111111111";
const call = (path: string) => middleware(new NextRequest(`https://x.test${path}`, { headers: { [UID_HEADER]: FORGED, cookie: "a=b" } }));
// Header permintaan yang diteruskan ke server ditandai Next dengan awalan x-middleware-request-.
const forwarded = (res: Response) => res.headers.get(`x-middleware-request-${UID_HEADER}`);

describe("middleware: header id pengguna tepercaya", () => {
  beforeEach(() => { currentUser = null; });
  it("pengguna masuk: header diisi id terverifikasi, kiriman klien dibuang", async () => {
    currentUser = { id: REAL };
    expect(forwarded(await call("/rup"))).toBe(REAL);
  });
  it("halaman terbuka tanpa sesi: header palsu dari klien tidak diteruskan", async () => {
    const res = await call("/login");
    expect(res.status).toBe(200); expect(forwarded(res)).toBeNull();
  });
  it("tanpa sesi ke halaman terlindungi: dialihkan ke /login", async () => {
    const res = await call("/realisasi");
    expect(res.status).toBe(307); expect(res.headers.get("location")).toContain("/login");
  });
  it("wajib ganti password tetap menahan ke /akun", async () => {
    currentUser = { id: REAL, app_metadata: { must_change_password: true } };
    const res = await call("/rup");
    expect(res.status).toBe(307); expect(res.headers.get("location")).toContain("/akun?wajib=1");
  });
});
