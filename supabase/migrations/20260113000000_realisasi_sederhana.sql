-- Penyederhanaan Input Realisasi: satu pasangan Tanggal/No SPM-SP2D (nomor dapat diperbarui), kolom dokumen & kode paket dihapus
-- dari alur, kolom Metode Pemilihan ditambahkan. Data lama dipertahankan (kolom lama tetap ada, hanya tidak dipakai lagi).
-- Aman dijalankan ulang. Membutuhkan migrasi 20260112.

-- 1) Kolom baru.
alter table public.transactions
  add column if not exists payment_date date,                                           -- Tanggal SPM/SP2D: penentu tahapan anggaran
  add column if not exists payment_number text,                                         -- No SPM/SP2D: dapat dilengkapi/diperbarui kemudian
  add column if not exists procurement_method_id uuid references public.procurement_methods(id);   -- Metode pemilihan (Perpres 16/2018 jo. 12/2021 jo. 46/2025)
create index if not exists transactions_method_idx on public.transactions (procurement_method_id) where procurement_method_id is not null;

-- 2) Penjaga transaksi. Terverifikasi: nilai, rekening, tanggal transaksi, dan tahapan terkunci; tanggal SPM/SP2D, nomor SPM/SP2D, dan metode
--    hanya boleh DILENGKAPI bila masih kosong (setelah terisi, terkunci). RUP yang hanya memiliki satu paket pengadaan otomatis ditautkan ke paket itu.
create or replace function public.guard_transaction() returns trigger language plpgsql as $$
declare v uuid; pk uuid;
begin
  if tg_op = 'INSERT' then
    if new.verification_status = 'verified' then raise exception 'Transaksi baru harus berstatus belum diverifikasi'; end if;
    select budget_version_id into v from public.budget_entries where id = new.budget_entry_id;
    if v is distinct from new.budget_version_id then raise exception 'Rekening tidak berada pada versi anggaran ini'; end if;
  elsif old.verification_status = 'verified' then
    if new.amount <> old.amount or new.budget_entry_id <> old.budget_entry_id or new.kind <> old.kind or new.verification_status <> 'verified'
       or new.transaction_date <> old.transaction_date or new.budget_version_id <> old.budget_version_id
      then raise exception 'Transaksi terverifikasi tidak dapat diubah (nilai, rekening, tanggal, tahapan); buat koreksi'; end if;
    if old.payment_date is not null and new.payment_date is distinct from old.payment_date then raise exception 'Tanggal SPM/SP2D pada transaksi terverifikasi sudah terkunci'; end if;
    if old.payment_number is not null and new.payment_number is distinct from old.payment_number then raise exception 'No SPM/SP2D pada transaksi terverifikasi sudah terkunci'; end if;
    if old.procurement_method_id is not null and new.procurement_method_id is distinct from old.procurement_method_id then raise exception 'Metode pemilihan pada transaksi terverifikasi sudah terkunci'; end if;
  elsif new.verification_status = 'verified' then
    if not public.has_role(array['super_admin','admin_opd']::public.app_role[]) then raise exception 'Hanya admin yang dapat memverifikasi transaksi'; end if;
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  if new.rup_package_id is not null and (tg_op = 'INSERT' or new.rup_package_id is distinct from old.rup_package_id) then
    select case when count(*) = 1 then (array_agg(p.id))[1] end into pk from public.procurement_packages p where p.rup_package_id = new.rup_package_id;
    if pk is not null then new.procurement_package_id := pk; elsif tg_op = 'UPDATE' then new.procurement_package_id := null; end if;   -- pindah tahapan: lepas paket milik versi lama
  end if;
  return new;
end $$;

-- 3) Pindahkan data SPM/SP2D lama (SP2D diutamakan) ke kolom baru, lalu hapus kolom lama. Trigger dimatikan sementara agar
--    transaksi terverifikasi tidak ditolak dan log audit tidak dibanjiri; datanya sama, hanya berpindah kolom.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'sp2d_date') then
    alter table public.transactions disable trigger user;
    update public.transactions set payment_date = coalesce(sp2d_date, spm_date), payment_number = coalesce(sp2d_number, spm_number)
      where payment_date is null and payment_number is null and (sp2d_date is not null or spm_date is not null or sp2d_number is not null or spm_number is not null);
    alter table public.transactions enable trigger user;
    alter table public.transactions drop column if exists payment_status;     -- turunan kolom lama
    alter table public.transactions drop column if exists spm_number, drop column if exists spm_date, drop column if exists sp2d_number, drop column if exists sp2d_date;
  end if;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'payment_status') then
    alter table public.transactions drop column payment_status;
  end if;
  alter table public.transactions add column payment_status text generated always as (case when payment_date is not null then 'sudah' else 'belum' end) stored;
end $$;
create index if not exists transactions_pay_idx on public.transactions (budget_version_id, payment_status);

-- 4) Jenis dokumen tidak lagi dicatat pada transaksi baru.
alter table public.transactions alter column doc_type drop not null;

-- 5) Pratinjau unggahan lama (format kolom berbeda) tidak dapat diterapkan lagi: hapus yang belum diterapkan.
delete from public.import_jobs where kind = 'transactions' and status = 'staged';

