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

## Unggah realisasi (v1.5.0, disederhanakan)

1. **Jalankan** `supabase/migrations/20260112000000_realisasi_unggah.sql` lalu `20260113000000_realisasi_sederhana.sql` (SQL Editor; aman diulang). Migrasi 13 memindahkan data SPM/SP2D lama ke kolom baru dan menghapus kolom lama; jenis/nomor/tanggal dokumen lama tetap tersimpan di database tetapi tidak dipakai lagi.
2. **Template 10 kolom**: tanggal_transaksi, kode_subkegiatan, kode_rekening, kode_sumber_dana, kode_rup, metode_pemilihan, tanggal_spm_sp2d, no_spm_sp2d, nilai, catatan. Dihapus: jenis transaksi, jenis dokumen, nomor dokumen, tanggal dokumen, kode paket (disatukan menjadi kode RUP). Nilai minus = koreksi.
3. **Aturan tahapan**: tanggal acuan = Tanggal SPM/SP2D bila ada, kalau tidak tanggal transaksi. Tahapan = yang tanggal berlakunya terakhir tidak melewati tanggal acuan (bawaan: Murni sebelum 16 Maret, Pergeseran 16 Maret s.d. 26 Oktober, Perubahan 27 Oktober s.d. 31 Desember; admin dapat mengubahnya di panel Aturan tahapan anggaran).
4. **Metode pemilihan** memakai master `procurement_methods` (E-purchasing, Pengadaan Langsung, Penunjukan Langsung, Tender Cepat, Tender, Seleksi, Swakelola; Perpres 16/2018 jo. 12/2021 jo. 46/2025). Kosong + kode RUP terisi = mengikuti metode rencana RUP. Singkatan "PL" ditolak karena ambigu.
5. **Memperbarui nomor**: baris dikenali dari tanggal transaksi + subkegiatan + rekening + sumber dana + nilai + kode RUP. Unggah ulang baris yang sama dengan nomor/tanggal SPM-SP2D/metode yang lebih lengkap memperbarui transaksi (tidak dicatat ganda); bila tanggal baru memindahkan tahapan, transaksi yang belum terverifikasi dipindah ke tahapan yang tepat. No SPM/SP2D juga dapat diisi manual lewat tombol Isi No SPM/SP2D / RUP di Daftar transaksi (kode RUP juga boleh menyusul dengan cara yang sama); bila tanggal SPM/SP2D pindah tahapan, transaksi belum terverifikasi dipindah otomatis ke rekening/RUP padanan di tahapan tujuan.
6. **Terverifikasi**: nilai, rekening, tanggal transaksi, dan tahapan terkunci; tanggal/nomor SPM-SP2D dan metode hanya dapat dilengkapi bila masih kosong, setelah terisi terkunci.
7. Pratinjau dan penerapan memakai fungsi database yang sama (`apply_transaction_import`); pratinjau dibatalkan otomatis. Batas 2.000 baris per unggahan (±3 detik di database).
8. Akuntabilitas: tiap unggahan tercatat (berkas, checksum, pengunggah, waktu), tiap transaksi menyimpan asal unggahan, semua perubahan masuk log audit. Verifikasi massal hanya admin.
9. File format lama tetap terbaca: kolom yang dihapus diabaikan dengan peringatan, SP2D diutamakan atas SPM, dan jenis koreksi/pembatalan tetap menjadi nilai minus.

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

## Tambahan: anggaran kas antartahapan dan laporan kinerja
- **Anggaran kas**: di menu Anggaran kas tersedia tombol *Salin anggaran kas* yang menyalin kas tahapan sebelumnya (Murni → Pergeseran → Perubahan) lalu dapat disesuaikan lewat input manual/unggah Excel. Sub kegiatan dan belanja baru (setelah anggaran tahapan itu diimpor) dibiarkan kosong untuk diisi.
- **Laporan kinerja pejabat pengadaan**: Laporan & dokumen > *Laporan kinerja pejabat pengadaan* (`/laporan/kinerja-pengadaan`), berformat presentasi dengan kerangka tata naskah dinas, filter pejabat, dan cetak/PDF.

## Realisasi: pengakuan, status, dan reset
- **Pengakuan**: transaksi diakui sebagai realisasi bila Tanggal SPM/SP2D terisi (status `sudah_spm_sp2d`). Tanpa tanggal itu, transaksi tetap dicatat dengan status `belum_spm_sp2d` (belum diakui, tetap menahan pagu), baik lewat input manual maupun unggah Excel/CSV.
- **Pemeriksaan unggahan**: tanggal tidak terbaca, di luar tahun anggaran, atau belum terjadi (setelah hari ini) ditolak dengan saran perbaikan; daftar masalah dapat diunduh sebagai CSV.
- **Reset**: Input Realisasi > Riwayat unggahan > *Reset data realisasi* (Super Admin/Admin OPD). Wajib unduh cadangan (Excel, format template) dan ketik `RESET <tahun>`.
- Migrasi baru: `20260114`, `20260115`, `20260116` (jalankan berurutan di Supabase SQL Editor).

