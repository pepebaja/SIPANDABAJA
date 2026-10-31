-- Unggah realisasi (Excel/CSV): tanggal mulai berlaku tahapan, kolom SPM/SP2D, dan penerapan impor yang atomik.
-- Aman dijalankan ulang.

-- 1) Tanggal mulai berlaku tiap versi anggaran (Murni otomatis 1 Januari bila kosong). Dipakai menentukan tahapan sebuah transaksi.
alter table public.budget_versions add column if not exists effective_from date;

-- 2) Data pencairan pada transaksi + jejak asal unggahan.
alter table public.transactions
  add column if not exists spm_number text, add column if not exists spm_date date,
  add column if not exists sp2d_number text, add column if not exists sp2d_date date,
  add column if not exists import_job_id uuid references public.import_jobs(id) on delete set null;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'payment_status') then
    alter table public.transactions add column payment_status text generated always as
      (case when sp2d_date is not null then 'cair' when spm_date is not null then 'spm' else 'belum' end) stored;
  end if;
end $$;
create index if not exists transactions_import_idx on public.transactions (import_job_id) where import_job_id is not null;
create index if not exists transactions_pay_idx on public.transactions (budget_version_id, payment_status);

-- 3) Jenis impor baru.
alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check check (kind in ('budget_entries','rup_packages','cash_plans','transactions'));

-- 4) Transaksi terverifikasi: tanggal transaksi, data SPM/SP2D, dan versi tidak boleh diubah (buat koreksi).
create or replace function public.guard_transaction() returns trigger language plpgsql as $$
declare v uuid;
begin
  if tg_op = 'INSERT' then
    if new.verification_status = 'verified' then raise exception 'Transaksi baru harus berstatus belum diverifikasi'; end if;
    select budget_version_id into v from public.budget_entries where id = new.budget_entry_id;
    if v is distinct from new.budget_version_id then raise exception 'Rekening tidak berada pada versi anggaran ini'; end if;
  elsif old.verification_status = 'verified' then
    if new.amount <> old.amount or new.budget_entry_id <> old.budget_entry_id or new.kind <> old.kind or new.verification_status <> 'verified'
       or new.transaction_date <> old.transaction_date or new.budget_version_id <> old.budget_version_id
       or new.spm_date is distinct from old.spm_date or new.sp2d_date is distinct from old.sp2d_date
       or new.spm_number is distinct from old.spm_number or new.sp2d_number is distinct from old.sp2d_number
      then raise exception 'Transaksi terverifikasi tidak dapat diubah; buat koreksi'; end if;
  elsif new.verification_status = 'verified' then
    if not public.has_role(array['super_admin','admin_opd']::public.app_role[]) then raise exception 'Hanya admin yang dapat memverifikasi transaksi'; end if;
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  return new;
end $$;

