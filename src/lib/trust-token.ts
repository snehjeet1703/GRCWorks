import { createHash, randomBytes } from "crypto";

// Tokens are 256-bit random, so a fast unsalted SHA-256 is enough: a DB leak doesn't yield working links.
export function generateTrustToken() {
  return randomBytes(32).toString("base64url");
}

export function hashTrustToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
