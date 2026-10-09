export const ROLES = ["super_admin", "admin_opd", "ppbj", "ppk", "pptk", "viewer", "auditor"] as const;
export type Role = (typeof ROLES)[number];
const ALL = [...ROLES];
// Cermin kebijakan RLS; database tetap penegak utama.
export const PERMISSIONS = {
  "context:read": ALL,
  "users:manage": ["super_admin", "admin_opd"],
  "users:read": ["super_admin", "admin_opd", "auditor"],
  "settings:write": ["super_admin"],
  "budget-setup:write": ["super_admin", "admin_opd"],
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
