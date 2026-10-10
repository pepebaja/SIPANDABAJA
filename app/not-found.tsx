import Link from "next/link";
import { LogoMark } from "@/components/logo";
export const metadata = { title: "Halaman tidak ditemukan" };
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-navy-950 p-6 text-center text-white">
      <div className="space-y-4"><div className="flex justify-center"><LogoMark size={56} /></div>
        <p className="font-display text-6xl font-bold text-cyan-300">404</p><h1 className="font-display text-2xl font-bold text-white">Halaman tidak ditemukan</h1>
        <p className="text-slate-300">Alamat yang Anda buka tidak ada atau sudah dipindahkan.</p>
        <Link href="/" className="btn btn-primary">Kembali ke beranda</Link></div>
    </main>
  );
}
