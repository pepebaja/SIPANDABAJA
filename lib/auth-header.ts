// Header internal berisi id pengguna yang SUDAH diverifikasi middleware lewat Supabase Auth.
// Middleware selalu menghapus header ini dari permintaan masuk lalu mengisinya sendiri, sehingga klien tidak dapat memalsukannya.
export const UID_HEADER = "x-sipanda-uid";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
