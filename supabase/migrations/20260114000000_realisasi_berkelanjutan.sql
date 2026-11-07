-- Realisasi berkelanjutan antartahapan + tanpa verifikasi + ubah/hapus transaksi.
-- Aman dijalankan ulang. Jalankan di Supabase > SQL Editor setelah migrasi 20260113.
--
-- 1) Realisasi KUMULATIF: pada tahapan S, realisasi sebuah rekening = seluruh transaksi tahapan S dan tahapan-tahapan SEBELUMNYA
--    (tahun yang sama) yang rekeningnya sepadan: subkegiatan + rekening + sumber dana sama (uraian dipakai bila ada beberapa yang sama).
--    Murni -> Pergeseran -> Perubahan. Transaksi tahapan sebelumnya yang rekeningnya sudah tidak ada pada tahapan S dilaporkan oleh realization_unmapped.

create or replace function public.entry_carry_map(p_version uuid)
returns table (src_entry_id uuid, dst_entry_id uuid) language sql stable security invoker set search_path = '' as $$
  with cur as (select v.id, v.budget_year_id, s.sort_order from public.budget_versions v join public.budget_stages s on s.id = v.budget_stage_id where v.id = p_version),
  src as (select e.id, e.subactivity_id, e.account_id, e.funding_source_id, e.description
            from public.budget_entries e join public.budget_versions v on v.id = e.budget_version_id join public.budget_stages s on s.id = v.budget_stage_id, cur
           where v.budget_year_id = cur.budget_year_id and v.id <> p_version and s.sort_order < cur.sort_order),
  cand as (select s.id as src_id, d.id as dst_id, (d.description = s.description) as same_desc,
                  count(*) over (partition by s.id) as n, count(*) filter (where d.description = s.description) over (partition by s.id) as n_same
             from src s join public.budget_entries d on d.budget_version_id = p_version and d.subactivity_id = s.subactivity_id
              and d.account_id = s.account_id and d.funding_source_id is not distinct from s.funding_source_id)
  select e.id, e.id from public.budget_entries e where e.budget_version_id = p_version
  union all select src_id, dst_id from cand where n = 1 or (n_same = 1 and same_desc) $$;
revoke all on function public.entry_carry_map(uuid) from public, anon;
grant execute on function public.entry_carry_map(uuid) to authenticated;

-- Realisasi per rekening (kumulatif). Kolom verified/unverified dipertahankan agar aplikasi lama tetap jalan: semua transaksi dihitung sebagai realisasi.
create or replace function public.realization_by_entry(p_version uuid)
returns table (entry_id uuid, pagu numeric, verified numeric, unverified numeric, tx_count bigint, unverified_count bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.amount, coalesce(sum(t.amount), 0), 0::numeric, count(t.id), 0::bigint
  from public.budget_entries e
  left join public.entry_carry_map(p_version) m on m.dst_entry_id = e.id
  left join public.transactions t on t.budget_entry_id = m.src_entry_id
  where e.budget_version_id = p_version group by e.id, e.amount $$;

create or replace function public.realization_totals(p_version uuid)
returns table (pagu numeric, verified numeric, unverified numeric, tx_count bigint, unverified_count bigint, over_pagu_count bigint)
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(r.pagu), 0), coalesce(sum(r.verified), 0), 0::numeric, coalesce(sum(r.tx_count), 0)::bigint, 0::bigint,
         count(*) filter (where r.verified > r.pagu)
  from public.realization_by_entry(p_version) r $$;

-- Transaksi tahapan sebelumnya yang rekeningnya tidak punya padanan pada tahapan p_version.
create or replace function public.realization_unmapped(p_version uuid)
returns table (tx_count bigint, amount numeric) language sql stable security invoker set search_path = '' as $$
  with cur as (select v.budget_year_id, s.sort_order from public.budget_versions v join public.budget_stages s on s.id = v.budget_stage_id where v.id = p_version)
  select count(t.id), coalesce(sum(t.amount), 0)
  from public.transactions t join public.budget_versions v on v.id = t.budget_version_id join public.budget_stages s on s.id = v.budget_stage_id, cur
  where v.budget_year_id = cur.budget_year_id and s.sort_order < cur.sort_order
    and not exists (select 1 from public.entry_carry_map(p_version) m where m.src_entry_id = t.budget_entry_id) $$;
revoke all on function public.realization_unmapped(uuid) from public, anon;
grant execute on function public.realization_unmapped(uuid) to authenticated;

-- Realisasi per rekening per triwulan (kumulatif), dipakai pembanding anggaran kas.
create or replace function public.realization_by_entry_quarter(p_version uuid)
returns table (entry_id uuid, quarter int, amount numeric) language sql stable security invoker set search_path = '' as $$
  select m.dst_entry_id, public.tx_quarter(t.transaction_date, y.year), sum(t.amount)
  from public.entry_carry_map(p_version) m join public.transactions t on t.budget_entry_id = m.src_entry_id
  join public.budget_versions v on v.id = t.budget_version_id join public.budget_years y on y.id = v.budget_year_id group by 1, 2 $$;

-- 2) Batas pagu & kas pada trigger memakai realisasi KUMULATIF rekening (transaksi tahapan sebelumnya ikut dihitung).
create or replace function public.check_transaction_limits() returns trigger language plpgsql as $$
declare e public.budget_entries; r public.rup_packages; yr int; q int; plan uuid; k int;
  cash numeric; real_k numeric; allowed numeric; real_total numeric; rup_real numeric; srcs uuid[];
