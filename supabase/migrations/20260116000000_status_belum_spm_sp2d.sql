-- Status pembayaran transaksi: 'sudah_spm_sp2d' (ada Tanggal SPM/SP2D, diakui sebagai realisasi) dan 'belum_spm_sp2d' (belum ada tanggal, tercatat tetapi belum diakui).
-- Aman dijalankan ulang. Jalankan setelah 20260115.
alter table public.transactions drop column if exists payment_status;
alter table public.transactions add column payment_status text generated always as (case when payment_date is not null then 'sudah_spm_sp2d' else 'belum_spm_sp2d' end) stored;
create index if not exists transactions_pay_idx on public.transactions (budget_version_id, payment_status);
