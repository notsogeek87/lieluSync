import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "@/lib/http/canonical";

const base = { host: "lielu-sync.vercel.app", pathname: "/dashboard", search: "?a=1", method: "GET", appUrl: "https://lists.lielu.eu", vercelEnv: "production" };

describe("canonical host redirect", () => {
  it("sends pages on the old host to APP_URL", () => {
    expect(canonicalRedirect(base)).toBe("https://lists.lielu.eu/dashboard?a=1");
  });
  it("never redirects addon, API or cron routes", () => {
    expect(canonicalRedirect({ ...base, pathname: "/u/abc/manifest.json" })).toBeNull();
    expect(canonicalRedirect({ ...base, pathname: "/api/cron/sync" })).toBeNull();
  });
  it("leaves the canonical host, previews and non-GET requests alone", () => {
    expect(canonicalRedirect({ ...base, host: "lists.lielu.eu" })).toBeNull();
    expect(canonicalRedirect({ ...base, vercelEnv: "preview" })).toBeNull();
    expect(canonicalRedirect({ ...base, method: "POST" })).toBeNull();
  });
});
