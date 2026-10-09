insert into public.organizations (code, name) values ('OPD-001', 'Nama OPD (ubah di Pengaturan)') on conflict do nothing;
insert into public.budget_stages (organization_id, code, name, sort_order)
select o.id, s.code, s.name, s.ord from public.organizations o,
(values ('MURNI','Murni',1),('PERGESERAN','Pergeseran',2),('PERUBAHAN','Perubahan',3)) as s(code,name,ord) on conflict do nothing;
insert into public.budget_years (organization_id, year)
select o.id, y from public.organizations o, generate_series(2026, 2036) y on conflict do nothing;
insert into public.procurement_methods (organization_id, code, name, is_swakelola)
select o.id, m.code, m.name, m.sw from public.organizations o, (values
 ('EPURCHASING','E-purchasing',false),('PL','Pengadaan Langsung',false),('PENUNJUKAN','Penunjukan Langsung',false),
 ('TENDER_CEPAT','Tender Cepat',false),('TENDER','Tender',false),('SELEKSI','Seleksi',false),('SWAKELOLA','Swakelola',true)) as m(code,name,sw)
on conflict do nothing;
insert into public.funding_sources (organization_id, code, name)
select o.id, f.code, f.name from public.organizations o, (values ('DAU','Dana Alokasi Umum'),('DBHCHT','DBH Cukai Hasil Tembakau')) as f(code,name) on conflict do nothing;
