import "server-only";
import { createHash } from "node:crypto";
export const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");
