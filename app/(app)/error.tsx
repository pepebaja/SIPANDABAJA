"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="card max-w-xl space-y-3 p-6">
      <p className="eyebrow">Terjadi kendala</p><h1 className="page-title">Halaman tidak dapat dimuat</h1>
      <p className="text-slate-600">Coba muat ulang. Jika masih terjadi, hubungi administrator dan sebutkan menu yang sedang dibuka.</p>
      <div className="flex gap-2"><button onClick={reset} className="btn btn-primary">Coba lagi</button><a href="/" className="btn btn-ghost">Ke beranda</a></div>
    </div>
  );
}
