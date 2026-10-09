# SIPANDA PBJ
Next.js + Supabase. Setup: salin `.env.example` ke `.env.local`, `supabase db push`, jalankan `supabase/seed.sql`,
buat super admin dengan `scripts/create-user.mjs`, lalu `npm run dev`. Tes: `npm test`, `npm run typecheck`.
Migration di `supabase/migrations/` (berurutan). Service-role key hanya untuk server/skrip.
