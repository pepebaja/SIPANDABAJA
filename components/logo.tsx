export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <defs><linearGradient id="sb-logo" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop stopColor="#22d3ee" /><stop offset="1" stopColor="#6366f1" /></linearGradient></defs>
      <path d="M24 2.5 42 13v22L24 45.5 6 35V13z" fill="url(#sb-logo)" />
      <path d="M17 32V16.5h7.6a5.2 5.2 0 0 1 0 10.4H17" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="33" cy="32" r="2.4" fill="#fff" />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark size={compact ? 34 : 42} />
      <span className="leading-tight">
        <span className="block font-display text-xl font-bold tracking-tight text-white">SIPANDA<span className="text-cyan-300">BAJA</span></span>
        {!compact && <span className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pengadaan Barang/Jasa</span>}
      </span>
    </span>
  );
}
