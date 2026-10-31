import { describe, expect, it } from "vitest";
import { redact, redactString, safeErrorMessage } from "@/lib/log";

describe("log redaction", () => {
  it("redacts sensitive keys recursively", () => {
    const out = redact({ access_token: "abc", nested: { Authorization: "Bearer x", ok: 1 }, sessionId: "s" }) as Record<string, any>;
    expect(out.access_token).toBe("[redacted]");
    expect(out.nested.Authorization).toBe("[redacted]");
    expect(out.nested.ok).toBe(1);
    expect(out.sessionId).toBe("[redacted]");
  });

  it("redacts tokens embedded in strings", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactString(`token ${jwt}`)).not.toContain(jwt);
    expect(redactString("GET /u/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg/manifest.json")).toBe("GET /u/[redacted]/manifest.json");
    expect(redactString("Authorization: Bearer abc.def")).toContain("Bearer [redacted]");
  });

  it("produces short safe error messages", () => {
    const msg = safeErrorMessage(new Error(`failed with Bearer secret123 ${"x".repeat(500)}`));
    expect(msg.length).toBeLessThanOrEqual(300);
    expect(msg).not.toContain("secret123");
  });
});
