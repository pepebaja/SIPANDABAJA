"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { printProfileSchema } from "@/lib/settings";
import { zodMessage } from "@/lib/users";

export type SettingsState = { error?: string; ok?: boolean };
export async function saveSettingsAction(_p: SettingsState, fd: FormData): Promise<SettingsState> {
  const s = await getSession();
  if (!s || !can(s.roles, "print-profile:write")) return { error: "Hanya Super Admin dan Admin OPD yang dapat mengubah pengaturan." };
  const g = (k: string) => String(fd.get(k) ?? "");
  const parsed = printProfileSchema.safeParse({ org_name: g("org_name"), address: g("address"), city: g("city"), head_title: g("head_title"), head_name: g("head_name"), head_nip: g("head_nip") });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { org_name, ...rest } = parsed.data, admin = createAdminClient(), orgId = s.profile.organization_id;
  const a = await admin.from("organizations").update({ name: org_name }).eq("id", orgId);
  const b = await admin.from("system_settings").upsert({ organization_id: orgId, key: "print_profile", value: rest, updated_by: s.userId }, { onConflict: "organization_id,key" });
  if (a.error || b.error) return { error: "Pengaturan gagal disimpan. Coba lagi." };
  await admin.from("audit_logs").insert({ organization_id: orgId, actor_id: s.userId, action: "SETTINGS_UPDATE", table_name: "system_settings", new_data: { name: org_name } });
  revalidatePath("/", "layout");
  return { ok: true };
}
