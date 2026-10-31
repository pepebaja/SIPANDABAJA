# SIPANDABAJA

**Sistem Informasi Pantau Data Pengadaan Barang dan Jasa.** Next.js 15 + Supabase. Font aplikasi: Arial.
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

## Unggah realisasi (v1.4.0)

1. **Jalankan** `supabase/migrations/20260112000000_realisasi_unggah.sql` (SQL Editor). Menambah tanggal berlaku tahapan, kolom SPM/SP2D, dan fungsi penerapan impor. Aman diulang.
2. Menu **Input Realisasi > Unggah Excel/CSV**: atur tanggal mulai berlaku Pergeseran/Perubahan (Murni otomatis 1 Januari), unduh template, isi, lalu Periksa file dan Catat.
3. **Aturan tahapan**: tanggal acuan = tanggal SP2D (sudah cair), kalau tidak ada tanggal SPM, kalau tidak ada tanggal transaksi. Tahapan = yang tanggal berlakunya terakhir tidak melewati tanggal acuan. Baris dengan kode RUP/paket = proses pengadaan; tanpa kode = non-pengadaan.
4. Pratinjau dan penerapan memakai fungsi database yang sama (`apply_transaction_import`), sehingga pagu rekening, anggaran kas kumulatif, pagu RUP, dan dokumen ganda diperiksa persis seperti input manual. Pratinjau dibatalkan otomatis.
5. Batas 2.000 baris per unggahan (±3 detik di database); file lebih besar dibagi beberapa bagian, dokumen yang sudah tercatat otomatis dilewati.
6. Akuntabilitas: tiap unggahan tercatat (berkas, checksum, pengunggah, waktu), tiap transaksi menyimpan asal unggahan, dan semua perubahan masuk log audit. Verifikasi massal hanya admin.

## Performa (v1.3.0)

1. **Wajib** jalankan migrasi `supabase/migrations/20260111000000_performa.sql` (SQL Editor). Isinya: fungsi total realisasi 1 baris, indeks yang kurang, dan optimasi RLS. Aman diulang; tanpa migrasi ini aplikasi tetap jalan memakai cara lama yang lebih lambat.
2. **Samakan region.** `vercel.json` menetapkan fungsi Vercel di `sin1` (Singapura). Cek **Supabase > Project Settings > General > Region**; bila bukan Singapore, ubah `regions` di `vercel.json` agar sedekat mungkin dengan region Supabase (mis. `iad1` untuk us-east). Region yang berjauhan menambah ratusan milidetik pada SETIAP kueri.
3. Navigasi antarmenu memakai cache klien 30 detik (`staleTimes`); setiap aksi simpan/ubah membersihkannya. Data yang diubah pengguna lain dapat tampil terlambat hingga 30 detik; muat ulang halaman untuk data terkini.
4. Middleware memverifikasi sesi sekali per permintaan lalu meneruskan id pengguna lewat header internal yang selalu ditimpa middleware (lihat `tests/middleware.test.ts`).

## Tidak bisa masuk? (pemulihan akses)

Masuk selalu memakai **username**. Server mencari email Auth asli milik username dari tabel profil, sehingga akun yang dibuat lewat dashboard Supabase,
versi lama, atau dengan `AUTH_EMAIL_DOMAIN` berbeda tetap bisa masuk. Langkah bila `admin` masih ditolak:

1. Supabase > SQL Editor: jalankan `supabase/diagnostics/cek-login.sql`. Akun harus punya profil aktif + peran; bagian 3 menunjukkan kunci sementara (5 gagal/15 menit).
2. Pulihkan sekali jalan (membuat/memperbaiki akun, mengatur password, membuka blokir & kunci, mencatat audit):
   `node --env-file=.env.local scripts/pulihkan-akses.mjs admin "PasswordBaru123x" "Administrator" super_admin`
