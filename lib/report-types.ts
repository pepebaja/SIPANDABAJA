import type { Permission } from "./rbac";
import { formatRupiah } from "./format";

export type Kind = "text" | "money" | "percent" | "int";
export type Col = { key: string; label: string; kind?: Kind; align?: "left" | "right" | "center"; width?: number };
export type Cell = string | number | null;
export type Report = {
  slug: string; title: string; subtitle?: string; columns: Col[]; rows: Record<string, Cell>[];
  totals?: Record<string, Cell>; notes?: string[]; landscape: boolean;
};
export type ReportMeta = { slug: string; title: string; description: string; landscape: boolean; needsVersion: boolean; permission?: Permission };

export const REPORTS: ReportMeta[] = [
  { slug: "anggaran-realisasi", title: "Rekapitulasi Anggaran dan Realisasi", description: "Pagu, realisasi terverifikasi, belum diverifikasi, sisa, dan persentase per rekening anggaran.", landscape: true, needsVersion: true },
  { slug: "paket-pengadaan", title: "Daftar Paket Pengadaan", description: "Seluruh paket pengadaan beserta metode, pejabat, pagu, nilai kontrak/SP, dan status.", landscape: true, needsVersion: true },
  { slug: "paket-rup", title: "Daftar Paket RUP", description: "Paket RUP dengan pagu, total alokasi ke rekening, dan sisa yang belum dialokasikan.", landscape: true, needsVersion: true },
  { slug: "anggaran-kas", title: "Rencana Anggaran Kas", description: "Rencana kas per rekening untuk 12 bulan beserta totalnya terhadap pagu.", landscape: true, needsVersion: true },
  { slug: "transaksi", title: "Daftar Transaksi Realisasi", description: "Seluruh transaksi realisasi (pembayaran, koreksi, pembatalan) beserta status verifikasi.", landscape: true, needsVersion: true },
  { slug: "pengguna", title: "Daftar Pengguna Aplikasi", description: "Username, nama, peran, dan status akun pengguna.", landscape: false, needsVersion: false, permission: "users:read" },
  { slug: "log-audit", title: "Log Audit Aktivitas", description: "1.000 catatan aktivitas terbaru: siapa, melakukan apa, pada objek apa.", landscape: false, needsVersion: false, permission: "audit:read" },
];
export const findReport = (slug: string) => REPORTS.find((r) => r.slug === slug);

const nf = (s: string) => formatRupiah(s).replace(/^Rp /, "");
/** Format tampilan sel (HTML/cetak). Nilai uang disimpan sebagai string desimal agar presisi terjaga. */
export function formatCell(kind: Kind | undefined, v: Cell): string {
  if (v === null || v === "") return "-";
  if (kind === "money") return nf(String(v));
  if (kind === "percent") return `${String(v).replace(".", ",")}%`;
  if (kind === "int") return new Intl.NumberFormat("id-ID").format(Number(v));
  return String(v);
}
