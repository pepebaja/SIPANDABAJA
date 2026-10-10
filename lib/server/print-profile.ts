import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Session } from "./session";
import { EMPTY_PROFILE, type PrintProfile } from "@/lib/settings";

/** Data kop/tanda tangan dibaca lewat service role (system_settings dibatasi untuk admin), tetapi hanya untuk pengguna yang sudah masuk dan hanya field cetak. */
export async function getPrintProfile(s: Session): Promise<PrintProfile> {
  const [{ data: org }, { data: row }] = await Promise.all([
    (await createClient()).from("organizations").select("name").maybeSingle(),
    createAdminClient().from("system_settings").select("value").eq("organization_id", s.profile.organization_id).eq("key", "print_profile").maybeSingle()]);
  const v = (row?.value ?? {}) as Record<string, unknown>, str = (k: string, d = "") => (typeof v[k] === "string" ? (v[k] as string) : d);
  return { orgName: org?.name ?? "", address: str("address"), city: str("city"), headTitle: str("head_title", EMPTY_PROFILE.headTitle), headName: str("head_name"), headNip: str("head_nip") };
}
