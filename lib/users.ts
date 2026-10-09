import { z } from "zod";
import { ROLES } from "./rbac";
import { newUsernameSchema } from "./username";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72; // batas bcrypt di Supabase Auth
const COMMON = ["password", "passw0rd", "12345678", "123456789", "1234567890", "qwerty123", "admin123", "sipandabaja"];

export function passwordIssues(pw: string, username?: string): string[] {
  const out: string[] = [];
  if (pw.length < PASSWORD_MIN) out.push(`minimal ${PASSWORD_MIN} karakter`);
  if (pw.length > PASSWORD_MAX) out.push(`maksimal ${PASSWORD_MAX} karakter`);
  if (!/[a-z]/.test(pw)) out.push("memuat huruf kecil");
  if (!/[A-Z]/.test(pw)) out.push("memuat huruf besar");
  if (!/\d/.test(pw)) out.push("memuat angka");
  const low = pw.toLowerCase();
  if (COMMON.some((c) => low.includes(c))) out.push("tidak memakai kata umum yang mudah ditebak");
  if (username && username.length >= 3 && low.includes(username.toLowerCase())) out.push("tidak memuat username");
  return out;
}
export const passwordSchema = z.string().superRefine((v, ctx) => {
  const issues = passwordIssues(v);
  if (issues.length) ctx.addIssue({ code: "custom", message: `Password harus ${issues.join(", ")}.` });
});

const nip = z.string().transform((v) => v.replace(/\s/g, "")).pipe(z.union([z.literal(""), z.string().regex(/^\d{18}$/, "NIP harus 18 digit angka")])).transform((v) => (v === "" ? null : v));
export const fullName = z.string().trim().min(3, "Nama lengkap minimal 3 karakter").max(120, "Nama lengkap maksimal 120 karakter");

export const createUserSchema = z.object({
  username: newUsernameSchema, full_name: fullName, nip, role: z.enum(ROLES, { message: "Peran tidak valid" }),
  password: passwordSchema, confirm: z.string(),
}).superRefine((v, ctx) => {
  if (v.password !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "Konfirmasi password tidak sama." });
  if (passwordIssues(v.password, v.username).includes("tidak memuat username")) ctx.addIssue({ code: "custom", path: ["password"], message: "Password tidak boleh memuat username." });
});
export const resetPasswordSchema = z.object({ id: z.string().uuid(), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Konfirmasi password tidak sama." });
export const updateUserSchema = z.object({ id: z.string().uuid(), full_name: fullName, nip, role: z.enum(ROLES, { message: "Peran tidak valid" }) });
export const changePasswordSchema = z.object({ current: z.string().min(1, "Password saat ini wajib diisi"), password: passwordSchema, confirm: z.string() })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "Konfirmasi password tidak sama." });
    if (v.password === v.current) ctx.addIssue({ code: "custom", path: ["password"], message: "Password baru harus berbeda dari password saat ini." });
  });

// Pembuat password acak (tanpa karakter yang mudah tertukar: 0/O, 1/l/I).
export function generatePassword(length = 14, rnd: (n: number) => number = secureInt): string {
  const lower = "abcdefghijkmnpqrstuvwxyz", upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", digit = "23456789", all = lower + upper + digit;
  const pick = (set: string) => set[rnd(set.length)]!;
  const chars = [pick(lower), pick(upper), pick(digit)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j]!, chars[i]!]; }
  return chars.join("");
}
function secureInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max; const buf = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(buf); } while (buf[0]! >= limit);
  return buf[0]! % max;
}
export function zodMessage(err: z.ZodError): string {
  return [...new Set(err.issues.map((i) => i.message))].join(" ");
}
