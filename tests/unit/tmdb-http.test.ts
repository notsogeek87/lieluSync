import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TmdbHttp } from "@/lib/tmdb/http";
import { RequestLimiter } from "@/lib/tmdb/limiter";
import { TmdbError } from "@/lib/tmdb/errors";

const schema = z.object({ ok: z.boolean() });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function client(fetchImpl: typeof fetch) {
  return new TmdbHttp({ fetch: fetchImpl, sleep: async () => {}, limiter: new RequestLimiter(4, 0) });
}

describe("TMDB HTTP client", () => {
  it("sends the bearer token and parses JSON", async () => {
    const f = vi.fn(async (_u: any, init: any) => {
      expect(init.headers.Authorization).toBe("Bearer abc");
      return json(200, { ok: true, extra: 1 });
    });
    await expect(client(f as any).request({ path: "/3/x", bearer: "abc", schema })).resolves.toEqual({ ok: true });
  });

  it("retries 429 and 5xx then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(429, {}, { "retry-after": "1" })).mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, { ok: true }));
    await expect(client(f).request({ path: "/3/x", bearer: "t", schema })).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("retries network errors", async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json(200, { ok: true }));
    await expect(client(f).request({ path: "/3/x", bearer: "t", schema })).resolves.toEqual({ ok: true });
  });

  it("does not retry 401/404 and classifies them", async () => {
    const f = vi.fn().mockResolvedValue(json(401, { status_code: 3 }));
    const err = await client(f).request({ path: "/3/x", bearer: "t", schema }).catch((e) => e);
    expect(err).toBeInstanceOf(TmdbError);
    expect(err.code).toBe("unauthorized");
    expect(err.tmdbStatusCode).toBe(3);
    expect(f).toHaveBeenCalledTimes(1);
    const g = vi.fn().mockResolvedValue(json(404, {}));
    expect((await client(g).request({ path: "/3/x", bearer: "t", schema }).catch((e) => e)).code).toBe("not_found");
  });

  it("gives up after max retries", async () => {
    const f = vi.fn().mockResolvedValue(json(500, {}));
    const err = await client(f).request({ path: "/3/x", bearer: "t", schema }).catch((e) => e);
    expect(err.code).toBe("server");
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("rejects unexpected payloads and never leaks the token in errors", async () => {
    const f = vi.fn().mockResolvedValue(json(200, { nope: 1 }));
    const err = await client(f).request({ path: "/3/x", bearer: "super-secret-token", schema }).catch((e) => e);
    expect(err.code).toBe("invalid_response");
    expect(String(err.message)).not.toContain("super-secret-token");
  });
});

describe("RequestLimiter", () => {
  it("caps concurrency", async () => {
    const lim = new RequestLimiter(2, 0);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        lim.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});