begin
  if tg_op = 'INSERT' and new.rup_package_id is null and new.procurement_package_id is not null then
    select rup_package_id into new.rup_package_id from public.procurement_packages where id = new.procurement_package_id;
  end if;
  if tg_op = 'UPDATE' and new.amount = old.amount and new.budget_entry_id = old.budget_entry_id and new.transaction_date = old.transaction_date
     and new.rup_package_id is not distinct from old.rup_package_id and new.budget_version_id = old.budget_version_id then
    return new;
  end if;
  select * into e from public.budget_entries where id = new.budget_entry_id for update;
  select y.year into yr from public.budget_versions v join public.budget_years y on y.id = v.budget_year_id where v.id = e.budget_version_id;
  if tg_op = 'INSERT' or new.transaction_date <> old.transaction_date then
    if extract(year from new.transaction_date)::int <> yr then raise exception 'Tanggal transaksi harus berada pada tahun anggaran %', yr; end if;
  end if;
  q := public.tx_quarter(new.transaction_date, yr);
  select array_agg(m.src_entry_id) into srcs from public.entry_carry_map(e.budget_version_id) m where m.dst_entry_id = e.id;

  select coalesce(sum(amount), 0) into real_total from public.transactions where budget_entry_id = any (srcs) and id <> new.id;
  if real_total + new.amount < 0 then
    raise exception 'Koreksi melebihi total realisasi rekening (realisasi tercatat %)', public.fmt_rp(real_total);
  end if;
  if new.amount > 0 then
    if real_total + new.amount > e.amount then
      raise exception 'Melebihi pagu rekening. Sisa pagu rekening: %', public.fmt_rp(greatest(e.amount - real_total, 0));
    end if;
    select id into plan from public.cash_plans where budget_version_id = e.budget_version_id order by created_at limit 1;
    allowed := null;
    for k in q..4 loop
      select coalesce(sum(planned_amount), 0) into cash from public.cash_plan_items where cash_plan_id = plan and budget_entry_id = new.budget_entry_id and period_quarter <= k;
      select coalesce(sum(amount), 0) into real_k from public.transactions where budget_entry_id = any (srcs) and id <> new.id and public.tx_quarter(transaction_date, yr) <= k;
      if allowed is null or cash - real_k < allowed then allowed := cash - real_k; end if;
    end loop;
    if new.amount > allowed then
      raise exception 'Melebihi sisa anggaran kas kumulatif pada triwulan %. Maksimal yang dapat dibelanjakan: %', q, public.fmt_rp(greatest(allowed, 0));
    end if;
  end if;
  if new.rup_package_id is not null then
    select * into r from public.rup_packages where id = new.rup_package_id for update;
    if r.budget_version_id <> new.budget_version_id then raise exception 'Paket RUP tidak berada pada versi anggaran ini'; end if;
    select coalesce(sum(amount), 0) into rup_real from public.transactions where rup_package_id = r.id and id <> new.id;
    if rup_real + new.amount < 0 then raise exception 'Koreksi melebihi total realisasi paket RUP'; end if;
    if new.amount > 0 and rup_real + new.amount > r.pagu then
      raise exception 'Melebihi pagu paket RUP %. Sisa pagu RUP: %', r.rup_code, public.fmt_rp(greatest(r.pagu - rup_real, 0));
    end if;
  end if;
  return new;
end $$;

-- 3) Tanpa verifikasi: semua transaksi langsung berlaku; dapat diubah dan dihapus oleh Super Admin, Admin OPD, dan PPBJ.
alter table public.transactions alter column verification_status set default 'verified';
alter table public.transactions disable trigger trg_guard;
update public.transactions set verification_status = 'verified' where verification_status <> 'verified';
alter table public.transactions enable trigger trg_guard;

create or replace function public.guard_transaction() returns trigger language plpgsql as $$
declare v uuid; pk uuid;
begin
  if tg_op = 'INSERT' or new.budget_entry_id <> old.budget_entry_id then
    select budget_version_id into v from public.budget_entries where id = new.budget_entry_id;
    if v is distinct from new.budget_version_id then raise exception 'Rekening tidak berada pada versi anggaran ini'; end if;
  end if;
  new.verification_status := 'verified';
  if new.amount < 0 and new.kind = 'pembayaran' then new.kind := 'koreksi'; end if;
  if new.amount > 0 and new.kind <> 'pembayaran' then new.kind := 'pembayaran'; end if;
  if new.rup_package_id is not null and (tg_op = 'INSERT' or new.rup_package_id is distinct from old.rup_package_id) then
    select case when count(*) = 1 then (array_agg(p.id))[1] end into pk from public.procurement_packages p where p.rup_package_id = new.rup_package_id;
    if pk is not null then new.procurement_package_id := pk; elsif tg_op = 'UPDATE' then new.procurement_package_id := null; end if;
  end if;
  return new;
end $$;

grant delete on public.transactions to authenticated;
drop policy if exists tx_del on public.transactions;
create policy tx_del on public.transactions for delete to authenticated
  using (organization_id = (select public.current_org_id()) and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));

-- 4) Nomenklatur anggaran dapat dikelola langsung di aplikasi (menu Kelola anggaran): hapus rekening anggaran yang belum dipakai.
grant delete on public.budget_entries to authenticated;
drop policy if exists budget_entries_del on public.budget_entries;
create policy budget_entries_del on public.budget_entries for delete to authenticated
  using (organization_id = (select public.current_org_id()) and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));
