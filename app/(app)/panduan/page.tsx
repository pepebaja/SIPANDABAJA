import Link from "next/link";
import { getSession } from "@/lib/server/session";
import { getPrintProfile } from "@/lib/server/print-profile";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/rbac";
import { Sheet } from "@/components/report-sheet";
import { PrintButton } from "@/components/print-button";
export const metadata = { title: "Panduan pengguna" };

const TERMS: [string, string][] = [
  ["Pagu", "Batas anggaran. Ada pagu rekening anggaran, pagu paket RUP, dan pagu paket pengadaan."],
  ["Rekening anggaran", "Baris anggaran: kombinasi subkegiatan, rekening belanja, dan sumber dana beserta nilainya."],
  ["Paket RUP", "Paket dalam Rencana Umum Pengadaan. Satu paket dapat memakai beberapa rekening, dan satu rekening dapat membiayai beberapa paket (alokasi)."],
  ["Paket pengadaan", "Paket yang dikelola proses pengadaannya: metode, pejabat, status, dan jadwal."],
  ["Kontrak/SP", "Kontrak, SPK, atau Surat Pesanan. Nilainya adalah komitmen, BUKAN realisasi keuangan."],
  ["Realisasi", "Belanja yang benar-benar dicatat lewat transaksi dan sudah terverifikasi. Hanya transaksi terverifikasi yang dihitung."],
];
const FLOW: [string, string, string][] = [
  ["Pilih tahun dan tahapan", "Bagian atas layar", "Semua data mengikuti tahun anggaran dan tahapan (Murni/Pergeseran/Perubahan) yang dipilih."],
  ["Lengkapi master data", "Master data", "Isi program, kegiatan, subkegiatan, sumber dana, rekening belanja, pejabat (PPK/PPTK/PPBJ), penyedia, dan metode. Master harus ada sebelum anggaran diimpor."],
  ["Siapkan dan impor anggaran", "Impor anggaran", "Klik Siapkan versi anggaran (sekali per tahun/tahapan), unduh template Excel, isi, lalu unggah (.xlsx maks. 5 MB). Klik Periksa file; bila ada baris bermasalah, perbaiki lalu unggah ulang. Setelah semua valid, klik Konfirmasi dan simpan."],
  ["Catat paket RUP dan alokasinya", "Paket RUP", "Tambah paket RUP, lalu buka paketnya dan alokasikan ke rekening anggaran. Sistem menolak alokasi yang melebihi pagu paket atau pagu rekening."],
  ["Buat paket pengadaan", "Paket pengadaan", "Isi kode, nama, pagu, metode, dan pejabat. Tautkan ke paket RUP, ubah status sesuai perkembangan, dan catat kontrak/SP bila sudah ada."],
  ["Susun anggaran kas", "Anggaran kas", "Isi rencana kas per rekening per bulan. Peringatan membantu mendeteksi kas yang melebihi pagu atau belum selaras dengan jadwal paket."],
  ["Catat realisasi", "Realisasi", "Input transaksi (pembayaran/koreksi/pembatalan) berdasarkan dokumen. Admin kemudian memverifikasi. Koreksi dan pembatalan dicatat sebagai nilai negatif; transaksi terverifikasi tidak dapat diubah."],
  ["Cetak laporan", "Laporan & dokumen", "Cetak atau unduh Excel: rekap anggaran dan realisasi, daftar paket, rencana kas, transaksi, dan lainnya."],
];
const MATRIX: [string, Role[]][] = [
  ["Melihat dashboard, RUP, paket, kas, realisasi, dan laporan data", [...ROLES]],
  ["Mengisi dan mengubah master data; menyiapkan versi anggaran; memverifikasi transaksi", ["super_admin", "admin_opd"]],
  ["Impor anggaran; mengelola paket RUP, alokasi, paket pengadaan, anggaran kas; input transaksi", ["super_admin", "admin_opd", "ppbj"]],
  ["Mencatat kontrak/SP", ["super_admin", "admin_opd", "ppbj", "ppk"]],
  ["Membuat akun, mengubah peran, reset password, menonaktifkan akun", ["super_admin", "admin_opd"]],
  ["Melihat daftar pengguna dan log audit", ["super_admin", "admin_opd", "auditor"]],
  ["Mengubah pengaturan OPD dan kop cetak", ["super_admin", "admin_opd"]],
];
const FAQ: [string, string][] = [
  ["Lupa password.", "Hubungi administrator. Administrator dapat mengatur ulang password dari menu Pengguna, dan Anda wajib menggantinya saat masuk berikutnya."],
  ["Muncul pesan \"Username atau password salah\".", "Periksa huruf, tanpa spasi di awal/akhir. Setelah 5 kali gagal, akun terkunci sementara 15 menit. Akun nonaktif juga ditolak."],
  ["Impor anggaran ditolak.", "Biasanya kode subkegiatan, rekening, sumber dana, atau NIP PPTK belum ada di master data, atau pagu bukan angka. Perbaiki sesuai tabel masalah, lalu unggah ulang."],
  ["Realisasi tidak sama dengan perkiraan.", "Periksa apakah masih ada transaksi belum diverifikasi. Hanya yang terverifikasi masuk perhitungan realisasi, sisa, dan persentase."],
  ["Salah mencatat transaksi yang sudah terverifikasi.", "Jangan diubah. Buat transaksi Koreksi atau Pembatalan agar jejak keuangan tetap utuh."],
  ["Data tidak muncul.", "Pastikan tahun dan tahapan di bagian atas sudah benar, dan versi anggaran untuk periode itu sudah disiapkan."],
];

