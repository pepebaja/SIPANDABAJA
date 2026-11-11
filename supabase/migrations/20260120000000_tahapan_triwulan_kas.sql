-- Tahapan anggaran ditentukan tanggal penetapan tahapan; triwulan & anggaran kas mengikuti tanggal acuan yang sama.
-- Tidak mengubah/menyalin/menghapus data anggaran kas (cash_plans, cash_plan_items) yang sudah tersimpan: hanya fungsi hitung & penjaga.
--
-- Aturan:
--  1. Tanggal acuan = Tanggal SPM/SP2D bila ada, jika belum ada = tanggal transaksi.
--  2. Tahapan = tahapan dengan tanggal penetapan (mulai berlaku) terakhir yang <= tanggal acuan (mis. Murni 2 Jan, Pergeseran I 16 Mar,
--     Perubahan 27 Okt). Transaksi 14 Mar -> Murni; transaksi 5 Okt -> Pergeseran.
--  3. Triwulan dari tanggal acuan: TW I Jan-Mar, TW II Apr-Jun, TW III Jul-Sep, TW IV Okt-Des.
--  4. Pembayaran dibatasi anggaran kas TAHAPAN transaksi itu (kumulatif sampai triwulannya). Contoh: SPM 5 Okt 2026 = tahapan Pergeseran,
--     triwulan IV, dibatasi anggaran kas Pergeseran sampai TW IV; tidak terkunci pada tahapan yang sedang dipilih di layar.
-- Aman dijalankan ulang. Jalankan setelah 20260119.

create or replace function public.tx_ref_date(p_payment date, p_tx date) returns date language sql immutable as $$ select coalesce(p_payment, p_tx) $$;

create or replace function public.realization_by_entry_quarter(p_version uuid)
returns table (entry_id uuid, quarter int, amount numeric) language sql stable security invoker set search_path = '' as $$
  select m.dst_entry_id, public.tx_quarter(public.tx_ref_date(t.payment_date, t.transaction_date), y.year), sum(t.amount)
  from public.entry_carry_map(p_version) m join public.transactions t on t.budget_entry_id = m.src_entry_id
  join public.budget_versions v on v.id = t.budget_version_id join public.budget_years y on y.id = v.budget_year_id group by 1, 2 $$;

create or replace function public.check_transaction_limits() returns trigger language plpgsql as $$
declare e public.budget_entries; r public.rup_packages; yr int; q int; plan uuid; k int; rd date; stg text;
  cash numeric; real_k numeric; allowed numeric; real_total numeric; rup_real numeric; srcs uuid[]; has_cash boolean;
begin
  if tg_op = 'INSERT' and new.rup_package_id is null and new.procurement_package_id is not null then
    select rup_package_id into new.rup_package_id from public.procurement_packages where id = new.procurement_package_id;
  end if;
  if tg_op = 'UPDATE' and new.amount = old.amount and new.budget_entry_id = old.budget_entry_id and new.transaction_date = old.transaction_date
     and new.payment_date is not distinct from old.payment_date
     and new.rup_package_id is not distinct from old.rup_package_id and new.budget_version_id = old.budget_version_id then
    return new;
  end if;
  select * into e from public.budget_entries where id = new.budget_entry_id for update;
  select y.year, s.name into yr, stg from public.budget_versions v join public.budget_years y on y.id = v.budget_year_id join public.budget_stages s on s.id = v.budget_stage_id where v.id = e.budget_version_id;
  rd := public.tx_ref_date(new.payment_date, new.transaction_date);
  if tg_op = 'INSERT' or new.transaction_date <> old.transaction_date or new.payment_date is distinct from old.payment_date then
    if extract(year from new.transaction_date)::int <> yr or extract(year from rd)::int <> yr then raise exception 'Tanggal harus berada pada tahun anggaran %', yr; end if;
  end if;
  q := public.tx_quarter(rd, yr);
  select array_agg(m.src_entry_id) into srcs from public.entry_carry_map(e.budget_version_id) m where m.dst_entry_id = e.id;

  select coalesce(sum(amount), 0) into real_total from public.transactions where budget_entry_id = any (srcs) and id <> new.id;
  if real_total + new.amount < 0 then
    raise exception 'Koreksi melebihi total realisasi rekening (realisasi tercatat %)', public.fmt_rp(real_total);
  end if;
  if new.amount > 0 then
    if real_total + new.amount > e.amount then
      raise exception 'Melebihi pagu rekening. Sisa pagu rekening: %', public.fmt_rp(greatest(e.amount - real_total, 0));
    end if;
    -- Anggaran kas = milik tahapan transaksi ini (tahapan menurut tanggal acuan), bukan tahapan yang sedang dipilih di layar.
    select id into plan from public.cash_plans where budget_version_id = e.budget_version_id order by created_at limit 1;
    select exists (select 1 from public.cash_plan_items where cash_plan_id = plan) into has_cash;
    if plan is null or not has_cash then
      raise exception 'Anggaran kas tahapan % belum disusun. Susun di menu Anggaran kas (pilih tahapan %) sebelum mencatat pembayaran bertanggal % (triwulan %).', stg, stg, to_char(rd, 'DD-MM-YYYY'), q;
    end if;
    allowed := null;
    for k in q..4 loop
      select coalesce(sum(planned_amount), 0) into cash from public.cash_plan_items where cash_plan_id = plan and budget_entry_id = new.budget_entry_id and period_quarter <= k;
      select coalesce(sum(amount), 0) into real_k from public.transactions
        where budget_entry_id = any (srcs) and id <> new.id and public.tx_quarter(public.tx_ref_date(payment_date, transaction_date), yr) <= k;
      if allowed is null or cash - real_k < allowed then allowed := cash - real_k; end if;
    end loop;
    if new.amount > allowed then
      raise exception 'Melebihi sisa anggaran kas tahapan % kumulatif pada triwulan %. Maksimal yang dapat dibelanjakan: %', stg, q, public.fmt_rp(greatest(allowed, 0));
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
