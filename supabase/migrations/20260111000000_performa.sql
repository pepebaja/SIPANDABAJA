-- Performa: total realisasi dihitung di database (1 baris), indeks yang kurang, dan RLS yang tidak memanggil fungsi per baris.
-- Aman dijalankan ulang. Tidak mengubah hasil perhitungan maupun hak akses.

-- 1) Beranda & Input Realisasi hanya butuh TOTAL. Sebelumnya seluruh rekening ditarik per 1000 baris lalu dijumlah di server.
create or replace function public.realization_totals(p_version uuid)
returns table (pagu numeric, verified numeric, unverified numeric, tx_count bigint, unverified_count bigint, over_pagu_count bigint)
language sql stable security invoker set search_path = '' as $$
  with r as (
    select e.amount as pagu,
      coalesce(sum(t.amount) filter (where t.verification_status = 'verified'), 0) as v,
      coalesce(sum(t.amount) filter (where t.verification_status = 'unverified'), 0) as u,
      count(t.id) as n, count(t.id) filter (where t.verification_status = 'unverified') as un
    from public.budget_entries e left join public.transactions t on t.budget_entry_id = e.id
    where e.budget_version_id = p_version group by e.id, e.amount)
  select coalesce(sum(pagu), 0), coalesce(sum(v), 0), coalesce(sum(u), 0), coalesce(sum(n), 0)::bigint, coalesce(sum(un), 0)::bigint,
         count(*) filter (where v + u > pagu) from r $$;
revoke all on function public.realization_totals(uuid) from public, anon;
grant execute on function public.realization_totals(uuid) to authenticated;

-- 2) Indeks untuk kueri yang sering dipakai (kontrak per paket, paket per RUP, alokasi per rekening, log audit terbaru, grafik bulanan).
create index if not exists contracts_pkg_idx on public.contracts_or_orders (procurement_package_id);
create index if not exists procurement_packages_rup_idx on public.procurement_packages (rup_package_id);
create index if not exists procurement_packages_ver_code_idx on public.procurement_packages (budget_version_id, internal_code);
create index if not exists allocations_entry_idx on public.package_budget_allocations (budget_entry_id);
create index if not exists audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc, id desc);
create index if not exists transactions_verified_month_idx on public.transactions (budget_version_id, transaction_date) where verification_status = 'verified';

-- 3) RLS: `organization_id = current_org_id()` dievaluasi PER BARIS (fungsi security definer menjalankan kueri tiap kali).
--    Dibungkus (select ...) agar dihitung SEKALI per kueri (InitPlan). Makna kebijakan identik. Kebijakan yang gagal diubah dilewati dengan NOTICE.
do $$ declare p record; q text; w text; cmd text; n int := 0;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies
           where schemaname = 'public' and (coalesce(qual, '') ~ 'current_org_id\(\)' or coalesce(with_check, '') ~ 'current_org_id\(\)') loop
    continue when coalesce(p.qual, '') ~* 'select\s+(public\.)?current_org_id' or coalesce(p.with_check, '') ~* 'select\s+(public\.)?current_org_id';
    q := regexp_replace(p.qual, '(public\.)?current_org_id\(\)', '(select public.current_org_id())', 'g');
    w := regexp_replace(p.with_check, '(public\.)?current_org_id\(\)', '(select public.current_org_id())', 'g');
    cmd := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then cmd := cmd || ' using (' || q || ')'; end if;
    if w is not null then cmd := cmd || ' with check (' || w || ')'; end if;
    begin execute cmd; n := n + 1;
    exception when others then raise notice 'Kebijakan % pada % dilewati: %', p.policyname, p.tablename, sqlerrm; end;
  end loop;
  raise notice 'Kebijakan RLS dioptimalkan: %', n;
end $$;
