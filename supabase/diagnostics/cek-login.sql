-- Diagnosa "tidak bisa masuk" (jalankan di Supabase > SQL Editor). Hanya membaca, kecuali bagian 4.
-- 1) Setiap akun Auth, dan apakah punya profil + peran. Harus ada baris dengan username 'admin', aktif, dan peran.
select u.id, u.email as email_auth, p.username, p.is_active as profil_aktif, u.banned_until,
       u.email_confirmed_at is not null as email_terkonfirmasi,
       coalesce((select string_agg(role::text, ',') from public.user_roles r where r.user_id = u.id), '-') as peran
from auth.users u left join public.profiles p on p.id = u.id order by u.created_at;
-- 2) Akun Auth TANPA profil (tidak bisa masuk walau password benar) -> perbaiki dengan scripts/pulihkan-akses.mjs
select u.id, u.email from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
-- 3) Percobaan gagal 15 menit terakhir (>=5 per username = terkunci sementara)
select username, count(*) as gagal, max(created_at) as terakhir from public.login_attempts
where not success and created_at > now() - interval '15 minutes' group by username order by gagal desc;
-- 4) Buka kunci seketika (hapus komentar baris di bawah lalu jalankan)
-- delete from public.login_attempts where username = 'admin' and not success;
