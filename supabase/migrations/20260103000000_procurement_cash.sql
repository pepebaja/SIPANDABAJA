-- Tahap 2b: paket pengadaan, kontrak/SP, riwayat status, anggaran kas
create table public.package_statuses (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations(id),
  code text not null, name text not null, definition text not null, sort_order int not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, code));

create table public.procurement_packages (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations(id),
  budget_version_id uuid not null references public.budget_versions(id),
  rup_package_id uuid references public.rup_packages(id),            -- boleh kosong; sistem memberi peringatan
  internal_code text not null, name text not null,
  execution_mode text not null default 'penyedia' check (execution_mode in ('penyedia','swakelola')),
  method_id uuid references public.procurement_methods(id),
  ppbj_id uuid references public.officials(id), ppk_id uuid references public.officials(id), pptk_id uuid references public.officials(id),
  pagu numeric(18,2) not null check (pagu >= 0),
  status text not null default 'RENCANA',
  assigned_date date, docs_received_date date, process_start date, process_end date, due_date date, handover_date date,
  obstacle_category text, notes text,
  created_by uuid default auth.uid(), updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (budget_version_id, internal_code),
  foreign key (organization_id, status) references public.package_statuses (organization_id, code),
  check (process_end is null or process_start is null or process_end >= process_start));
create index procurement_packages_ver_idx on public.procurement_packages (budget_version_id, status);

create table public.procurement_events (id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  procurement_package_id uuid not null references public.procurement_packages(id),
  from_status text, to_status text not null, created_by uuid, created_at timestamptz not null default now());

-- Nilai kontrak/SP BUKAN realisasi keuangan; realisasi dicatat di modul transaksi (Tahap 3).
create table public.contracts_or_orders (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations(id),
  procurement_package_id uuid not null references public.procurement_packages(id),
  provider_id uuid references public.providers(id),
  doc_type text not null check (doc_type in ('kontrak','spk','surat_pesanan')),
  doc_number text, doc_date date, selection_result_value numeric(18,2) check (selection_result_value >= 0),
  contract_value numeric(18,2) check (contract_value >= 0),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  created_by uuid default auth.uid(), updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.cash_plans (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations(id),
  budget_version_id uuid not null references public.budget_versions(id), name text not null, source_document text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.cash_plan_items (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations(id),
  cash_plan_id uuid not null references public.cash_plans(id) on delete cascade,
  budget_entry_id uuid not null references public.budget_entries(id),
  period_month int not null check (period_month between 1 and 12),
  planned_amount numeric(18,2) not null check (planned_amount >= 0),
  actual_amount numeric(18,2) check (actual_amount >= 0),               -- hanya jika data tersedia; bukan saldo bank
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (cash_plan_id, budget_entry_id, period_month));

create function public.log_package_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.procurement_events (organization_id, procurement_package_id, from_status, to_status, created_by)
    values (new.organization_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if; return new; end $$;
create trigger trg_pkg_status after insert or update on public.procurement_packages for each row execute function public.log_package_status();

do $$ declare t text;
  adm text := $a$public.has_role(array['super_admin','admin_opd']::public.app_role[])$a$;
  wr  text := $a$public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[])$a$;
  wc  text := $a$public.has_role(array['super_admin','admin_opd','ppbj','ppk']::public.app_role[])$a$;
  pol text;
begin
  foreach t in array array['package_statuses','procurement_packages','procurement_events','contracts_or_orders','cash_plans','cash_plan_items'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_sel on public.%1$I for select to authenticated using (organization_id = public.current_org_id())', t);
  end loop;
  foreach t in array array['package_statuses','procurement_packages','contracts_or_orders','cash_plans','cash_plan_items'] loop
    pol := case t when 'package_statuses' then adm when 'contracts_or_orders' then wc else wr end;
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy %1$s_ins on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and %2$s)', t, pol);
    execute format('create policy %1$s_upd on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and %2$s) with check (organization_id = public.current_org_id())', t, pol);
  end loop;
  grant delete on public.cash_plan_items to authenticated;
  create policy cash_plan_items_del on public.cash_plan_items for delete to authenticated using (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));
  foreach t in array array['package_statuses','procurement_packages','contracts_or_orders','cash_plans','cash_plan_items'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.log_audit()', t);
  end loop;
end $$;
