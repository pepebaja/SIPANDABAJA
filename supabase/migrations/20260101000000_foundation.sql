-- SIPANDA PBJ - Tahap 1: fondasi (1 OPD; organization_id dipertahankan untuk kompatibilitas)
create extension if not exists pgcrypto;
create type public.app_role as enum ('super_admin','admin_opd','ppbj','ppk','pptk','viewer','auditor');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  username text not null check (username = lower(username) and username ~ '^[a-z0-9._-]{3,32}$'),
  full_name text not null, nip text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index profiles_username_key on public.profiles (lower(username));

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique (user_id, role));

create table public.budget_years (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  year int not null check (year between 2000 and 2100), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, year));

create table public.budget_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null check (code in ('MURNI','PERGESERAN','PERUBAHAN')), name text not null,
  sort_order int not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code));

-- Versi anggaran = identitas eksplisit pasangan tahun + tahapan; data historis tidak ditimpa.
create table public.budget_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  budget_year_id uuid not null references public.budget_years(id),
  budget_stage_id uuid not null references public.budget_stages(id),
  version_no int not null default 1 check (version_no > 0),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (budget_year_id, budget_stage_id, version_no));

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  key text not null, value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, key));

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid, actor_id uuid, action text not null, table_name text not null,
  record_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz not null default now());

-- Hanya diakses service role (route login). Tanpa policy dan tanpa GRANT ke anon/authenticated.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  username text not null, ip text not null, success boolean not null,
  created_at timestamptz not null default now());
create index login_attempts_user_idx on public.login_attempts (username, created_at desc);
create index login_attempts_ip_idx on public.login_attempts (ip, created_at desc);

create function public.current_org_id() returns uuid language sql stable security definer set search_path = '' as
$$ select organization_id from public.profiles where id = auth.uid() and is_active $$;
create function public.has_role(roles public.app_role[]) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where ur.user_id = auth.uid() and p.is_active and ur.role = any(roles)) $$;
revoke all on function public.current_org_id(), public.has_role(public.app_role[]) from public, anon;
grant execute on function public.current_org_id(), public.has_role(public.app_role[]) to authenticated;

create function public.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

create function public.log_audit() returns trigger language plpgsql security definer set search_path = '' as
$$ declare v_old jsonb; v_new jsonb; v_row jsonb;
begin
  if tg_op = 'DELETE' then v_old := to_jsonb(old);
  else v_new := to_jsonb(new); if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if; end if;
  v_row := coalesce(v_new, v_old);
  insert into public.audit_logs (organization_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (nullif(v_row->>'organization_id','')::uuid, auth.uid(), tg_op, tg_table_name, nullif(v_row->>'id','')::uuid, v_old, v_new);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['organizations','profiles','budget_years','budget_stages','budget_versions','system_settings'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
  foreach t in array array['profiles','user_roles','budget_years','budget_stages','budget_versions','system_settings'] loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.log_audit()', t);
  end loop;
end $$;

-- GRANT eksplisit (RLS tidak menggantikan hak akses SQL)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.organizations, public.profiles, public.user_roles, public.budget_years,
  public.budget_stages, public.budget_versions, public.system_settings, public.audit_logs to authenticated;
grant update (full_name, nip, is_active) on public.profiles to authenticated;
grant insert, delete on public.user_roles to authenticated;
grant insert, update on public.budget_years, public.budget_stages, public.budget_versions to authenticated;
grant insert, update on public.system_settings to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.budget_years enable row level security;
alter table public.budget_stages enable row level security;
alter table public.budget_versions enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_attempts enable row level security;

create policy org_select on public.organizations for select to authenticated using (id = public.current_org_id());

create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','auditor']::public.app_role[])));
create policy profiles_update on public.profiles for update to authenticated
  using (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd']::public.app_role[]))
  with check (organization_id = public.current_org_id());

create policy roles_select on public.user_roles for select to authenticated using (
  user_id = auth.uid() or (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','auditor']::public.app_role[])));
-- Hanya super_admin yang boleh memberi/mencabut role super_admin dan admin_opd
create policy roles_insert on public.user_roles for insert to authenticated with check (
  organization_id = public.current_org_id() and (
    public.has_role(array['super_admin']::public.app_role[])
    or (public.has_role(array['admin_opd']::public.app_role[]) and role not in ('super_admin','admin_opd'))));
create policy roles_delete on public.user_roles for delete to authenticated using (
  organization_id = public.current_org_id() and (
    public.has_role(array['super_admin']::public.app_role[])
    or (public.has_role(array['admin_opd']::public.app_role[]) and role not in ('super_admin','admin_opd'))));

do $$ declare t text; begin
  foreach t in array array['budget_years','budget_stages','budget_versions'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_role(array[''super_admin'',''admin_opd'']::public.app_role[]))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_role(array[''super_admin'',''admin_opd'']::public.app_role[])) with check (organization_id = public.current_org_id())', t);
  end loop;
end $$;

create policy settings_select on public.system_settings for select to authenticated using (
  organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd']::public.app_role[]));
create policy settings_insert on public.system_settings for insert to authenticated with check (
  organization_id = public.current_org_id() and public.has_role(array['super_admin']::public.app_role[]));
create policy settings_update on public.system_settings for update to authenticated
  using (organization_id = public.current_org_id() and public.has_role(array['super_admin']::public.app_role[]))
  with check (organization_id = public.current_org_id());

create policy audit_select on public.audit_logs for select to authenticated using (
  organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','auditor']::public.app_role[]));
