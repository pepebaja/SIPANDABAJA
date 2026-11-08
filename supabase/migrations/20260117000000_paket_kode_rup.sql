-- Penyederhanaan Proses pengadaan: kode paket = kode RUP; tanggal proses terisi otomatis dari perubahan status.
-- Aman dijalankan ulang. Jalankan setelah 20260116.

-- 1) Kode paket selalu sama dengan kode RUP bila paket ditautkan ke RUP (disinkronkan otomatis saat paket dibuat/diubah tautannya).
create or replace function public.sync_package_code() returns trigger language plpgsql set search_path = '' as $$
declare c text;
begin
  if new.rup_package_id is not null then
    select rup_code into c from public.rup_packages where id = new.rup_package_id;
    if c is not null and (tg_op = 'INSERT' or new.rup_package_id is distinct from old.rup_package_id or new.internal_code is distinct from old.internal_code) then
      if not exists (select 1 from public.procurement_packages p where p.budget_version_id = new.budget_version_id and p.internal_code = c and p.id <> new.id) then new.internal_code := c; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_package_code on public.procurement_packages;
create trigger trg_sync_package_code before insert or update of rup_package_id, internal_code on public.procurement_packages for each row execute function public.sync_package_code();

-- Penyesuaian data yang sudah ada: paket berkode RUP memakai kode RUP sebagai kodenya (dilewati bila bentrok dengan paket lain).
update public.procurement_packages p set internal_code = r.rup_code
from public.rup_packages r
where r.id = p.rup_package_id and p.internal_code <> r.rup_code
  and not exists (select 1 from public.procurement_packages q where q.budget_version_id = p.budget_version_id and q.internal_code = r.rup_code and q.id <> p.id);

-- 2) Tanggal proses terisi otomatis saat status berubah (tidak perlu diisi manual):
--    mulai proses = pertama kali masuk kelompok 'diproses'; selesai proses & serah terima = saat status SERAH_TERIMA/SELESAI.
create or replace function public.auto_package_dates() returns trigger language plpgsql set search_path = '' as $$
declare g text;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select stage_group into g from public.package_statuses where organization_id = new.organization_id and code = new.status;
    if g = 'diproses' and new.process_start is null then new.process_start := current_date; end if;
    if new.status in ('SERAH_TERIMA','SELESAI') then
      if new.handover_date is null then new.handover_date := current_date; end if;
      if new.process_end is null then new.process_end := current_date; end if;
      if new.process_start is null then new.process_start := least(coalesce(new.assigned_date, current_date), current_date); end if;
    end if;
    if tg_op = 'INSERT' and new.assigned_date is null then new.assigned_date := current_date; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_auto_package_dates on public.procurement_packages;
create trigger trg_auto_package_dates before insert or update of status on public.procurement_packages for each row execute function public.auto_package_dates();