## Penyederhanaan proses pengadaan
- **Kode paket = kode RUP.** Paket dibuat dari paket RUP (tombol *Buat paket dari semua RUP* atau *Tambah paket* dengan memilih satu kode RUP); nama, pagu, dan metode terisi otomatis. Kode paket lama otomatis disamakan dengan kode RUP (migrasi `20260117`).
- **Peringkat metode pemilihan di Beranda.** Tabel jumlah paket pekerjaan per metode pemilihan, diurutkan dari realisasi tertinggi ke terendah (realisasi diakui, kumulatif tahapan). Membutuhkan migrasi `20260118_peringkat_metode.sql`; tanpa migrasi, Beranda tetap menampilkan daftar jumlah paket per metode seperti sebelumnya.
- **Filter & kontrol data di Daftar transaksi realisasi.** Filter bertingkat Program → Kegiatan → Sub kegiatan, rentang tanggal (tanggal transaksi atau tanggal SPM/SP2D), dan *Kontrol data* (belum bertanggal SPM/SP2D, No SPM/SP2D kosong, pengadaan tanpa kode RUP, metode kosong, koreksi). Hasil menampilkan jumlah transaksi dan total nilai; formulir *Ubah* kini juga dapat melengkapi metode pemilihan, dan setelah menyimpan Anda kembali ke daftar dengan filter yang sama.
- **Input manual yang lebih cepat, akurat, dan aman.** Form Input Realisasi menampilkan ringkasan *Periksa sebelum menyimpan*, pratinjau nilai rupiah, peringatan isian (tanggal SPM/SP2D lebih awal dari tanggal transaksi, RUP tanpa metode, penyedia kosong), menolak transaksi duplikat dan melampaui batas pagu/kas, dan setelah tersimpan mempertahankan RUP, rekening, tanggal, metode, dan penyedia agar input berikutnya cepat.
- **Penyedia pelaksana pekerjaan.** Penyedia dipilih (atau diketik baru; nama yang sama tanpa membedakan huruf/spasi/titik dipakai ulang) saat input realisasi dan dapat diubah di Daftar transaksi. Terisi otomatis dari kontrak paket RUP bila ada. Laporan *Penyedia pelaksana pekerjaan* (menu Laporan) menampilkan nama penyedia dan jumlah paket (kode RUP unik) dalam satu tahun anggaran, nilai kontrak, dan realisasi. Filter *Kontrol data* mendapat opsi *Pengadaan, penyedia belum diisi*. Membutuhkan migrasi `20260119_penyedia_transaksi.sql`.
- **Analisis e-purchasing pada Laporan Kinerja PPBJ.** Slide *V. Analisis e-purchasing* membandingkan paket e-purchasing dengan pagu RUP dan metode pemilihan lainnya (jumlah paket, pagu, nilai kontrak, realisasi, serapan, rencana RUP vs pelaksanaan) beserta narasi otomatis; mengikuti filter pejabat dan ikut tercetak.
- **Menu Input Realisasi disederhanakan.** Satu bilah tab (*Daftar & kontrol*, *Input manual*, *Unggah Excel/CSV*, *Riwayat unggahan*). Pada *Daftar & kontrol* urutannya filter, lalu ringkasan angka (mengikuti filter), lalu tabel, sehingga hasil filter langsung dapat diperiksa. Setiap baris menampilkan catatan kelengkapan (tanggal/No SPM-SP2D, kode RUP, metode, penyedia). Tombol *Ubah* membuka dialog berisi seluruh isian; kolom yang dikosongkan dihapus dari transaksi, hanya kolom yang berubah yang disimpan, galat tampil di dalam dialog, dan filter/halaman daftar tidak hilang. Transaksi dapat dihapus dari dialog yang sama.
- **Filter Belanja di Input Realisasi.** *Jenis belanja* (Belanja Operasi/Modal/dst. beserta kelompoknya, diturunkan dari kode rekening) dan *Rekening belanja* tertentu, dapat digabung dengan filter program/kegiatan/sub kegiatan, tanggal, dan kontrol data. Daftar, jumlah transaksi, dan kartu ringkasan (termasuk total pagu rekening) mengikuti filter ini.
- **Tahapan menurut tanggal penetapan, kas per triwulan.** Tahapan transaksi = tahapan dengan tanggal penetapan terakhir yang <= tanggal acuan (Tanggal SPM/SP2D, atau tanggal transaksi bila belum ada); mendukung Pergeseran I/II dengan tanggal berbeda. Triwulan dari tanggal acuan yang sama (I Jan-Mar, II Apr-Jun, III Jul-Sep, IV Okt-Des). Contoh: 14 Mar 2026 = Murni TW I; 5 Okt 2026 = Pergeseran TW IV. Input manual tidak lagi terkunci pada tahapan yang dipilih di layar: transaksi dicatat pada tahapannya (rekening/RUP dipetakan otomatis) dan dibatasi anggaran kas tahapan itu. Halaman *Anggaran kas* memuat satu form untuk semua tahapan (pemilih tahapan, salin/unggah/input per tahapan) disertai panel *Penyesuaian kas terhadap realisasi*. Data anggaran kas yang sudah tersimpan tidak diubah. Membutuhkan migrasi `20260120_tahapan_triwulan_kas.sql`.
- **Dashboard lebih informatif dan interaktif.** Kartu *Perlu perhatian* (belum diakui, No SPM/SP2D kosong, metode/penyedia belum diisi, melampaui pagu, paket tindak lanjut) yang membuka Daftar transaksi terfilter; grafik *Anggaran kas vs realisasi per triwulan* (seri dapat dihidupkan/dimatikan, sisa kas terbawa ke triwulan berikutnya); donat *Realisasi menurut tahapan* dan *Status paket*; *Jelajahi anggaran dan serapan* per program/kegiatan/sub kegiatan/jenis belanja (urut, cari, serapan % atau nilai, klik untuk drill-down); grafik bulanan dengan tampilan kumulatif; transaksi terbaru.
- **Ubah dan Hapus paket di daftar Paket pengadaan.** Kolom *Aksi* (Super Admin, Admin OPD, PPBJ): *Ubah* membuka dialog (nama, pagu, status, metode, mode pelaksanaan, tenggat, PPBJ/PPK/PPTK; kode paket = kode RUP tidak diubah) dan *Hapus* dengan konfirmasi. Paket yang sudah punya transaksi realisasi atau kontrak/SP tidak dapat dihapus (ubah statusnya). Membutuhkan migrasi `20260121_hapus_paket.sql`. Tambah paket tetap lewat tombol *Tambah paket* atau *Buat paket dari semua RUP*.
- **Peringkat penyedia di Dashboard.** Tabel peringkat, nama penyedia, jumlah pekerjaan (paket/kode RUP unik), dan total kontrak untuk satu tahun anggaran (seluruh tahapan); dapat diurutkan menurut total kontrak atau jumlah pekerjaan, dicari, dan dibatasi 10/25/semua. Memakai sumber yang sama dengan laporan *Penyedia pelaksana pekerjaan*.
- **Paket lintas tahapan, jenis pengadaan, kontrak per metode, dan paket berulang.** *Buat paket dari semua RUP* kini membawa paket yang sudah berjalan pada tahapan sebelumnya (status, PPBJ/PPK/PPTK, tanggal, tenggat, sifat berulang, dan kontrak/SP disalin; kontrak yang sama tidak dihitung ganda di laporan penyedia); paket *Rencana* tanpa kontrak disegarkan bila di tahapan sebelumnya sudah berjalan. Paket kini punya *Jenis pengadaan* (barang/konstruksi/konsultansi/jasa lainnya) dan *Metode pemilihan* di daftar, rincian, dan lembar cetak. Formulir kontrak/SP menyesuaikan metode: E-purchasing = Surat Pesanan e-katalog, Pengadaan Langsung = bukti pembelian/SP/SPK, Penunjukan Langsung = SPK/kontrak, Tender/Seleksi = kontrak, Swakelola = SK/penugasan tanpa penyedia (peringatan bila tidak lazim). *Paket berulang* (konsumsi rapat, pemeliharaan kendaraan): banyak dokumen dan pelaksanaan di bawah satu kode RUP, *Uraian/keperluan* pada setiap transaksi (uraian berbeda = bukan duplikat), *Rincian pelaksanaan* (jumlah, total terpakai, sisa pagu) di rincian dan cetak paket, serta tombol *Catat pelaksanaan baru*. Membutuhkan migrasi `20260122_paket_jenis_berulang_kontrak.sql`.
- **Tanggal**: formulir hanya meminta *Target selesai (tenggat)*. Tanggal mulai proses, selesai proses, dan serah terima terisi otomatis saat status paket diubah. Kolom *tanggal penugasan* dihapus dari formulir.
- Tautan "Proses pengadaan" di Input Realisasi diganti keterangan; realisasi tertaut ke paket otomatis lewat kode RUP.
- Sisa istilah/verifikasi transaksi dihapus dari layar, laporan, dan cetak.
