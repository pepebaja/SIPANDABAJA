// node --env-file=.env.local scripts/create-user.mjs <username> <password> "<Nama Lengkap>" <role>
import { createClient } from "@supabase/supabase-js";
const [username, password, fullName, role] = process.argv.slice(2);
if (!role) { console.error('Argumen: username password "Nama" role'); process.exit(1); }
const u = username.toLowerCase();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: org } = await sb.from("organizations").select("id").limit(1).single();
const { data, error } = await sb.auth.admin.createUser({ email: `${u}@${process.env.AUTH_EMAIL_DOMAIN ?? "sipanda.example.org"}`, password, email_confirm: true });
if (error) throw error;
const id = data.user.id;
const p = await sb.from("profiles").insert({ id, organization_id: org.id, username: u, full_name: fullName });
if (p.error) { await sb.auth.admin.deleteUser(id); throw p.error; }
const r = await sb.from("user_roles").insert({ user_id: id, organization_id: org.id, role });
if (r.error) throw r.error;
console.log("Dibuat:", u, role);
