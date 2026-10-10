import Image from "next/image";

/** Maskot SIPANDABAJA (potongan bulat dari logo resmi). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <Image src="/logo-mark.png" alt="" width={size} height={size} className="shrink-0 rounded-full bg-white ring-2 ring-cyan-300/60 shadow-glow" aria-hidden="true" />;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark size={compact ? 36 : 44} />
      <span className="leading-tight">
        <span className="block font-display text-xl font-bold tracking-tight text-white">SIPANDA<span className="text-cyan-300">BAJA</span></span>
        {!compact && <span className="block text-[0.68rem] font-medium uppercase tracking-[0.14em] text-slate-400">Pantau Data Pengadaan</span>}
      </span>
    </span>
  );
}
