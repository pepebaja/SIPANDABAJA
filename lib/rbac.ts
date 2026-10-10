export const ROLES = ["super_admin", "admin_opd", "ppbj", "ppk", "pptk", "viewer", "auditor"] as const;
export type Role = (typeof ROLES)[number];
const ALL = [...ROLES];
// Cermin kebijakan RLS; database tetap penegak utama.
export const PERMISSIONS = {
  "context:read": ALL,
  "users:manage": ["super_admin", "admin_opd"],
  "users:read": ["super_admin", "admin_opd", "auditor"],
  "settings:write": ["super_admin"],
  "print-profile:write": ["super_admin", "admin_opd"],
  "budget-setup:write": ["super_admin", "admin_opd"],
  "budget:import": ["super_admin", "admin_opd", "ppbj"],
  "cash:write": ["super_admin", "admin_opd", "ppbj"],
  "audit:read": ["super_admin", "admin_opd", "auditor"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;
export function can(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}
export function canAssignRole(actor: readonly Role[], target: Role): boolean {
  if (actor.includes("super_admin")) return true;
  return actor.includes("admin_opd") && target !== "super_admin" && target !== "admin_opd";
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin", admin_opd: "Admin OPD", ppbj: "PPBJ", ppk: "PPK", pptk: "PPTK", viewer: "Pembaca", auditor: "Auditor",
};
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Akses penuh, termasuk pengaturan sistem dan pengelolaan semua pengguna.",
  admin_opd: "Mengelola pengguna operasional, anggaran, master data, dan verifikasi.",
  ppbj: "Mengimpor anggaran serta mengelola paket RUP dan paket pengadaan.",
  ppk: "Mencatat kontrak/SP dan data pelaksanaan paket.",
  pptk: "Pelaksana teknis kegiatan; mengakses data sesuai hak akses.",
  viewer: "Hanya melihat data (tanpa mengubah).",
  auditor: "Melihat data, daftar pengguna, dan log audit (tanpa mengubah).",
};
export function assignableRoles(actor: readonly Role[]): Role[] {
  return ROLES.filter((r) => canAssignRole(actor, r));
}
// Admin OPD tidak boleh mengelola akun yang memegang role administratif.
export function canManageTarget(actor: readonly Role[], targetRoles: readonly Role[]): boolean {
  if (actor.includes("super_admin")) return true;
  if (!actor.includes("admin_opd")) return false;
  return !targetRoles.some((r) => r === "super_admin" || r === "admin_opd");
}