-- 5) Penerapan impor realisasi. Baris diproses satu per satu dalam urutan tanggal; setiap baris melewati SEMUA penjaga
--    database (pagu rekening, anggaran kas kumulatif, pagu RUP, dokumen ganda). p_commit = false: pratinjau yang persis sama
--    dengan penerapan lalu seluruhnya dibatalkan (tidak ada data tersimpan). Berjalan dengan hak pengguna (tunduk RLS).
--    Hasil: {inserted, existing, failed:[{row,message}], preview}.
create or replace function public.apply_transaction_import(p_job uuid, p_commit boolean, p_skip_errors boolean default false)
returns jsonb language plpgsql as $$
declare j public.import_jobs; r record; ex numeric; n_ok int := 0; n_ex int := 0; failed jsonb := '[]'::jsonb; res jsonb;
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found then raise exception 'Job impor tidak ditemukan'; end if;
  if j.kind <> 'transactions' then raise exception 'Jenis impor tidak sesuai'; end if;
  if j.status <> 'staged' then raise exception 'Job impor sudah diproses'; end if;
  if p_commit and j.error_rows > 0 and not p_skip_errors then raise exception 'Masih ada baris bermasalah; perbaiki file atau pilih terapkan baris valid saja'; end if;
  if jsonb_array_length(j.staged_rows) = 0 then raise exception 'Tidak ada baris valid untuk diterapkan'; end if;

  begin
    for r in select s.*, o.ord from jsonb_array_elements(j.staged_rows) with ordinality as o(x, ord),
        lateral jsonb_to_record(o.x) as s(row int, version_id uuid, entry_id uuid, rup_package_id uuid, procurement_package_id uuid, kind text, doc_type text, doc_number text,
          doc_date date, transaction_date date, spm_number text, spm_date date, sp2d_number text, sp2d_date date, amount numeric, notes text)
        order by s.transaction_date, o.ord loop
      -- Dokumen yang sudah tercatat dikenali SEBELUM penjaga batas berjalan (nilai yang sama = sudah ada; berbeda = ditolak).
      ex := null;
      select t.amount into ex from public.transactions t where t.budget_version_id = r.version_id and t.budget_entry_id = r.entry_id
        and t.doc_type = r.doc_type and t.doc_number = r.doc_number and t.kind = r.kind;
      if found then
        if ex = r.amount then n_ex := n_ex + 1;
        else failed := failed || jsonb_build_object('row', r.row, 'message', 'Nomor dokumen sudah tercatat dengan nilai berbeda (' || public.fmt_rp(ex) || '). Gunakan jenis transaksi koreksi untuk mengubah nilai.'); end if;
        continue;
      end if;
      begin
        insert into public.transactions (budget_version_id, budget_entry_id, rup_package_id, procurement_package_id, kind, doc_type, doc_number, doc_date, transaction_date,
          spm_number, spm_date, sp2d_number, sp2d_date, amount, notes, import_job_id)
        values (r.version_id, r.entry_id, r.rup_package_id, r.procurement_package_id, r.kind, r.doc_type, r.doc_number, r.doc_date, r.transaction_date,
          r.spm_number, r.spm_date, r.sp2d_number, r.sp2d_date, r.amount, r.notes, j.id);
        n_ok := n_ok + 1;
      exception
        when unique_violation then n_ex := n_ex + 1;   -- balapan dengan pengguna lain
        when others then failed := failed || jsonb_build_object('row', r.row, 'message', sqlerrm);
      end;
    end loop;
    res := jsonb_build_object('inserted', n_ok, 'existing', n_ex, 'failed', failed, 'preview', not p_commit);
    if not p_commit then raise exception using errcode = 'P0900', message = res::text; end if;   -- batalkan semua; hasil dibawa lewat pesan
    if jsonb_array_length(failed) > 0 and not p_skip_errors then
      raise exception 'Ada % baris ditolak penjaga database; tidak ada yang disimpan. Perbaiki file atau pilih terapkan baris valid saja.', jsonb_array_length(failed);
    end if;
  exception when sqlstate 'P0900' then
    return sqlerrm::jsonb;
  end;
  update public.import_jobs set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_job;
  return res;
end $$;
revoke all on function public.apply_transaction_import(uuid, boolean, boolean) from public, anon;
grant execute on function public.apply_transaction_import(uuid, boolean, boolean) to authenticated;

-- 6) Verifikasi massal transaksi dari satu unggahan (hanya admin: dijaga trigger guard_transaction). Tercatat di log audit.
create or replace function public.verify_import_transactions(p_job uuid) returns int language plpgsql as $$
declare n int;
begin
  update public.transactions set verification_status = 'verified' where import_job_id = p_job and verification_status = 'unverified';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.verify_import_transactions(uuid) from public, anon;
grant execute on function public.verify_import_transactions(uuid) to authenticated;

-- 7) Ringkasan per unggahan untuk tab Riwayat (security invoker: RLS tetap berlaku).
create or replace function public.import_job_stats(p_jobs uuid[])
returns table (job_id uuid, tx_count bigint, unverified_count bigint, total numeric) language sql stable security invoker set search_path = '' as $$
  select t.import_job_id, count(*), count(*) filter (where t.verification_status = 'unverified'), coalesce(sum(t.amount), 0)
  from public.transactions t where t.import_job_id = any (p_jobs) group by t.import_job_id $$;
revoke all on function public.import_job_stats(uuid[]) from public, anon;
grant execute on function public.import_job_stats(uuid[]) to authenticated;
