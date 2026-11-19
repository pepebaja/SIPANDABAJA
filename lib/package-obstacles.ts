/** Kategori kendala pengadaan (dipakai pada Laporan Kinerja PPBJ, slide Kendala). Nilai lain yang sudah tersimpan tetap ditampilkan. */
export const OBSTACLES = [
  "Dokumen persiapan belum lengkap", "Menunggu ketersediaan/penetapan anggaran", "Perubahan spesifikasi atau volume pekerjaan", "Penyedia tidak merespons atau tidak ada penawaran",
  "Sanggahan atau pengaduan", "Kendala teknis aplikasi (SPSE/e-katalog)", "Keterlambatan pelaksanaan oleh penyedia", "Menunggu persetujuan pejabat berwenang", "Lainnya",
] as const;

/** Saran kategori kendala: daftar baku lebih dulu, lalu isian bebas yang pernah dipakai (unik, tanpa membedakan huruf besar/kecil), terurut abjad. */
export function obstacleSuggestions(used: (string | null | undefined)[]): string[] {
  const seen = new Set<string>(OBSTACLES.map((o) => o.toLowerCase())), extra: string[] = [];
  for (const u of used) { const t = (u ?? "").replace(/\s+/g, " ").trim(); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); extra.push(t); } }
  return [...OBSTACLES, ...extra.sort((a, b) => a.localeCompare(b, "id"))];
}
