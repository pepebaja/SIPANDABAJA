import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "@/components/package-form";
export default async function NewPackage() {
  const sb = await createClient();
  const [m, o] = await Promise.all([
    sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name"),
    sb.from("officials").select("id, name, official_type").eq("is_active", true).order("name").limit(1000)]);
  const by = (t: string) => (o.data ?? []).filter((r) => r.official_type === t).map((r) => ({ value: r.id, label: r.name }));
  return <section className="space-y-4"><h1 className="page-title">Tambah paket pengadaan</h1>
    <PackageForm methods={(m.data ?? []).map((r) => ({ value: r.id, label: r.name }))} ppbj={by("ppbj")} ppk={by("ppk")} pptk={by("pptk")} /></section>;
}
