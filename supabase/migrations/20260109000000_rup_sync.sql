-- Sinkronisasi Paket RUP: unggah dari SIRUP + tambah/ubah/hapus manual.
-- Aman dijalankan ulang.

-- 1) Hak hapus paket RUP (sebelumnya tidak ada). Peran sama dengan hak tulis RUP lainnya.
grant delete on public.rup_packages to authenticated;
drop policy if exists rup_packages_del on public.rup_packages;
create policy rup_packages_del on public.rup_packages for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));

-- 2) Saat paket RUP dihapus (mis. RUP dibatalkan di SIRUP karena pergeseran anggaran):
--    - alokasi ke rekening ikut terhapus (tercatat di log audit),
--    - paket pengadaan yang bertaut tidak dihapus; tautannya dikosongkan (tampil "Belum ada kode RUP").
alter table public.package_budget_allocations drop constraint if exists package_budget_allocations_rup_package_id_fkey;
alter table public.package_budget_allocations add constraint package_budget_allocations_rup_package_id_fkey
  foreign key (rup_package_id) references public.rup_packages(id) on delete cascade;
alter table public.procurement_packages drop constraint if exists procurement_packages_rup_package_id_fkey;
alter table public.procurement_packages add constraint procurement_packages_rup_package_id_fkey
  foreign key (rup_package_id) references public.rup_packages(id) on delete set null;

-- 3) Penerapan impor RUP dari SIRUP: atomik (satu fungsi = satu transaksi), berjalan dengan hak pengguna (tunduk RLS).
--    Kunci pencocokan = kode RUP pada versi anggaran yang sama:
--      kode baru -> ditambah; kode ada & isi berbeda -> diubah; kode ada & isi sama -> tidak disentuh.
--    p_delete_missing: hapus paket RUP yang TIDAK ada di file (hanya bila file tanpa baris bermasalah).
--    p_skip_errors   : terapkan hanya baris valid.
create or replace function public.confirm_rup_import(p_job uuid, p_delete_missing boolean default false, p_skip_errors boolean default false)
returns jsonb language plpgsql as $$
declare j public.import_jobs; v_add int; v_upd int; v_same int; v_del int := 0; v_alloc int := 0;
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found then raise exception 'Job impor tidak ditemukan'; end if;
  if j.kind <> 'rup_packages' then raise exception 'Jenis impor tidak sesuai'; end if;
  if j.status <> 'staged' then raise exception 'Job impor sudah diproses'; end if;
  if j.error_rows > 0 and not p_skip_errors then raise exception 'Masih ada baris bermasalah; perbaiki file atau pilih terapkan baris valid saja'; end if;
  if p_delete_missing and j.error_rows > 0 then raise exception 'Penghapusan paket yang tidak ada di file hanya boleh bila seluruh baris file valid'; end if;
  if jsonb_array_length(j.staged_rows) = 0 then raise exception 'Tidak ada baris valid untuk diterapkan'; end if;

  select count(*) filter (where p.id is null),
         count(*) filter (where p.id is not null and (p.name, p.procurement_type, p.planned_method_id, p.pagu) is distinct from (s.name, s.procurement_type, s.planned_method_id, s.pagu)),
         count(*) filter (where p.id is not null and (p.name, p.procurement_type, p.planned_method_id, p.pagu) is not distinct from (s.name, s.procurement_type, s.planned_method_id, s.pagu))
    into v_add, v_upd, v_same
  from jsonb_to_recordset(j.staged_rows) as s(rup_code text, name text, procurement_type text, planned_method_id uuid, pagu numeric)
  left join public.rup_packages p on p.budget_version_id = j.budget_version_id and p.rup_code = s.rup_code;

  insert into public.rup_packages (budget_version_id, rup_code, name, procurement_type, planned_method_id, pagu)
  select j.budget_version_id, s.rup_code, s.name, s.procurement_type, s.planned_method_id, s.pagu
  from jsonb_to_recordset(j.staged_rows) as s(rup_code text, name text, procurement_type text, planned_method_id uuid, pagu numeric)
  on conflict (budget_version_id, rup_code) do update
    set name = excluded.name, procurement_type = excluded.procurement_type, planned_method_id = excluded.planned_method_id,
        pagu = excluded.pagu, updated_by = auth.uid()
    where (rup_packages.name, rup_packages.procurement_type, rup_packages.planned_method_id, rup_packages.pagu)
          is distinct from (excluded.name, excluded.procurement_type, excluded.planned_method_id, excluded.pagu);

  if p_delete_missing then
    select count(*) into v_alloc from public.package_budget_allocations a join public.rup_packages p on p.id = a.rup_package_id
      where p.budget_version_id = j.budget_version_id
        and not exists (select 1 from jsonb_to_recordset(j.staged_rows) as s(rup_code text) where s.rup_code = p.rup_code);
    delete from public.rup_packages p where p.budget_version_id = j.budget_version_id
      and not exists (select 1 from jsonb_to_recordset(j.staged_rows) as s(rup_code text) where s.rup_code = p.rup_code);
    get diagnostics v_del = row_count;
  end if;

  update public.import_jobs set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_job;
  return jsonb_build_object('added', v_add, 'updated', v_upd, 'unchanged', v_same, 'deleted', v_del, 'allocations_removed', v_alloc);
end $$;
revoke all on function public.confirm_rup_import(uuid, boolean, boolean) from public, anon;
grant execute on function public.confirm_rup_import(uuid, boolean, boolean) to authenticated;
