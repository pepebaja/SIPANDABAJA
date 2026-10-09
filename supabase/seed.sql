insert into public.organizations (code, name) values ('OPD-001', 'Nama OPD (ubah di Pengaturan)') on conflict do nothing;
insert into public.budget_stages (organization_id, code, name, sort_order)
select o.id, s.code, s.name, s.ord from public.organizations o,
(values ('MURNI','Murni',1),('PERGESERAN','Pergeseran',2),('PERUBAHAN','Perubahan',3)) as s(code,name,ord) on conflict do nothing;
insert into public.budget_years (organization_id, year)
select o.id, y from public.organizations o, generate_series(2026, 2036) y on conflict do nothing;
