import { describe, expect, it, beforeEach } from "vitest";
import { readCookie, serializeCookie, sessionCookieName } from "@/lib/auth/cookies";
import { env, resetEnvCache } from "@/lib/config/env";
import { isSameOrigin } from "@/lib/security/request-guard";

describe("cookies", () => {
  beforeEach(() => resetEnvCache());
  it("uses hardened attributes", () => {
    const c = serializeCookie(sessionCookieName(), "v", { maxAge: 60 });
    expect(sessionCookieName()).toBe("__Host-lielu_session");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).not.toContain("Domain");
  });
  it("reads cookies", () => {
    expect(readCookie("a=1; __Host-lielu_session=xyz; b=2", "__Host-lielu_session")).toBe("xyz");
    expect(readCookie(null, "a")).toBeNull();
  });
});

describe("environment & origin checks", () => {
  beforeEach(() => resetEnvCache());
  it("validates configuration", () => {
    expect(env().SYNC_INTERVAL_MINUTES).toBe(15);
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = "short";
    resetEnvCache();
    expect(() => env()).toThrow(/TOKEN_ENCRYPTION_KEY/);
    process.env.TOKEN_ENCRYPTION_KEY = saved;
    resetEnvCache();
  });
  it("accepts only same-origin mutations", () => {
    const mk = (h: Record<string, string>) => new Request("https://lists.test.local/api/sync", { method: "POST", headers: h });
    expect(isSameOrigin(mk({ origin: "https://lists.test.local" }))).toBe(true);
    expect(isSameOrigin(mk({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(mk({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(mk({}))).toBe(false);
  });
});

import { normalizeDatabaseUrl } from "@/lib/db/client";
describe("database url", () => {
  it("drops libpq-only options from Neon connection strings", () => {
    const u = normalizeDatabaseUrl("postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require&channel_binding=require");
    expect(u).toBe("postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db");
  });
});
