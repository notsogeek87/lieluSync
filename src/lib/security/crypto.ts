import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";

/**
 * AES-256-GCM envelope: "v{keyVersion}.{iv}.{tag}.{ciphertext}" (base64url parts).
 * Key version 1 = TOKEN_ENCRYPTION_KEY, version 0 = TOKEN_ENCRYPTION_KEY_PREVIOUS
 * (used only for decryption during a key rotation).
 */
const CURRENT_VERSION = 1;

function keyFor(version: number): Buffer {
  const e = env();
  if (version === CURRENT_VERSION) return Buffer.from(e.TOKEN_ENCRYPTION_KEY, "base64");
  if (version === 0 && e.TOKEN_ENCRYPTION_KEY_PREVIOUS) return Buffer.from(e.TOKEN_ENCRYPTION_KEY_PREVIOUS, "base64");
  throw new Error(`Unknown encryption key version ${version}`);
}

export function encryptSecret(plaintext: string, aad = "lielu"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(CURRENT_VERSION), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [`v${CURRENT_VERSION}`, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(envelope: string, aad = "lielu"): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || !parts[0]!.startsWith("v")) throw new Error("Malformed encrypted value");
  const version = Number(parts[0]!.slice(1));
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const ct = Buffer.from(parts[3]!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(version), iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function needsReencryption(envelope: string): boolean {
  return !envelope.startsWith(`v${CURRENT_VERSION}.`);
}

/** Random, URL-safe identifier (default 32 bytes = 256 bits of entropy). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Keyed hash used to store lookup identifiers (sessions, config ids, rate-limit keys). */
export function hashToken(value: string, purpose: string): string {
  return createHmac("sha256", env().HASH_SECRET).update(`${purpose}:${value}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
