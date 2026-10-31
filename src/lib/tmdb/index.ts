import { env } from "@/lib/config/env";
import { TmdbClient } from "./client";

let client: TmdbClient | undefined;

/** Shared client configured from the environment. Uses globalThis.fetch (stubbable in tests). */
export function tmdb(): TmdbClient {
  if (!client) {
    const e = env();
    client = new TmdbClient(e.TMDB_API_READ_ACCESS_TOKEN, e.TMDB_API_BASE_URL ? { baseUrl: e.TMDB_API_BASE_URL } : {});
  }
  return client;
}

export function resetTmdbClient(): void {
  client = undefined;
}

/** Test hook: inject a client (e.g. wired to a fake TMDB server). */
export function setTmdbClient(c: TmdbClient | undefined): void {
  client = c;
}

export { TmdbClient } from "./client";
export { TmdbError, isTmdbError } from "./errors";
