-- Kode RUP yang dipakai pada transaksi harus ada pada arsip RUP tahapan transaksi itu. Bila kode baru ada di tahapan lain pada tahun anggaran yang sama
-- (mis. RUP baru diumumkan/tersinkron di Perubahan, sedangkan transaksinya bertanggal tahapan Pergeseran), baris RUP disalin ke tahapan transaksi
-- (nama, jenis, rencana metode, pagu, status verifikasi) sehingga transaksi dapat ditautkan. Tidak mengubah baris RUP yang sudah ada.
-- Jejak penyalinan ada di Log audit. Aman dijalankan ulang. Jalankan setelah 20260123.
create or replace function public.ensure_rup_in_version(p_code text, p_version uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare code text := regexp_replace(btrim(coalesce(p_code, '')), '\.0+$', ''); tv public.budget_versions; rid uuid; src public.rup_packages;
begin
  if not public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]) then raise exception 'Anda tidak berwenang menautkan kode RUP.' using errcode = '42501'; end if;
  if code = '' then raise exception 'Kode RUP kosong.' using errcode = 'P0001'; end if;
  select * into tv from public.budget_versions where id = p_version and organization_id = public.current_org_id();
  if not found then raise exception 'Tahapan anggaran tidak ditemukan.' using errcode = 'P0001'; end if;
  select id into rid from public.rup_packages where budget_version_id = p_version and rup_code = code;
  if rid is not null then return rid; end if;
  -- sumber: versi lain pada tahun anggaran yang sama; terdekat menurut urutan tahapan, lalu versi terbaru
  select r.* into src from public.rup_packages r join public.budget_versions v on v.id = r.budget_version_id join public.budget_stages s on s.id = v.budget_stage_id
   join public.budget_stages ts on ts.id = tv.budget_stage_id
   where r.rup_code = code and v.budget_year_id = tv.budget_year_id and r.organization_id = public.current_org_id()
   order by abs(s.sort_order - ts.sort_order), v.version_no desc limit 1;
  if not found then raise exception 'Kode RUP % tidak ditemukan pada RUP tahapan mana pun di tahun anggaran ini. Periksa kodenya atau sinkronkan/impor RUP di menu Paket RUP.', code using errcode = 'P0001'; end if;
  insert into public.rup_packages (budget_version_id, rup_code, name, procurement_type, planned_method_id, pagu, verification_status)
  values (p_version, code, src.name, src.procurement_type, src.planned_method_id, src.pagu, src.verification_status) returning id into rid;
  return rid;
end $$;
revoke all on function public.ensure_rup_in_version(text, uuid) from public, anon;
grant execute on function public.ensure_rup_in_version(text, uuid) to authenticated;
