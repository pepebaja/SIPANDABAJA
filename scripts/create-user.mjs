// node --env-file=.env.local scripts/create-user.mjs <username> <password> "<Nama Lengkap>" <role>
// role: super_admin | admin_opd | ppbj | ppk | pptk | viewer | auditor
import { createClient } from "@supabase/supabase-js";
const ROLES = ["super_admin", "admin_opd", "ppbj", "ppk", "pptk", "viewer", "auditor"];
const [username, password, fullName, role] = process.argv.slice(2);
if (!role) { console.error('Argumen: username password "Nama Lengkap" role'); process.exit(1); }
const u = username.toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(u)) { console.error("Username 3-32 karakter: huruf kecil, angka, titik, garis bawah, strip."); process.exit(1); }
if (!ROLES.includes(role)) { console.error("Role tidak dikenal. Pilihan: " + ROLES.join(", ")); process.exit(1); }
if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { console.error("Password minimal 10 karakter dengan huruf besar, huruf kecil, dan angka."); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: org, error: oe } = await sb.from("organizations").select("id").limit(1).single();
if (oe) { console.error("Organisasi belum ada. Jalankan supabase/seed.sql dahulu."); process.exit(1); }
const { data, error } = await sb.auth.admin.createUser({ email: `${u}@${process.env.AUTH_EMAIL_DOMAIN ?? "sipanda.example.org"}`, password, email_confirm: true });
if (error) throw error;
const id = data.user.id;
const p = await sb.from("profiles").insert({ id, organization_id: org.id, username: u, full_name: fullName });
if (p.error) { await sb.auth.admin.deleteUser(id); throw p.error; }
const r = await sb.from("user_roles").insert({ user_id: id, organization_id: org.id, role });
if (r.error) { await sb.auth.admin.deleteUser(id); throw r.error; }
console.log("Dibuat:", u, role);
