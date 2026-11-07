-- Pengakuan realisasi: transaksi BARU diakui sebagai realisasi setelah Tanggal SPM/SP2D terisi.
-- Transaksi tanpa tanggal SPM/SP2D tetap dicatat (dapat diinput manual/unggah) sebagai "dalam proses": tidak masuk realisasi, sisa pagu,
-- persentase, dan grafik bulanan, tetapi tetap menahan pagu (batas pagu & kas tetap ditegakkan) dan ditampilkan terpisah.
-- Aman dijalankan ulang. Jalankan setelah 20260114.

create or replace function public.realization_by_entry(p_version uuid)
returns table (entry_id uuid, pagu numeric, verified numeric, unverified numeric, tx_count bigint, unverified_count bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.amount,
    coalesce(sum(t.amount) filter (where t.payment_date is not null), 0),   -- diakui (sudah ada tanggal SPM/SP2D)
    coalesce(sum(t.amount) filter (where t.payment_date is null), 0),       -- dalam proses (belum SPM/SP2D)
    count(t.id), count(t.id) filter (where t.payment_date is null)
  from public.budget_entries e
  left join public.entry_carry_map(p_version) m on m.dst_entry_id = e.id
  left join public.transactions t on t.budget_entry_id = m.src_entry_id
  where e.budget_version_id = p_version group by e.id, e.amount $$;

create or replace function public.realization_totals(p_version uuid)
returns table (pagu numeric, verified numeric, unverified numeric, tx_count bigint, unverified_count bigint, over_pagu_count bigint)
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(r.pagu), 0), coalesce(sum(r.verified), 0), coalesce(sum(r.unverified), 0), coalesce(sum(r.tx_count), 0)::bigint,
         coalesce(sum(r.unverified_count), 0)::bigint, count(*) filter (where r.verified + r.unverified > r.pagu)
  from public.realization_by_entry(p_version) r $$;

-- Grafik bulanan beranda: realisasi diakui, per bulan Tanggal SPM/SP2D, kumulatif sampai tahapan terpilih.
create or replace function public.dashboard_summary(p_version uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  with p as (select k.*, s.stage_group, s.needs_followup from public.procurement_packages k
             join public.package_statuses s on s.organization_id = k.organization_id and s.code = k.status where k.budget_version_id = p_version),
  cur as (select v.budget_year_id, st.sort_order from public.budget_versions v join public.budget_stages st on st.id = v.budget_stage_id where v.id = p_version)
  select jsonb_build_object(
    'rup_count', (select count(*) from public.rup_packages where budget_version_id = p_version),
    'pkg_processed', (select count(*) from p where stage_group in ('diproses','selesai')),
    'pkg_unprocessed', (select count(*) from p where stage_group = 'belum_diproses'),
    'pkg_followup', (select count(*) from p where stage_group <> 'tidak_aktif' and (needs_followup or rup_package_id is null or (due_date < current_date and stage_group <> 'selesai'))),
    'result_total', (select coalesce(sum(c.selection_result_value), 0) from public.contracts_or_orders c join p on p.id = c.procurement_package_id),
    'contract_total', (select coalesce(sum(c.contract_value), 0) from public.contracts_or_orders c join p on p.id = c.procurement_package_id),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(m.name, 'Belum ditentukan'), 'count', x.n) order by x.n desc), '[]'::jsonb)
                  from (select method_id, count(*) n from p where stage_group <> 'tidak_aktif' group by method_id) x left join public.procurement_methods m on m.id = x.method_id),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', mo, 'verified', v) order by mo), '[]'::jsonb)
                from (select extract(month from t.payment_date)::int mo, sum(t.amount) v
                      from public.transactions t join public.budget_versions tv on tv.id = t.budget_version_id join public.budget_stages ts on ts.id = tv.budget_stage_id, cur
                      where t.payment_date is not null and tv.budget_year_id = cur.budget_year_id and (tv.id = p_version or ts.sort_order < cur.sort_order)
                        and extract(year from t.payment_date) = (select y.year from public.budget_years y where y.id = cur.budget_year_id) group by 1) s)) $$;