export default async function Panduan() {
  const s = await getSession(); if (!s) return null;
  const profile = await getPrintProfile(s), mine = new Set(s.roles);
  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3"><Link href="/laporan" className="link text-sm">← Laporan &amp; dokumen</Link><PrintButton label="Cetak panduan" /></div>
      <Sheet profile={profile} title="Panduan Pengguna SIPANDABAJA" subtitle="Sistem Informasi Pantau Data Pengadaan Barang dan Jasa" signatures={false} printer={{ name: s.profile.full_name, nip: s.profile.nip, role: "Pengguna" }}>
        <p className="text-sm">SIPANDABAJA membantu satu OPD mengelola anggaran, paket RUP, paket pengadaan, anggaran kas, dan realisasi dalam satu tempat, dengan hak akses sesuai peran dan jejak audit.</p>
        <h3>1. Istilah penting</h3>
        <dl className="kv">{TERMS.map(([k, v]) => <div key={k} className="contents"><dt className="font-semibold text-slate-900">{k}</dt><dd>{v}</dd></div>)}</dl>
        <h3>2. Masuk dan keamanan akun</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Masuk memakai <b>username</b> (bukan email) dan password dari administrator.</li>
          <li>Saat pertama masuk, Anda diminta mengganti password sementara. Password baru minimal 10 karakter dan memuat huruf besar, huruf kecil, dan angka.</li>
          <li>Jangan membagikan akun. Semua aktivitas tercatat atas nama akun Anda.</li>
          <li>Gunakan tombol <b>Keluar</b> setelah selesai, terutama di komputer bersama. Ganti password kapan saja di menu <b>Akun saya</b>.</li>
        </ul>
        <h3>3. Alur kerja yang disarankan</h3>
        <ol className="space-y-3 text-sm">{FLOW.map(([t, where, d], i) => <li key={t} className="grid grid-cols-[1.75rem_1fr] gap-2 [break-inside:avoid]"><span className="grid h-7 w-7 place-items-center rounded-full bg-navy-800 text-xs font-bold text-white">{i + 1}</span><span><b>{t}</b> <span className="text-slate-500">({where})</span><br />{d}</span></li>)}</ol>
        <h3>4. Peran dan hak akses</h3>
        <p className="mb-2 text-sm">Peran Anda saat ini: <b>{s.roles.map((r) => ROLE_LABELS[r]).join(", ") || "-"}</b>. Tanda ✓ berarti peran tersebut berwenang.</p>
        <div className="overflow-x-auto"><table>
          <thead><tr><th>Kewenangan</th>{ROLES.map((r) => <th key={r} className={`text-center ${mine.has(r) ? "!bg-cyan-100" : ""}`}>{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody>{MATRIX.map(([k, roles]) => <tr key={k}><td>{k}</td>{ROLES.map((r) => <td key={r} className={`text-center ${mine.has(r) ? "bg-cyan-50" : ""}`}>{roles.includes(r) ? "✓" : ""}</td>)}</tr>)}</tbody></table></div>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-600">{ROLES.map((r) => <li key={r}><b>{ROLE_LABELS[r]}</b>: {ROLE_DESCRIPTIONS[r]}</li>)}</ul>
        <h3>5. Laporan dan pencetakan</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Buka <b>Laporan &amp; dokumen</b>, pilih laporan, lalu <b>Cetak</b> atau <b>Excel</b>. Untuk PDF, pilih tujuan &quot;Simpan sebagai PDF&quot; di dialog cetak.</li>
          <li>Kop surat, kota, dan pejabat penandatangan diatur Super Admin atau Admin OPD di menu <b>Pengaturan</b>.</li>
          <li>Lembar rincian satu paket dicetak dari halaman detail paket (tombol <b>Cetak lembar rincian</b>).</li>
        </ul>
        <h3>6. Pertanyaan umum</h3>
        <dl className="space-y-3 text-sm">{FAQ.map(([q, a]) => <div key={q} className="[break-inside:avoid]"><dt className="font-semibold">{q}</dt><dd className="text-slate-700">{a}</dd></div>)}</dl>
      </Sheet>
    </section>
  );
}
