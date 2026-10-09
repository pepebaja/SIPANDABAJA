import { z } from "zod";
// Skema LOGIN: longgar agar akun lama tetap bisa masuk.
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "Username 3-32 karakter: huruf, angka, titik, garis bawah, atau strip.");
// Skema PEMBUATAN akun baru: lebih ketat agar username rapi dan mudah diingat.
export const newUsernameSchema = usernameSchema
  .regex(/^[a-z0-9]/, "Username harus diawali huruf atau angka.")
  .regex(/[a-z0-9]$/, "Username harus diakhiri huruf atau angka.")
  .refine((v) => !/[._-]{2,}/.test(v), "Username tidak boleh memuat dua tanda baca berurutan.");
export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(200) });
// Supabase Auth mensyaratkan email; pengguna tidak pernah melihat atau memakainya.
// PENTING: jangan ubah domain ini setelah ada akun, atau akun lama tidak bisa masuk.
export const DEFAULT_AUTH_DOMAIN = "sipanda.example.org";
export function usernameToEmail(username: string, domain = process.env.AUTH_EMAIL_DOMAIN ?? DEFAULT_AUTH_DOMAIN): string {
  return `${usernameSchema.parse(username)}@${domain}`;
}
