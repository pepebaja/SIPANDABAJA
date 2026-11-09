-- Penyedia pelaksana pekerjaan pada transaksi realisasi + penambahan penyedia baru yang aman dari Input Realisasi.
-- Master penyedia (public.providers) dan penyedia pada kontrak paket (contracts_or_orders.provider_id) sudah ada; kolom ini
-- menautkan setiap transaksi ke penyedianya agar laporan dapat menghitung paket per penyedia dalam satu tahun anggaran.
-- Aman dijalankan ulang. Jalankan setelah 20260118.
alter table public.transactions add column if not exists provider_id uuid references public.providers(id);
create index if not exists transactions_provider_idx on public.transactions (provider_id) where provider_id is not null;

-- Mengembalikan id penyedia dengan nama yang sama (tanpa membedakan huruf besar/kecil, spasi, dan tanda baca: "PT. Maju Jaya" = "pt maju jaya"),
-- atau membuat penyedia baru. Boleh dipakai Super Admin, Admin OPD, dan PPBJ (master penyedia sendiri hanya dapat diubah admin).
create or replace function public.ensure_provider(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); k text; pid uuid; act boolean;
begin
  if not public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]) then raise exception 'Anda tidak berwenang menambah penyedia.' using errcode = '42501'; end if;
  if char_length(n) < 3 or char_length(n) > 200 then raise exception 'Nama penyedia harus 3 sampai 200 karakter.' using errcode = 'P0001'; end if;
  k := regexp_replace(lower(n), '[^a-z0-9]', '', 'g');
  if k = '' then raise exception 'Nama penyedia harus memuat huruf atau angka.' using errcode = 'P0001'; end if;
  select id, is_active into pid, act from public.providers
   where organization_id = public.current_org_id() and regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = k order by is_active desc, created_at limit 1;
  if pid is null then insert into public.providers (name) values (n) returning id into pid;
  elsif not act then raise exception 'Penyedia "%" sudah ada tetapi nonaktif. Aktifkan di Master data > Penyedia.', n using errcode = 'P0001'; end if;
  return pid;
end $$;
revoke all on function public.ensure_provider(text) from public, anon;
grant execute on function public.ensure_provider(text) to authenticated;
