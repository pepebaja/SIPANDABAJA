import { Suspense } from "react";
import Image from "next/image";
import { cookies } from "next/headers";
import { CONTEXT_COOKIE, decodeContext } from "@/lib/context";
import { loadContextOptions } from "@/lib/server/context-options";
import { LoginForm } from "@/components/login-form";
import { Icon, type IconName } from "@/components/icons";
export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk" };

const FEATURES: [IconName, string, string][] = [
  ["database", "Anggaran & RUP terpadu", "Impor anggaran, kelola paket RUP dan paket pengadaan."],
  ["chart", "Realisasi terverifikasi", "Pantau pagu, realisasi, dan sisa anggaran secara akurat."],
  ["shield", "Akses berbasis peran", "Setiap pengguna hanya mengakses data sesuai kewenangan."],
];
const VERSION = `v${process.env.NEXT_PUBLIC_APP_VERSION ?? ""}${process.env.NEXT_PUBLIC_BUILD ? ` · ${process.env.NEXT_PUBLIC_BUILD}` : ""}`;

export default async function LoginPage() {
  const saved = decodeContext((await cookies()).get(CONTEXT_COOKIE)?.value);
  const options = await loadContextOptions(saved?.yearId, saved?.stageId);
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col items-center justify-center gap-6 overflow-hidden bg-[#f3f8fc] p-10 lg:flex">
        <Image src="/logo-full.webp" alt="SIPANDABAJA - Sistem Informasi Pantau Data Pengadaan Barang dan Jasa" width={1024} height={678} priority
          className="w-full max-w-[40rem] [mask-image:radial-gradient(ellipse_at_center,#000_58%,transparent_100%)]" />
        <ul className="grid w-full max-w-2xl grid-cols-3 gap-5">{FEATURES.map(([icon, t, d]) => (
          <li key={t} className="space-y-1.5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-cyan-800 shadow-card"><Icon name={icon} /></span>
            <p className="text-sm font-semibold text-navy-800">{t}</p><p className="text-xs leading-relaxed text-slate-600">{d}</p></li>))}</ul>
      </section>
      <section className="flex flex-col items-center justify-center gap-6 bg-white p-6 sm:p-10">
        <Image src="/logo-full.webp" alt="SIPANDABAJA" width={1024} height={678} priority className="w-64 [mask-image:radial-gradient(ellipse_at_center,#000_40%,transparent_92%)] lg:hidden" />
        <Suspense><LoginForm options={options} /></Suspense>
        <p className="text-xs text-slate-400">SIPANDABAJA {VERSION}</p>
      </section>
    </main>
  );
}
