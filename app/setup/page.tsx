import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SetupForm } from "@/components/setup-form";
import { Brand } from "@/components/logo";
export const dynamic = "force-dynamic";
export const metadata = { title: "Setup awal" };
export default async function SetupPage() {
  const { count } = await createAdminClient().from("profiles").select("id", { head: true, count: "exact" });
  if ((count ?? 0) > 0) redirect("/login");
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-navy-900 p-4">
      <div className="grid-bg absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-md space-y-6">
        <Brand />
        <div className="card space-y-5 p-7">
          <div><p className="eyebrow">Setup awal</p><h1 className="font-display text-2xl font-bold">Buat Super Admin pertama</h1>
            <p className="mt-1 text-sm text-slate-600">Halaman ini hanya aktif selama belum ada pengguna, dan otomatis tertutup setelah akun pertama dibuat.</p></div>
          {process.env.SETUP_TOKEN ? <SetupForm /> : <p role="alert" className="alert alert-warn">Variabel <b>SETUP_TOKEN</b> belum diatur. Tambahkan di Environment Variables Vercel (isi dengan kode rahasia pilihan Anda), lalu deploy ulang.</p>}
        </div>
      </div>
    </main>
  );
}
