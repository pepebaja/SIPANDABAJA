import { createClient } from "@/lib/supabase/server";
export default async function Home() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: p }, { data: roles }] = await Promise.all([
    sb.from("profiles").select("full_name, username").eq("id", user!.id).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", user!.id)]);
  return (
    <section className="max-w-2xl space-y-2">
      <h1 className="text-2xl font-semibold text-navy-800">Selamat datang, {p?.full_name ?? "pengguna"}</h1>
      <p className="text-slate-600">Role: {roles?.map((r) => r.role).join(", ") || "belum ditetapkan"}. Dashboard dibangun pada Tahap 3.</p>
    </section>
  );
}
