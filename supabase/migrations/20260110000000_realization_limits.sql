-- Input Realisasi terpadu: batas realisasi berdasarkan anggaran kas kumulatif, pagu rekening, dan pagu paket RUP.
-- Aman dijalankan ulang.

-- 1) Transaksi dapat ditautkan langsung ke paket RUP. Satu kode RUP boleh dipakai berkali-kali (proses pengadaan berulang).
alter table public.transactions add column if not exists rup_package_id uuid references public.rup_packages(id) on delete set null;
create index if not exists transactions_rup_idx on public.transactions (rup_package_id);
-- Data lama: transaksi yang bertaut ke paket pengadaan mewarisi RUP paket tersebut.
update public.transactions t set rup_package_id = p.rup_package_id
  from public.procurement_packages p where t.procurement_package_id = p.id and t.rup_package_id is null and p.rup_package_id is not null;

-- 2) Triwulan dari tanggal transaksi. Tanggal di luar tahun anggaran dibulatkan ke TW I (sebelum) atau TW IV (sesudah) untuk data lama.
create or replace function public.tx_quarter(p_date date, p_year int) returns int language sql immutable as $$
  select case when extract(year from p_date) < p_year then 1 when extract(year from p_date) > p_year then 4
              else extract(quarter from p_date)::int end $$;
create or replace function public.fmt_rp(n numeric) returns text language sql immutable as $$
  select 'Rp ' || translate(to_char(n, 'FM999,999,999,999,990.00'), ',.', '.,') $$;

-- 3) Penjaga batas. Dihitung dari SEMUA transaksi (terverifikasi maupun belum) agar dana yang sama tidak terpakai dua kali.
--    Aturan kas kumulatif: sisa kas triwulan lalu terbawa ke triwulan berikutnya; kas triwulan depan tidak dapat
--    dipakai untuk belanja triwulan sebelumnya. Untuk transaksi di triwulan q, setiap triwulan k >= q harus memenuhi:
--        kas kumulatif TW I..k  >=  realisasi (tanggal TW I..k) termasuk transaksi ini.
--    Koreksi/pembatalan (nilai negatif) selalu diperbolehkan selama tidak membuat total realisasi rekening menjadi negatif.
create or replace function public.check_transaction_limits() returns trigger language plpgsql as $$
declare e public.budget_entries; r public.rup_packages; yr int; q int; plan uuid; k int;
  cash numeric; real_k numeric; allowed numeric; real_total numeric; rup_real numeric;
begin
  if tg_op = 'INSERT' and new.rup_package_id is null and new.procurement_package_id is not null then
    select rup_package_id into new.rup_package_id from public.procurement_packages where id = new.procurement_package_id;
  end if;
  if tg_op = 'UPDATE' and new.amount = old.amount and new.budget_entry_id = old.budget_entry_id and new.transaction_date = old.transaction_date
     and new.rup_package_id is not distinct from old.rup_package_id and new.budget_version_id = old.budget_version_id then
    return new;                                   -- mis. hanya verifikasi/catatan: batas tidak berubah
  end if;

  select * into e from public.budget_entries where id = new.budget_entry_id for update;   -- serialisasi per rekening
  select y.year into yr from public.budget_versions v join public.budget_years y on y.id = v.budget_year_id where v.id = e.budget_version_id;
  if tg_op = 'INSERT' or new.transaction_date <> old.transaction_date then
    if extract(year from new.transaction_date)::int <> yr then raise exception 'Tanggal transaksi harus berada pada tahun anggaran %', yr; end if;
  end if;
  q := public.tx_quarter(new.transaction_date, yr);

  select coalesce(sum(amount), 0) into real_total from public.transactions where budget_entry_id = new.budget_entry_id and id <> new.id;
  if real_total + new.amount < 0 then
    raise exception 'Koreksi/pembatalan melebihi total realisasi rekening (realisasi tercatat %)', public.fmt_rp(real_total);
  end if;

  if new.amount > 0 then
    if real_total + new.amount > e.amount then
      raise exception 'Melebihi pagu rekening. Sisa pagu rekening: %', public.fmt_rp(greatest(e.amount - real_total, 0));
    end if;
    select id into plan from public.cash_plans where budget_version_id = e.budget_version_id order by created_at limit 1;
    allowed := null;
    for k in q..4 loop
      select coalesce(sum(planned_amount), 0) into cash from public.cash_plan_items
        where cash_plan_id = plan and budget_entry_id = new.budget_entry_id and period_quarter <= k;
      select coalesce(sum(amount), 0) into real_k from public.transactions
        where budget_entry_id = new.budget_entry_id and id <> new.id and public.tx_quarter(transaction_date, yr) <= k;
      if allowed is null or cash - real_k < allowed then allowed := cash - real_k; end if;
    end loop;
    if new.amount > allowed then
      raise exception 'Melebihi sisa anggaran kas kumulatif pada triwulan %. Maksimal yang dapat dibelanjakan: % (kas triwulan berikutnya tidak dapat dipakai lebih awal)',
        q, public.fmt_rp(greatest(allowed, 0));
    end if;
  end if;

  if new.rup_package_id is not null then
    select * into r from public.rup_packages where id = new.rup_package_id for update;
    if r.budget_version_id <> new.budget_version_id then raise exception 'Paket RUP tidak berada pada versi anggaran ini'; end if;
    select coalesce(sum(amount), 0) into rup_real from public.transactions where rup_package_id = r.id and id <> new.id;
    if rup_real + new.amount < 0 then raise exception 'Koreksi/pembatalan melebihi total realisasi paket RUP'; end if;
    if new.amount > 0 and rup_real + new.amount > r.pagu then
      raise exception 'Melebihi pagu paket RUP %. Sisa pagu RUP: %', r.rup_code, public.fmt_rp(greatest(r.pagu - rup_real, 0));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_limits on public.transactions;
create trigger trg_limits before insert or update on public.transactions for each row execute function public.check_transaction_limits();

-- 4) Agregat untuk layar Input Realisasi (security invoker: RLS tetap berlaku).
create or replace function public.realization_by_entry_quarter(p_version uuid)
returns table (entry_id uuid, quarter int, amount numeric) language sql stable security invoker set search_path = '' as $$
  select t.budget_entry_id, public.tx_quarter(t.transaction_date, y.year), sum(t.amount)
  from public.transactions t join public.budget_versions v on v.id = t.budget_version_id join public.budget_years y on y.id = v.budget_year_id
  where t.budget_version_id = p_version group by 1, 2 $$;
create or replace function public.realization_by_rup(p_version uuid)
returns table (rup_id uuid, amount numeric, tx_count bigint) language sql stable security invoker set search_path = '' as $$
  select t.rup_package_id, sum(t.amount), count(*) from public.transactions t
  where t.budget_version_id = p_version and t.rup_package_id is not null group by 1 $$;
revoke all on function public.realization_by_entry_quarter(uuid), public.realization_by_rup(uuid) from public, anon;
grant execute on function public.realization_by_entry_quarter(uuid), public.realization_by_rup(uuid) to authenticated;
