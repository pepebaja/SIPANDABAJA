-- Jenis pengadaan pada paket, paket berulang, uraian pelaksanaan, bentuk dokumen sesuai metode pemilihan, dan paket yang dibawa antar tahapan.
-- Tidak menghapus/mengubah data yang ada (jenis pengadaan paket lama diisi dari RUP-nya). Aman dijalankan ulang. Jalankan setelah 20260121.

alter table public.procurement_packages add column if not exists procurement_type text check (procurement_type in ('barang','konstruksi','konsultansi','jasa_lainnya'));
alter table public.procurement_packages add column if not exists is_recurring boolean not null default false;          -- paket berulang (mis. konsumsi rapat, pemeliharaan kendaraan)
alter table public.procurement_packages add column if not exists carried_from uuid references public.procurement_packages(id) on delete set null;   -- paket tahapan sebelumnya yang dibawa
update public.procurement_packages p set procurement_type = r.procurement_type from public.rup_packages r where r.id = p.rup_package_id and p.procurement_type is null;

-- Uraian/keperluan tiap transaksi (mis. "Konsumsi rapat koordinasi 12 Nov"): memungkinkan dua transaksi bertanggal dan bernilai sama dengan uraian berbeda.
alter table public.transactions add column if not exists description text check (description is null or char_length(description) <= 300);

-- Bentuk dokumen mengikuti metode pemilihan: tambah bukti pembelian (pengadaan langsung) dan SK/penugasan swakelola; uraian pelaksanaan pada dokumen.
alter table public.contracts_or_orders drop constraint if exists contracts_or_orders_doc_type_check;
alter table public.contracts_or_orders add constraint contracts_or_orders_doc_type_check check (doc_type in ('kontrak','spk','surat_pesanan','bukti_pembelian','sk_swakelola'));
alter table public.contracts_or_orders add column if not exists description text check (description is null or char_length(description) <= 300);