-- 6) Penerapan impor. Kunci baris = tanggal transaksi + subkegiatan + rekening + sumber dana + nilai + kode RUP (nomor SPM/SP2D bukan kunci).
--    Baris yang sudah tercatat tidak dicatat ganda; bila nomor/tanggal SPM-SP2D/metode pada file lebih lengkap atau berbeda, transaksi
--    DIPERBARUI (dan dipindah ke tahapan yang tepat bila tanggal SPM/SP2D mengubah tahapan; hanya untuk yang belum terverifikasi).
--    p_commit = false: pratinjau yang persis sama lalu dibatalkan. Hasil: jumlah + nomor baris per tindakan + baris ditolak.
create or replace function public.apply_transaction_import(p_job uuid, p_commit boolean, p_skip_errors boolean default false)
returns jsonb language plpgsql as $$
declare j public.import_jobs; r record; c record; nid uuid; claimed uuid[] := '{}'; n_ok int := 0; n_up int := 0; n_ex int := 0;
  rows_ok int[] := '{}'; rows_up int[] := '{}'; rows_ex int[] := '{}'; failed jsonb := '[]'::jsonb; res jsonb; moving boolean; changed boolean;
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found then raise exception 'Job impor tidak ditemukan'; end if;
  if j.kind <> 'transactions' then raise exception 'Jenis impor tidak sesuai'; end if;
  if j.status <> 'staged' then raise exception 'Job impor sudah diproses'; end if;
  if p_commit and j.error_rows > 0 and not p_skip_errors then raise exception 'Masih ada baris bermasalah; perbaiki file atau pilih terapkan baris valid saja'; end if;
  if jsonb_array_length(j.staged_rows) = 0 then raise exception 'Tidak ada baris valid untuk diterapkan'; end if;

  begin
    for r in select s.*, o.ord from jsonb_array_elements(j.staged_rows) with ordinality as o(x, ord),
        lateral jsonb_to_record(o.x) as s(row int, version_id uuid, entry_id uuid, sub_id uuid, acc_id uuid, fund_id uuid, rup_package_id uuid, rup_code text,
          method_id uuid, transaction_date date, payment_date date, payment_number text, amount numeric, notes text)
        order by s.transaction_date, o.ord loop
      select t.id, t.verification_status as vs, t.payment_date as pdate, t.payment_number as pno, t.procurement_method_id as mid, t.budget_version_id as vid into c
        from public.transactions t join public.budget_entries e on e.id = t.budget_entry_id left join public.rup_packages rp on rp.id = t.rup_package_id
       where t.transaction_date = r.transaction_date and t.amount = r.amount and e.subactivity_id = r.sub_id and e.account_id = r.acc_id
         and e.funding_source_id is not distinct from r.fund_id and rp.rup_code is not distinct from r.rup_code and t.id <> all (claimed)
       order by (coalesce(t.payment_number, '') = coalesce(r.payment_number, '')) desc, (t.payment_number is null) desc, t.created_at, t.id limit 1;
      if found then
        claimed := claimed || c.id;
        moving := r.payment_date is not null and r.version_id <> c.vid;
        changed := moving or (r.payment_date is not null and r.payment_date is distinct from c.pdate)
                   or (r.payment_number is not null and r.payment_number is distinct from c.pno) or (r.method_id is not null and r.method_id is distinct from c.mid);
        if not changed then n_ex := n_ex + 1; rows_ex := rows_ex || r.row; continue; end if;
        begin
          update public.transactions set payment_date = coalesce(r.payment_date, payment_date), payment_number = coalesce(r.payment_number, payment_number),
            procurement_method_id = coalesce(r.method_id, procurement_method_id),
            budget_version_id = case when moving then r.version_id else budget_version_id end,
            budget_entry_id = case when moving then r.entry_id else budget_entry_id end,
            rup_package_id = case when moving then r.rup_package_id else rup_package_id end
          where id = c.id;
          n_up := n_up + 1; rows_up := rows_up || r.row;
        exception when others then failed := failed || jsonb_build_object('row', r.row, 'message', sqlerrm); end;
        continue;
      end if;
      begin
        insert into public.transactions (budget_version_id, budget_entry_id, rup_package_id, procurement_method_id, kind, transaction_date, payment_date, payment_number, amount, notes, import_job_id)
        values (r.version_id, r.entry_id, r.rup_package_id, r.method_id, case when r.amount < 0 then 'koreksi' else 'pembayaran' end, r.transaction_date, r.payment_date, r.payment_number, r.amount, r.notes, j.id)
        returning id into nid;
        claimed := claimed || nid;          -- baris yang baru disisipkan tidak boleh dicocokkan lagi oleh baris identik berikutnya pada file yang sama
        n_ok := n_ok + 1; rows_ok := rows_ok || r.row;
      exception when others then failed := failed || jsonb_build_object('row', r.row, 'message', sqlerrm);
      end;
    end loop;
    res := jsonb_build_object('inserted', n_ok, 'updated', n_up, 'existing', n_ex, 'failed', failed, 'preview', not p_commit,
      'inserted_rows', to_jsonb(rows_ok), 'updated_rows', to_jsonb(rows_up), 'existing_rows', to_jsonb(rows_ex));
    if not p_commit then raise exception using errcode = 'P0900', message = res::text; end if;     -- batalkan semua; hasil dibawa lewat pesan
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
