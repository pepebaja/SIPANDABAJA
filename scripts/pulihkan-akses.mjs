// Memulihkan/membuat akun agar bisa masuk dengan USERNAME. Aman dijalankan berulang.
//   node --env-file=.env.local scripts/pulihkan-akses.mjs <username> "<PasswordBaru>" ["Nama Lengkap"] [role]
// Contoh: node --env-file=.env.local scripts/pulihkan-akses.mjs admin "Rahasia2026x" "Administrator" super_admin
// Yang dilakukan: menemukan akun Auth lama (dari profil, metadata username, atau email berawalan username@),
// mengatur password, mengaktifkan & membuka blokir, memastikan profil + peran ada, menghapus kunci percobaan masuk,
// dan mencatat ke log audit. Password wajib diganti saat masuk pertama.
import { createClient } from "@supabase/supabase-js";
const ROLES = ["super_admin", "admin_opd", "ppbj", "ppk", "pptk", "viewer", "auditor"];
const [rawUser, password, fullName, role = "super_admin"] = process.argv.slice(2);
if (!rawUser || !password) { console.error('Pakai: node --env-file=.env.local scripts/pulihkan-akses.mjs <username> "<Password>" ["Nama Lengkap"] [role]'); process.exit(1); }
const username = rawUser.trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(username)) { console.error("Username 3-32 karakter: huruf kecil, angka, titik, garis bawah, strip."); process.exit(1); }
if (!ROLES.includes(role)) { console.error("Role tidak dikenal. Pilihan: " + ROLES.join(", ")); process.exit(1); }
if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || password.toLowerCase().includes(username)) {
  console.error("Password minimal 10 karakter, ada huruf besar, huruf kecil, angka, dan tidak memuat username."); process.exit(1); }
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[k]) { console.error(`${k} belum diatur.`); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (r, msg) => { if (r.error) { console.error(`${msg}: ${r.error.message}`); process.exit(1); } return r.data; };
const derived = `${username}@${process.env.AUTH_EMAIL_DOMAIN ?? "sipanda.example.org"}`;

const org = must(await sb.from("organizations").select("id").limit(1).maybeSingle(), "Organisasi tidak terbaca (jalankan migrasi & seed.sql)");
if (!org) { console.error("Organisasi belum ada. Jalankan supabase/seed.sql dahulu."); process.exit(1); }

// 1) Cari akun Auth yang sudah ada.
let user = null;
const prof = must(await sb.from("profiles").select("id").eq("username", username).maybeSingle(), "Gagal membaca profil");
if (prof) user = (await sb.auth.admin.getUserById(prof.id)).data?.user ?? null;
for (let page = 1; !user && page <= 50; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error("Gagal membaca daftar akun Auth:", error.message); process.exit(1); }
  user = data.users.find((u) => u.user_metadata?.username === username || (u.email ?? "").toLowerCase() === derived || (u.email ?? "").toLowerCase().split("@")[0] === username) ?? null;
  if (data.users.length < 200) break;
}
// 2) Buat atau perbarui.
const attrs = { password, email_confirm: true, ban_duration: "none", app_metadata: { must_change_password: true }, user_metadata: { username } };
if (user) { must(await sb.auth.admin.updateUserById(user.id, attrs), "Gagal memperbarui akun Auth"); console.log(`Akun Auth ditemukan (${user.email}) dan diperbarui.`); }
else { user = must(await sb.auth.admin.createUser({ email: derived, ...attrs }), "Gagal membuat akun Auth").user; console.log(`Akun Auth baru dibuat (${derived}).`); }
// 3) Profil & peran.
const other = must(await sb.from("profiles").select("id").eq("username", username).neq("id", user.id).maybeSingle(), "Gagal memeriksa username");
if (other) { console.error(`Username "${username}" sudah dipakai profil lain (${other.id}). Hapus/ubah profil itu dahulu.`); process.exit(1); }
must(await sb.from("profiles").upsert({ id: user.id, organization_id: org.id, username, full_name: fullName || username, is_active: true }, { onConflict: "id" }), "Gagal menyimpan profil");
const hasRole = must(await sb.from("user_roles").select("id").eq("user_id", user.id).eq("role", role), "Gagal membaca peran");
if (!hasRole.length) must(await sb.from("user_roles").insert({ user_id: user.id, organization_id: org.id, role }), "Gagal menyimpan peran");
// 4) Buka kunci percobaan masuk & catat audit.
await sb.from("login_attempts").delete().eq("username", username);
await sb.from("audit_logs").insert({ organization_id: org.id, actor_id: null, action: "ACCESS_RECOVERY", table_name: "profiles", record_id: user.id, new_data: { username, role, via: "scripts/pulihkan-akses.mjs" } });
console.log(`Selesai. Masuk di /login dengan username "${username}" dan password yang baru saja diatur (wajib diganti setelah masuk).`);
