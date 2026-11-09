-- Beranda: jumlah paket pekerjaan per metode pemilihan + peringkat realisasi (tertinggi -> terendah).
-- Realisasi = transaksi yang sudah diakui (Tanggal SPM/SP2D terisi), kumulatif tahapan terpilih + tahapan sebelumnya pada tahun yang sama
-- (aturan yang sama dengan grafik bulanan). Metode transaksi diambil berurutan dari: metode pada transaksi -> metode paket pengadaan
-- -> rencana metode pada paket RUP. Transaksi non-pengadaan (tanpa metode, tanpa RUP, tanpa paket) tidak ikut peringkat.
-- Jumlah paket = paket pengadaan versi terpilih yang tidak berstatus tidak_aktif (sama dengan kartu "Paket per metode" sebelumnya).
-- Aman dijalankan ulang. Jalankan setelah 20260117.
create or replace function public.dashboard_method_ranking(p_version uuid)
returns table (method_id uuid, method_name text, pkg_count bigint, tx_count bigint, realized numeric)
language sql stable security invoker set search_path = '' as $$
  with cur as (select v.budget_year_id, st.sort_order, y.year
                 from public.budget_versions v join public.budget_stages st on st.id = v.budget_stage_id join public.budget_years y on y.id = v.budget_year_id
                where v.id = p_version),
  pk as (select coalesce(k.method_id, '00000000-0000-0000-0000-000000000000'::uuid) mid, count(*) n
           from public.procurement_packages k
           join public.package_statuses s on s.organization_id = k.organization_id and s.code = k.status
          where k.budget_version_id = p_version and s.stage_group <> 'tidak_aktif' group by 1),
  rl as (select coalesce(t.procurement_method_id, pp.method_id, rp.planned_method_id, '00000000-0000-0000-0000-000000000000'::uuid) mid,
                sum(t.amount) v, count(*) c
           from public.transactions t
           join public.budget_versions tv on tv.id = t.budget_version_id
           join public.budget_stages ts on ts.id = tv.budget_stage_id
           cross join cur
           left join public.procurement_packages pp on pp.id = t.procurement_package_id
           left join public.rup_packages rp on rp.id = t.rup_package_id
          where t.payment_date is not null and tv.budget_year_id = cur.budget_year_id and (tv.id = p_version or ts.sort_order < cur.sort_order)
            and extract(year from t.payment_date) = cur.year
            and (t.procurement_method_id is not null or t.rup_package_id is not null or t.procurement_package_id is not null)
          group by 1)
  select nullif(coalesce(pk.mid, rl.mid), '00000000-0000-0000-0000-000000000000'::uuid),
         coalesce(m.name, 'Belum ditentukan'), coalesce(pk.n, 0), coalesce(rl.c, 0), coalesce(rl.v, 0)
    from pk full join rl on rl.mid = pk.mid
    left join public.procurement_methods m on m.id = coalesce(pk.mid, rl.mid)
   order by coalesce(rl.v, 0) desc, coalesce(pk.n, 0) desc, 2 $$;
revoke all on function public.dashboard_method_ranking(uuid) from public, anon;
grant execute on function public.dashboard_method_ranking(uuid) to authenticated;
