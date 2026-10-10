# SIPANDABAJA

**Sistem Informasi Pantau Data Pengadaan Barang dan Jasa.** Next.js 15 + Supabase.
Masuk memakai **username** (bukan email).

## Pemasangan (sekali saja)

1. **Supabase**: buat project, lalu jalankan migrasi berurutan di `supabase/migrations/` (`supabase db push`
   atau tempel satu per satu di SQL Editor), kemudian jalankan `supabase/seed.sql`.
2. **Supabase > Authentication**:
   - Providers > Email: matikan **Allow new users to sign up** (akun hanya dibuat admin).
   - (Opsional) Password minimum length ≥ 10.
3. **Vercel > Environment Variables**: isi semua variabel di `.env.example`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_EMAIL_DOMAIN`, `SETUP_TOKEN`), lalu **Redeploy**.
4. Buka `https://<domain-anda>/setup`, isi kode `SETUP_TOKEN`, lalu buat **Super Admin pertama**.
   Halaman ini otomatis tertutup setelah akun pertama ada. Setelah itu boleh menghapus `SETUP_TOKEN`.
5. Masuk di `/login`. Tambah pengguna lain lewat menu **Pengguna**.

Alternatif tanpa halaman setup (CLI):
`node --env-file=.env.local scripts/create-user.mjs <username> "<Password>" "<Nama Lengkap>" super_admin`

## Memastikan versi terbaru sudah aktif

Versi aplikasi tampil kecil di kiri bawah sidebar dan di bawah formulir login (mis. `v1.2.0 · a1b2c3d`; kode di belakangnya adalah commit GitHub).
Bila menu yang diharapkan belum muncul, cek angka itu. Bila lebih lama, buka Vercel > Deployments dan pastikan deploy terbaru berstatus **Ready**
(bila **Error**, buka log build-nya), lalu muat ulang browser dengan Ctrl+F5.

## Tahun dan tahapan anggaran

Dipilih saat masuk (halaman login) dan menjadi konteks seluruh aplikasi. Dapat diganti kapan saja lewat pilihan di bagian atas aplikasi.

## Pengelolaan akun

- Menu **Pengguna** (Super Admin / Admin OPD): buat akun, ubah nama/NIP/peran, reset password, aktif/nonaktifkan.
- Akun baru dan akun yang di-reset **wajib mengganti password** saat masuk pertama kali.
- Menu **Akun saya**: lihat profil dan ganti password sendiri.
- Aturan username: 3-32 karakter huruf kecil, angka, `.` `_` `-` (diawali dan diakhiri huruf/angka).
- Aturan password: minimal 10 karakter, ada huruf besar, huruf kecil, dan angka; tidak memuat username/kata umum.
- Admin OPD tidak dapat membuat/mengubah akun Super Admin atau Admin OPD lain. Super Admin aktif terakhir tidak dapat dinonaktifkan.
- Percobaan masuk dibatasi (5 gagal/username dan 20 gagal/IP per 15 menit).

## Laporan dan dokumen cetak

Menu **Laporan & dokumen** menyediakan laporan yang dapat dicetak (kop surat + tanda tangan otomatis) atau diunduh sebagai Excel:
rekap anggaran dan realisasi, daftar paket pengadaan, daftar paket RUP, rencana anggaran kas, daftar transaksi, daftar pengguna, dan log audit.
Dokumen lain: Panduan pengguna, Formulir permohonan akun, Lembar rincian paket (dari halaman detail paket), template impor anggaran,
serta unduhan Excel tiap master data. Untuk PDF, pilih "Simpan sebagai PDF" pada dialog cetak browser.

Super Admin atau Admin OPD mengisi nama OPD, alamat, kota, dan pejabat penandatangan di menu **Pengaturan** (dipakai pada kop dan tanda tangan semua dokumen).

## Pengembangan

`npm install`, salin `.env.example` ke `.env.local`, `npm run dev`. Tes: `npm test`, `npm run typecheck`.
Service-role key hanya untuk server/skrip.
