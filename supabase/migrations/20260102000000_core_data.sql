-- Tahap 2a: master data, anggaran, RUP, alokasi, impor

create table public.programs (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  code text not null, name text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, code));
create table public.activities (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  program_id uuid not null references public.programs(id), code text not null, name text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, code));
create table public.subactivities (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  activity_id uuid not null references public.activities(id), code text not null, name text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, code));
create table public.funding_sources (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  code text not null, name text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, code));
create table public.expenditure_accounts (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  code text not null, name text not null, expense_type text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, code));
create table public.officials (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  official_type text not null check (official_type in ('ppk','pptk','ppbj')), name text not null, nip text, profile_id uuid references public.profiles(id),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, official_type, nip));
-- NPWP sengaja belum disimpan; akan ditambah dengan pembatasan akses kolom bila benar-benar diperlukan.
create table public.providers (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  name text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index providers_name_key on public.providers (organization_id, lower(name));
create table public.procurement_methods (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  code text not null, name text not null, is_swakelola boolean not null default false, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, code));

create table public.import_jobs (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  kind text not null check (kind in ('budget_entries','rup_packages','cash_plans')),
  budget_version_id uuid not null references public.budget_versions(id),
  file_name text not null, checksum text not null,
  status text not null default 'staged' check (status in ('staged','confirmed','rejected')),
  total_rows int not null default 0, ok_rows int not null default 0, error_rows int not null default 0,
  staged_rows jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id), confirmed_at timestamptz,
  unique (organization_id, kind, budget_version_id, checksum));  -- idempotensi: file yang sama tidak diimpor dua kali
create table public.import_errors (id bigint generated always as identity primary key, organization_id uuid not null default public.current_org_id() references public.organizations(id),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade, row_no int not null, field text, message text not null, hint text);

create table public.budget_entries (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  budget_version_id uuid not null references public.budget_versions(id),
  subactivity_id uuid not null references public.subactivities(id), account_id uuid not null references public.expenditure_accounts(id),
  funding_source_id uuid not null references public.funding_sources(id), pptk_id uuid references public.officials(id),
  entry_key text not null, description text not null, amount numeric(18,2) not null check (amount >= 0),
  source_document text, import_job_id uuid references public.import_jobs(id),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  created_by uuid default auth.uid(), updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (budget_version_id, entry_key));
create index budget_entries_ver_idx on public.budget_entries (budget_version_id, subactivity_id);

create table public.rup_packages (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  budget_version_id uuid not null references public.budget_versions(id), rup_code text not null, name text not null,
  procurement_type text not null check (procurement_type in ('barang','konstruksi','konsultansi','jasa_lainnya')),
  planned_method_id uuid references public.procurement_methods(id), pagu numeric(18,2) not null check (pagu >= 0),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  created_by uuid default auth.uid(), updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (budget_version_id, rup_code));

-- Satu rekening bisa membiayai banyak paket, satu paket bisa memakai banyak rekening.
create table public.package_budget_allocations (id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org_id() references public.organizations(id),
  rup_package_id uuid not null references public.rup_packages(id), budget_entry_id uuid not null references public.budget_entries(id),
  amount numeric(18,2) not null check (amount > 0), created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (rup_package_id, budget_entry_id));

create function public.check_allocation_limits() returns trigger language plpgsql as $$
declare p public.rup_packages; e public.budget_entries; used numeric;
begin
  select * into p from public.rup_packages where id = new.rup_package_id for update;   -- kunci baris: cegah balapan
  select * into e from public.budget_entries where id = new.budget_entry_id for update;
  if p.budget_version_id <> e.budget_version_id then raise exception 'Paket dan rekening harus berada pada versi anggaran yang sama'; end if;
  select coalesce(sum(amount),0) into used from public.package_budget_allocations where rup_package_id = p.id and id <> new.id;
  if used + new.amount > p.pagu then raise exception 'Total alokasi melebihi pagu paket'; end if;
  select coalesce(sum(amount),0) into used from public.package_budget_allocations where budget_entry_id = e.id and id <> new.id;
  if used + new.amount > e.amount then raise exception 'Total alokasi melebihi pagu rekening'; end if;
  return new;
end $$;
create trigger trg_alloc_limits before insert or update on public.package_budget_allocations for each row execute function public.check_allocation_limits();

-- Penerapan impor: atomik (satu fungsi = satu transaksi), hanya jika tanpa kesalahan.
create function public.confirm_budget_import(p_job uuid) returns int language plpgsql as $$
declare j public.import_jobs; n int;
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found then raise exception 'Job impor tidak ditemukan'; end if;
  if j.status <> 'staged' then raise exception 'Job impor sudah diproses'; end if;
  if j.kind <> 'budget_entries' then raise exception 'Jenis impor tidak sesuai'; end if;
  if j.error_rows > 0 then raise exception 'Masih ada baris bermasalah; perbaiki file dan unggah ulang'; end if;
  insert into public.budget_entries (budget_version_id, subactivity_id, account_id, funding_source_id, pptk_id, entry_key, description, amount, import_job_id)
  select j.budget_version_id, r.subactivity_id, r.account_id, r.funding_source_id, r.pptk_id, r.entry_key, r.description, r.amount, j.id
  from jsonb_to_recordset(j.staged_rows) as r(subactivity_id uuid, account_id uuid, funding_source_id uuid, pptk_id uuid, entry_key text, description text, amount numeric)
  on conflict (budget_version_id, entry_key) do update set amount = excluded.amount, description = excluded.description,
    pptk_id = excluded.pptk_id, import_job_id = excluded.import_job_id, updated_by = auth.uid();
  get diagnostics n = row_count;
  update public.import_jobs set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_job;
  return n;
end $$;
revoke all on function public.confirm_budget_import(uuid) from public, anon;
grant execute on function public.confirm_budget_import(uuid) to authenticated;

do $$ declare t text;
  adm text := $a$public.has_role(array['super_admin','admin_opd']::public.app_role[])$a$;
  wr  text := $a$public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[])$a$;
begin
  foreach t in array array['programs','activities','subactivities','funding_sources','expenditure_accounts','officials','providers','procurement_methods',
      'import_jobs','import_errors','budget_entries','rup_packages','package_budget_allocations'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_sel on public.%1$I for select to authenticated using (organization_id = public.current_org_id())', t);
  end loop;
  foreach t in array array['programs','activities','subactivities','funding_sources','expenditure_accounts','officials','providers','procurement_methods'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy %1$s_ins on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and %2$s)', t, adm);
    execute format('create policy %1$s_upd on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and %2$s) with check (organization_id = public.current_org_id())', t, adm);
  end loop;
  foreach t in array array['import_jobs','import_errors','budget_entries','rup_packages','package_budget_allocations'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('create policy %1$s_ins on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and %2$s)', t, wr);
    execute format('create policy %1$s_upd on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and %2$s) with check (organization_id = public.current_org_id())', t, wr);
  end loop;
  grant delete on public.package_budget_allocations to authenticated;
  create policy package_budget_allocations_del on public.package_budget_allocations for delete to authenticated
    using (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));
  foreach t in array array['programs','activities','subactivities','funding_sources','expenditure_accounts','officials','providers','procurement_methods','budget_entries','rup_packages','package_budget_allocations'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
  foreach t in array array['programs','activities','subactivities','funding_sources','expenditure_accounts','officials','providers','procurement_methods','budget_entries','rup_packages','package_budget_allocations','import_jobs'] loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.log_audit()', t);
  end loop;
end $$;
