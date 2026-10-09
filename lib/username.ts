import { z } from "zod";
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "Username 3-32 karakter: huruf, angka, titik, garis bawah, atau strip.");
export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(200) });
export function usernameToEmail(username: string, domain = process.env.AUTH_EMAIL_DOMAIN ?? "sipanda.example.org"): string {
  return `${usernameSchema.parse(username)}@${domain}`;
}
