export const TABLE_LABELS: Record<string, string> = {
  profiles: "Pengguna", user_roles: "Peran pengguna", budget_years: "Tahun anggaran", budget_stages: "Tahapan anggaran", budget_versions: "Versi anggaran",
  system_settings: "Pengaturan", organizations: "Organisasi", programs: "Program", activities: "Kegiatan", subactivities: "Subkegiatan", funding_sources: "Sumber dana",
  expenditure_accounts: "Rekening belanja", officials: "Pejabat", providers: "Penyedia", procurement_methods: "Metode pemilihan", import_jobs: "Impor anggaran",
  budget_entries: "Rekening anggaran", rup_packages: "Paket RUP", package_budget_allocations: "Alokasi paket", package_statuses: "Status paket",
  procurement_packages: "Paket pengadaan", contracts_or_orders: "Kontrak/SP", cash_plans: "Rencana kas", cash_plan_items: "Item rencana kas", transactions: "Transaksi",
};
export const ACTION_LABELS: Record<string, string> = {
  INSERT: "Tambah", UPDATE: "Ubah", DELETE: "Hapus", USER_CREATE: "Buat akun", USER_UPDATE: "Ubah akun", USER_PASSWORD_RESET: "Reset password",
  USER_ACTIVATE: "Aktifkan akun", USER_DEACTIVATE: "Nonaktifkan akun", SETUP_FIRST_ADMIN: "Setup Super Admin", SETTINGS_UPDATE: "Ubah pengaturan",
};
export const tableLabel = (t: string) => TABLE_LABELS[t] ?? t;
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;
/** Ringkasan aman (tanpa NIP/data sensitif) dari isi baris yang berubah. */
export function auditSummary(row: { new_data?: any; old_data?: any }): string {
  const d = row.new_data ?? row.old_data ?? {};
  const bits = [d.username, d.full_name, d.internal_code, d.rup_code, d.code, d.name, d.doc_number, d.description].filter((x) => typeof x === "string" && x);
  return bits.slice(0, 2).map((s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s)).join(" · ") || "-";
}
