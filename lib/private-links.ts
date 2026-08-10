import crypto from "node:crypto";

const PREFIX = "support-hub-private-link:";

export function generatePrivateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPrivateToken(token: string): string {
  return crypto.createHash("sha256").update(PREFIX + token).digest("hex");
}
