-- Tahap 3a: realisasi belanja. Satu transaksi -> satu rekening anggaran (tabel transaction_allocations ditunda; tidak diperlukan selama tidak ada pembayaran lintas rekening).
create table public.transactions (id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations(id),
  budget_version_id uuid not null references public.budget_versions(id),
  budget_entry_id uuid not null references public.budget_entries(id),
  procurement_package_id uuid references public.procurement_packages(id),
  kind text not null default 'pembayaran' check (kind in ('pembayaran','koreksi','pembatalan')),
  doc_type text not null check (doc_type in ('kuitansi','bast','invoice','sp2d','lainnya')),
  doc_number text, doc_date date, transaction_date date not null,
  amount numeric(18,2) not null,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  verified_by uuid references public.profiles(id), verified_at timestamptz, notes text,
  created_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  -- Koreksi/pembatalan dicatat sebagai baris negatif; catatan keuangan tidak dihapus.
  check ((kind = 'pembayaran' and amount > 0) or (kind in ('koreksi','pembatalan') and amount < 0)));
create index transactions_entry_idx on public.transactions (budget_entry_id, verification_status);
create index transactions_ver_date_idx on public.transactions (budget_version_id, transaction_date desc);
-- Cegah transaksi ganda akibat input/impor berulang.
create unique index transactions_doc_key on public.transactions (budget_version_id, budget_entry_id, doc_type, doc_number, kind) where doc_number is not null;

create function public.guard_transaction() returns trigger language plpgsql as $$
declare v uuid;
begin
  if tg_op = 'INSERT' then
    if new.verification_status = 'verified' then raise exception 'Transaksi baru harus berstatus belum diverifikasi'; end if;
    select budget_version_id into v from public.budget_entries where id = new.budget_entry_id;
    if v is distinct from new.budget_version_id then raise exception 'Rekening tidak berada pada versi anggaran ini'; end if;
  elsif old.verification_status = 'verified' then
    if new.amount <> old.amount or new.budget_entry_id <> old.budget_entry_id or new.kind <> old.kind or new.verification_status <> 'verified'
      then raise exception 'Transaksi terverifikasi tidak dapat diubah; buat koreksi'; end if;
  elsif new.verification_status = 'verified' then
    if not public.has_role(array['super_admin','admin_opd']::public.app_role[]) then raise exception 'Hanya admin yang dapat memverifikasi transaksi'; end if;
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  return new;
end $$;
create trigger trg_guard before insert or update on public.transactions for each row execute function public.guard_transaction();
create trigger trg_touch before update on public.transactions for each row execute function public.touch_updated_at();
create trigger trg_audit after insert or update or delete on public.transactions for each row execute function public.log_audit();

revoke all on public.transactions from anon, authenticated;
alter table public.transactions enable row level security;
grant select, insert, update on public.transactions to authenticated;
create policy tx_sel on public.transactions for select to authenticated using (organization_id = public.current_org_id());
create policy tx_ins on public.transactions for insert to authenticated with check (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));
create policy tx_upd on public.transactions for update to authenticated using (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[])) with check (organization_id = public.current_org_id());

-- Agregasi di database (RLS tetap berlaku: security invoker). Verifikasi dipisahkan dari belum diverifikasi.
create function public.realization_by_entry(p_version uuid)
returns table (entry_id uuid, pagu numeric, verified numeric, unverified numeric, tx_count bigint, unverified_count bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.amount,
    coalesce(sum(t.amount) filter (where t.verification_status = 'verified'), 0),
    coalesce(sum(t.amount) filter (where t.verification_status = 'unverified'), 0),
    count(t.id), count(t.id) filter (where t.verification_status = 'unverified')
  from public.budget_entries e left join public.transactions t on t.budget_entry_id = e.id
  where e.budget_version_id = p_version group by e.id, e.amount $$;
revoke all on function public.realization_by_entry(uuid) from public, anon;
grant execute on function public.realization_by_entry(uuid) to authenticated;
