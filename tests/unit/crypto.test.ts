import { describe, expect, it, beforeEach } from "vitest";
import { decryptSecret, encryptSecret, hashToken, needsReencryption, randomToken, safeEqual } from "@/lib/security/crypto";
import { resetEnvCache } from "@/lib/config/env";

describe("token encryption", () => {
  beforeEach(() => resetEnvCache());

  it("round-trips and never contains the plaintext", () => {
    const secret = "eyJhbGciOiJIUzI1NiJ9.user-access-token.signature";
    const enc = encryptSecret(secret, "tmdb-access-token");
    expect(enc).not.toContain(secret);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decryptSecret(enc, "tmdb-access-token")).toBe(secret);
  });

  it("uses a fresh IV for every encryption", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("rejects tampered ciphertext and wrong AAD", () => {
    const enc = encryptSecret("secret", "a");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "a")).toThrow();
    expect(() => decryptSecret(enc, "b")).toThrow();
  });

  it("decrypts with the previous key during a rotation", () => {
    const old = Buffer.alloc(32, 9).toString("base64");
    const current = process.env.TOKEN_ENCRYPTION_KEY!;
    process.env.TOKEN_ENCRYPTION_KEY = old;
    resetEnvCache();
    const enc = encryptSecret("rotate-me").replace(/^v1\./, "v0.");
    process.env.TOKEN_ENCRYPTION_KEY = current;
    process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = old;
    resetEnvCache();
    expect(decryptSecret(enc)).toBe("rotate-me");
    expect(needsReencryption(enc)).toBe(true);
    delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
    resetEnvCache();
  });
});

describe("identifiers", () => {
  it("generates 256-bit url-safe tokens", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 200 }, () => randomToken())).size).toBe(200);
  });

  it("hashes are keyed and purpose-scoped", () => {
    expect(hashToken("abc", "session")).not.toBe(hashToken("abc", "config"));
    expect(hashToken("abc", "session")).toBe(hashToken("abc", "session"));
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
