export type TmdbErrorCode =
  | "unauthorized" // 401: token invalid / revoked / request token not approved
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "server"
  | "network"
  | "timeout"
  | "invalid_response"
  | "bad_request";

export class TmdbError extends Error {
  constructor(
    public readonly code: TmdbErrorCode,
    message: string,
    public readonly status?: number,
    public readonly tmdbStatusCode?: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }

  get retryable(): boolean {
    return this.code === "rate_limited" || this.code === "server" || this.code === "network" || this.code === "timeout";
  }
}

export function isTmdbError(err: unknown, code?: TmdbErrorCode): err is TmdbError {
  return err instanceof TmdbError && (code === undefined || err.code === code);
}
