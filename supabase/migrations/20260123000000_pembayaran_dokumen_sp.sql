-- Pembayaran (transaksi) ditautkan ke dokumen kontrak/SP tertentu, sehingga tiap SP punya nilai, terbayar, dan sisa sendiri.
-- Paket berulang tidak dihitung "terlambat" (kartu tindak lanjut Dashboard). Tidak mengubah/menghapus data yang ada. Aman dijalankan ulang. Jalankan setelah 20260122.

alter table public.transactions add column if not exists contract_id uuid references public.contracts_or_orders(id) on delete set null;
create index if not exists transactions_contract_idx on public.transactions (contract_id) where contract_id is not null;

-- Garis keturunan dokumen: salinan kontrak yang dibawa ke tahapan berikutnya memakai lineage_id yang sama dengan dokumen aslinya,
-- agar pembayaran pada tahapan sebelumnya tetap dihitung sebagai terbayar pada salinannya.
alter table public.contracts_or_orders add column if not exists lineage_id uuid;
update public.contracts_or_orders set lineage_id = id where lineage_id is null;
create index if not exists contracts_lineage_idx on public.contracts_or_orders (lineage_id);
create or replace function public.contract_lineage_default() returns trigger language plpgsql as $$ begin new.lineage_id := coalesce(new.lineage_id, new.id); return new; end $$;
drop trigger if exists trg_contract_lineage on public.contracts_or_orders;
create trigger trg_contract_lineage before insert on public.contracts_or_orders for each row execute function public.contract_lineage_default();

-- Dashboard: paket berulang tidak dihitung terlambat (tenggat tidak berlaku untuk paket yang dibelanjakan berkali-kali sepanjang tahun).
create or replace function public.dashboard_summary(p_version uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  with p as (select k.*, s.stage_group, s.needs_followup from public.procurement_packages k
             join public.package_statuses s on s.organization_id = k.organization_id and s.code = k.status where k.budget_version_id = p_version),
  cur as (select v.budget_year_id, st.sort_order from public.budget_versions v join public.budget_stages st on st.id = v.budget_stage_id where v.id = p_version)
  select jsonb_build_object(
    'rup_count', (select count(*) from public.rup_packages where budget_version_id = p_version),
    'pkg_processed', (select count(*) from p where stage_group in ('diproses','selesai')),
    'pkg_unprocessed', (select count(*) from p where stage_group = 'belum_diproses'),
    'pkg_followup', (select count(*) from p where stage_group <> 'tidak_aktif' and (needs_followup or rup_package_id is null or (not is_recurring and due_date < current_date and stage_group <> 'selesai'))),
    'result_total', (select coalesce(sum(c.selection_result_value), 0) from public.contracts_or_orders c join p on p.id = c.procurement_package_id),
    'contract_total', (select coalesce(sum(c.contract_value), 0) from public.contracts_or_orders c join p on p.id = c.procurement_package_id),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(m.name, 'Belum ditentukan'), 'count', x.n) order by x.n desc), '[]'::jsonb)
                  from (select method_id, count(*) n from p where stage_group <> 'tidak_aktif' group by method_id) x left join public.procurement_methods m on m.id = x.method_id),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', mo, 'verified', v) order by mo), '[]'::jsonb)
                from (select extract(month from t.payment_date)::int mo, sum(t.amount) v
                      from public.transactions t join public.budget_versions tv on tv.id = t.budget_version_id join public.budget_stages ts on ts.id = tv.budget_stage_id, cur
                      where t.payment_date is not null and tv.budget_year_id = cur.budget_year_id and (tv.id = p_version or ts.sort_order < cur.sort_order)
                        and extract(year from t.payment_date) = (select y.year from public.budget_years y where y.id = cur.budget_year_id) group by 1) s)) $$;