3. Vercel > Logs: baris `[login] gagal username=... sebab=...` menunjukkan penyebab sebenarnya (hanya di log server, tidak ditampilkan ke pengguna).
4. Pesan "Konfigurasi server belum lengkap" berarti `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, atau `SUPABASE_SERVICE_ROLE_KEY` belum diisi di Vercel.

Setiap login berhasil/gagal (pada akun yang ada) tercatat di menu **Log audit** (tanpa password).

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

## Anggaran kas (per triwulan)

Menu **Anggaran kas** menyusun rencana kas per **triwulan (TW I-IV)** untuk setiap Program > Kegiatan > Sub Kegiatan > Belanja, dengan subtotal tiap tingkat.
- **Input manual**: edit langsung pada tabel, tombol ÷4 membagi pagu rata, lalu *Simpan perubahan*.
- **Unggah Excel/PDF**: gunakan *Unduh template Excel* (berisi seluruh rekening anggaran), isi kolom `tw1`-`tw4`, unggah, periksa pratinjau, lalu *Terapkan*.
  PDF berbasis teks dibaca otomatis (best-effort; cocokkan kode sub kegiatan dan rekening dengan anggaran). PDF hasil scan tidak didukung.
- **Wajib** menjalankan migrasi `supabase/migrations/20260107000000_cash_quarterly.sql` (mengubah kolom bulan menjadi triwulan; data bulanan lama digabung otomatis).

## Paket RUP (sinkronisasi SIRUP dan input manual)

Menu **Paket RUP** dapat diisi dan diperbarui dengan dua cara, dan keduanya boleh dipakai bergantian saat anggaran bergeser atau berubah sehingga RUP ikut disesuaikan:
- **Unggah file RUP dari SIRUP** (`.xlsx`): berkas ekspor SIRUP (kolom ID, Paket, Pagu (Rp), Jenis Pengadaan, Metode Pemilihan) dibaca langsung; judul di atas tabel dilewati otomatis. Template sendiri tersedia di menu.
  Pencocokan memakai **kode RUP**: kode baru *ditambah*, kode yang sama *diubah* bila nama/jenis/metode/pagu berbeda, dan yang isinya sama tidak disentuh.
  Sistem menampilkan pratinjau perubahan; **tidak ada yang tersimpan sebelum menekan Terapkan** (atomik, satu transaksi). Opsi tambahan: *hapus paket yang tidak ada di file* (hanya bila seluruh baris valid) dan *terapkan hanya baris valid*.
  File yang sama tidak dapat diterapkan dua kali; riwayat unggahan tampil di halaman Paket RUP.
- **Input manual**: tambah lewat formulir, **ubah** dan **hapus** lewat halaman detail paket (atau tombol di daftar).

Catatan perilaku: menghapus paket RUP ikut menghapus alokasi rekeningnya (tercatat di log audit), sedangkan paket pengadaan yang bertaut tidak dihapus, hanya tautan RUP-nya dikosongkan. Bila pagu diturunkan di bawah total alokasi, perubahan tetap diterima tetapi diberi peringatan agar alokasi disesuaikan.
Hak ubah: Super Admin, Admin OPD, dan PPBJ. **Wajib** menjalankan migrasi `supabase/migrations/20260109000000_rup_sync.sql`.

## Input Realisasi (menu terpadu)

Menu **Input Realisasi** menggantikan menu Realisasi dan Paket pengadaan yang terpisah (proses pengadaan tetap tersedia lewat tautan di halaman ini). Alurnya: pilih **kode RUP** (opsional, untuk belanja non-pengadaan dikosongkan) lalu **rekening anggaran** dari arsip anggaran, kemudian tanggal dan nilai. Layar menampilkan program, kegiatan, sub kegiatan, sumber dana, PPTK, pagu rekening, pagu RUP, dan anggaran kas per triwulan.
- Satu kode RUP dapat dicatat berulang (proses pengadaan berulang); sisa pagu RUP dan rekening dihitung otomatis.
- **Anggaran kas kumulatif**: triwulan ditentukan dari tanggal transaksi. Sisa kas triwulan lalu terbawa ke berikutnya; kas triwulan depan tidak dapat dipakai untuk triwulan sebelumnya. Untuk transaksi di triwulan q, setiap triwulan k >= q harus memenuhi *kas kumulatif s.d. k >= realisasi s.d. k*.
- Pembayaran yang melebihi pagu rekening, sisa kas kumulatif, atau pagu RUP **ditolak** (trigger database `check_transaction_limits`, jadi berlaku untuk semua jalur). Koreksi/pembatalan mengembalikan sisa mulai triwulan tanggalnya. Perhitungan memakai semua transaksi, terverifikasi maupun belum. Tanggal transaksi harus di tahun anggaran. Rekening tanpa anggaran kas tidak dapat dibelanjakan.
- Wajib menjalankan migrasi `supabase/migrations/20260110000000_realization_limits.sql`. Hak mencatat: Super Admin, Admin OPD, PPBJ.

## Laporan dan dokumen cetak

Menu **Laporan & dokumen** menyediakan laporan yang dapat dicetak (kop surat + tanda tangan otomatis) atau diunduh sebagai Excel:
rekap anggaran dan realisasi, daftar paket pengadaan, daftar paket RUP, rencana anggaran kas, daftar transaksi, daftar pengguna, dan log audit.
Dokumen lain: Panduan pengguna, Formulir permohonan akun, Lembar rincian paket (dari halaman detail paket), template impor anggaran,
serta unduhan Excel tiap master data. Untuk PDF, pilih "Simpan sebagai PDF" pada dialog cetak browser.

Super Admin atau Admin OPD mengisi nama OPD, alamat, kota, dan pejabat penandatangan di menu **Pengaturan** (dipakai pada kop dan tanda tangan semua dokumen).

## Pengembangan

`npm install`, salin `.env.example` ke `.env.local`, `npm run dev`. Tes: `npm test`, `npm run typecheck`.
Service-role key hanya untuk server/skrip.
