-- Tahap 3b: pengelompokan status yang dapat dikonfigurasi + ringkasan dashboard
alter table public.package_statuses
  add column stage_group text not null default 'belum_diproses' check (stage_group in ('belum_diproses','diproses','selesai','tidak_aktif')),
  add column needs_followup boolean not null default false;
update public.package_statuses set stage_group = 'diproses' where code in ('PEMILIHAN','HASIL','KONTRAK','PELAKSANAAN','SERAH_TERIMA');
update public.package_statuses set stage_group = 'selesai' where code = 'SELESAI';
update public.package_statuses set stage_group = 'tidak_aktif' where code = 'BATAL';
update public.package_statuses set needs_followup = true where code = 'PERBAIKAN';

-- "Diproses" = kelompok diproses atau selesai; "belum diproses" = kelompok belum_diproses. Paket tidak_aktif (mis. dibatalkan) tidak dihitung.
-- Perlu tindak lanjut = status bertanda needs_followup, belum bertaut RUP, atau lewat tenggat dan belum selesai.
create function public.dashboard_summary(p_version uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  with p as (select k.*, s.stage_group, s.needs_followup from public.procurement_packages k
             join public.package_statuses s on s.organization_id = k.organization_id and s.code = k.status where k.budget_version_id = p_version)
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
                from (select extract(month from transaction_date)::int mo, sum(amount) v from public.transactions
                      where budget_version_id = p_version and verification_status = 'verified' group by 1) s)) $$;
revoke all on function public.dashboard_summary(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid) to authenticated;
