"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CONTEXT_COOKIE, encodeContext } from "@/lib/context";
export async function setBudgetContext(yearId: string, stageId: string): Promise<{ error?: string }> {
  const sb = await createClient();
  // Divalidasi lewat RLS: id di luar OPD pengguna tidak ditemukan.
  const [y, s] = await Promise.all([
    sb.from("budget_years").select("id").eq("id", yearId).eq("is_active", true).maybeSingle(),
    sb.from("budget_stages").select("id").eq("id", stageId).eq("is_active", true).maybeSingle()]);
  if (!y.data || !s.data) return { error: "Konteks tidak valid." };
  (await cookies()).set(CONTEXT_COOKIE, encodeContext(yearId, stageId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  revalidatePath("/", "layout");
  return {};
}
