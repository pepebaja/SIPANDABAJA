-- Tahap 4: Anggaran kas per TRIWULAN (3 bulanan), menggantikan per bulan.
-- Aman dijalankan ulang: perubahan hanya dilakukan bila kolom period_month masih ada.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cash_plan_items' and column_name = 'period_month') then
    alter table public.cash_plan_items add column if not exists period_quarter smallint;
    update public.cash_plan_items set period_quarter = ((period_month - 1) / 3) + 1;

    -- Gabungkan baris bulanan yang berada dalam triwulan yang sama (nilai dijumlahkan).
    with g as (
      select cash_plan_id, budget_entry_id, period_quarter, (array_agg(id order by period_month))[1] as keep_id,
             sum(planned_amount) as p, case when count(actual_amount) = 0 then null else sum(actual_amount) end as a
      from public.cash_plan_items group by cash_plan_id, budget_entry_id, period_quarter having count(*) > 1)
    update public.cash_plan_items i set planned_amount = g.p, actual_amount = g.a from g where i.id = g.keep_id;

    delete from public.cash_plan_items i using (
      select cash_plan_id, budget_entry_id, period_quarter, (array_agg(id order by period_month))[1] as keep_id
      from public.cash_plan_items group by cash_plan_id, budget_entry_id, period_quarter having count(*) > 1) g
    where i.cash_plan_id = g.cash_plan_id and i.budget_entry_id = g.budget_entry_id and i.period_quarter = g.period_quarter and i.id <> g.keep_id;

    alter table public.cash_plan_items alter column period_quarter set not null;
    alter table public.cash_plan_items add constraint cash_plan_items_quarter_chk check (period_quarter between 1 and 4);
    alter table public.cash_plan_items drop column period_month;   -- unique & check lama ikut terhapus
    alter table public.cash_plan_items add constraint cash_plan_items_plan_entry_quarter_key unique (cash_plan_id, budget_entry_id, period_quarter);
  end if;
end $$;

-- Penerapan impor anggaran kas (Excel/PDF): atomik. p_skip_errors = terapkan hanya baris valid.
create or replace function public.confirm_cash_import(p_job uuid, p_skip_errors boolean default false) returns int language plpgsql as $$
declare j public.import_jobs; v_plan uuid; n int;
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found then raise exception 'Job impor tidak ditemukan'; end if;
  if j.kind <> 'cash_plans' then raise exception 'Jenis impor tidak sesuai'; end if;
  if j.status <> 'staged' then raise exception 'Job impor sudah diproses'; end if;
  if j.error_rows > 0 and not p_skip_errors then raise exception 'Masih ada baris bermasalah; perbaiki file atau pilih terapkan baris valid saja'; end if;

  select id into v_plan from public.cash_plans where budget_version_id = j.budget_version_id order by created_at limit 1;
  if v_plan is null then
    insert into public.cash_plans (organization_id, budget_version_id, name, source_document) values (j.organization_id, j.budget_version_id, 'Anggaran kas', j.file_name) returning id into v_plan;
  else
    update public.cash_plans set source_document = j.file_name where id = v_plan;
  end if;

  insert into public.cash_plan_items (organization_id, cash_plan_id, budget_entry_id, period_quarter, planned_amount)
  select j.organization_id, v_plan, r.entry_id, t.ord::smallint, t.val::numeric
  from jsonb_to_recordset(j.staged_rows) as r(entry_id uuid, q jsonb)
  join public.budget_entries e on e.id = r.entry_id and e.budget_version_id = j.budget_version_id
  cross join lateral jsonb_array_elements_text(r.q) with ordinality as t(val, ord)
  where t.val is not null and t.ord between 1 and 4
  on conflict (cash_plan_id, budget_entry_id, period_quarter) do update set planned_amount = excluded.planned_amount;
  get diagnostics n = row_count;

  update public.import_jobs set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_job;
  return n;
end $$;
revoke all on function public.confirm_cash_import(uuid, boolean) from public, anon;
grant execute on function public.confirm_cash_import(uuid, boolean) to authenticated;
