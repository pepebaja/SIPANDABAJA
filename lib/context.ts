export const CONTEXT_COOKIE = "sipanda_ctx";
export function encodeContext(yearId: string, stageId: string) { return `${yearId}:${stageId}`; }
export function decodeContext(raw: string | undefined): { yearId: string; stageId: string } | null {
  const m = raw?.match(/^([0-9a-f-]{36}):([0-9a-f-]{36})$/i);
  return m ? { yearId: m[1]!, stageId: m[2]! } : null;
}
