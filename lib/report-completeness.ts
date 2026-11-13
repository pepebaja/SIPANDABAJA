import type { PerfPackage } from "./officer-performance";
import { progressOf, NO_OFFICER } from "./officer-performance";
/**
 * Kelengkapan data paket yang dibutuhkan Laporan Kinerja PPBJ. Tiap kunci = satu isian beserta bagian laporan yang bergantung padanya
 * dan cara melengkapinya (filter daftar paket ?lengkapi=kunci).
 */
export type GapKey = "ppbj" | "mulai" | "tenggat" | "serah" | "kontrak" | "metode" | "kendala";
export type Gap = { key: GapKey; label: string; affects: string; how: string; missing: number; of: number };
export type GapInput = PerfPackage & { methodMissing?: boolean };
export function reportCompleteness(pkgs: GapInput[], today: string): Gap[] {
  const act = pkgs.filter((p) => progressOf(p) !== "batalTunda"), run = act.filter((p) => ["diproses", "selesai"].includes(progressOf(p))), done = act.filter((p) => progressOf(p) === "selesai");
  const dated = act.filter((p) => !p.recurring), late = dated.filter((p) => p.due && p.due < today && ["persiapan", "diproses"].includes(progressOf(p)));
  const g = (key: GapKey, label: string, affects: string, how: string, set: GapInput[], bad: (p: GapInput) => boolean): Gap => ({ key, label, affects, how, of: set.length, missing: set.filter(bad).length });
  return [
    g("ppbj", "PPBJ pelaksana", "Kinerja per pejabat", "Ubah paket, pilih PPBJ", act, (p) => !p.officer || p.officer === NO_OFFICER),
    g("mulai", "Tanggal mulai proses", "Rata-rata durasi pengadaan", "Otomatis dari realisasi/status; atau isi di Ubah paket", run, (p) => !p.start),
    g("tenggat", "Tenggat", "Paket terlambat dan ketepatan waktu", "Ubah paket, isi tenggat (paket berulang dikecualikan)", dated, (p) => !p.due),
    g("serah", "Tanggal serah terima", "Ketepatan waktu paket selesai", "Otomatis dari realisasi terbayar penuh; atau isi di Ubah paket", done, (p) => !p.handover),
    g("kontrak", "Nilai kontrak/SP", "Efisiensi pagu terhadap kontrak", "Catat dokumen di rincian paket; otomatis untuk paket terbayar penuh", run, (p) => p.contract === null),
    g("metode", "Metode pemilihan", "Analisis e-purchasing dan peringkat metode", "Ubah paket, pilih metode (atau otomatis dari realisasi)", act, (p) => !!p.methodMissing),
    g("kendala", "Kategori kendala", "Slide Kendala dan paket terlambat", "Ubah paket, pilih kategori kendala", late, (p) => !p.obstacle),
  ];
}
