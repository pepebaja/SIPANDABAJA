-- Hapus paket pengadaan dari daftar Paket pengadaan (tombol Hapus), dengan pengaman data.
-- Paket TIDAK dapat dihapus bila sudah punya transaksi realisasi atau kontrak/SP: ubah statusnya menjadi tidak aktif/batal.
-- Riwayat status paket ikut dihapus; jejak penghapusan tetap ada di Log audit. Aman dijalankan ulang. Jalankan setelah 20260120.
create or replace function public.delete_procurement_package(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pk public.procurement_packages; n int;
begin
  if not public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]) then raise exception 'Anda tidak berwenang menghapus paket.' using errcode = '42501'; end if;
  select * into pk from public.procurement_packages where id = p_id and organization_id = public.current_org_id();
  if not found then raise exception 'Paket tidak ditemukan atau sudah dihapus.' using errcode = 'P0001'; end if;
  select count(*) into n from public.transactions where procurement_package_id = p_id;
  if n > 0 then raise exception 'Paket % sudah memiliki % transaksi realisasi sehingga tidak dapat dihapus. Ubah statusnya menjadi tidak aktif/batal.', pk.internal_code, n using errcode = 'P0001'; end if;
  select count(*) into n from public.contracts_or_orders where procurement_package_id = p_id;
  if n > 0 then raise exception 'Paket % sudah memiliki % kontrak/SP sehingga tidak dapat dihapus. Ubah statusnya menjadi tidak aktif/batal.', pk.internal_code, n using errcode = 'P0001'; end if;
  delete from public.procurement_events where procurement_package_id = p_id;
  delete from public.procurement_packages where id = p_id;
end $$;
revoke all on function public.delete_procurement_package(uuid) from public, anon;
grant execute on function public.delete_procurement_package(uuid) to authenticated;
