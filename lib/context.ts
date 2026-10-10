export const CONTEXT_COOKIE = "sipandabaja_ctx";
export function encodeContext(yearId: string, stageId: string) { return `${yearId}:${stageId}`; }
export function decodeContext(raw: string | undefined): { yearId: string; stageId: string } | null {
  const m = raw?.match(/^([0-9a-f-]{36}):([0-9a-f-]{36})$/i);
  return m ? { yearId: m[1]!, stageId: m[2]! } : null;
}
export const contextCookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
/** Tahun bawaan: pilihan tersimpan -> tahun berjalan (WIB) -> tahun terbaru. */
export function pickYear<T extends { id: string; year: number }>(years: readonly T[], savedId?: string, now = new Date()): T | undefined {
  const saved = years.find((y) => y.id === savedId);
  if (saved) return saved;
  const current = Number(now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 4));
  return years.find((y) => y.year === current) ?? [...years].sort((a, b) => b.year - a.year)[0];
}
