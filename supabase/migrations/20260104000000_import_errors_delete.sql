-- Memungkinkan staging ulang file yang sama setelah master data diperbaiki (riwayat job tetap tersimpan).
grant delete on public.import_errors to authenticated;
create policy import_errors_del on public.import_errors for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_role(array['super_admin','admin_opd','ppbj']::public.app_role[]));
