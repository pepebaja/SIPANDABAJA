"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/server/session";
import { changePasswordSchema, zodMessage } from "@/lib/users";

export type AccountState = { error?: string; ok?: boolean };
export async function changePasswordAction(_p: AccountState, fd: FormData): Promise<AccountState> {
  const s = await getSession(); if (!s) return { error: "Sesi berakhir. Silakan masuk kembali." };
  const parsed = changePasswordSchema.safeParse({ current: String(fd.get("current") ?? ""), password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data;
  const sb = await createClient();
  const email = (await sb.auth.getUser()).data.user?.email; // email Auth yang sebenarnya, bukan tebakan dari username
  if (!email) return { error: "Sesi berakhir. Silakan masuk kembali." };
  const check = await sb.auth.signInWithPassword({ email, password: v.current });
  if (check.error) return { error: "Password saat ini salah." };
  const { error } = await createAdminClient().auth.admin.updateUserById(s.userId, { password: v.password, app_metadata: { must_change_password: false } });
  if (error) return { error: "Password gagal diubah. Coba lagi." };
  await sb.auth.signInWithPassword({ email, password: v.password }); // segarkan sesi dengan kredensial baru
  return { ok: true };
}
