import { z } from "zod";

/**
 * Environment validation. Parsed lazily so that `next build` can run without
 * secrets; any runtime access to a missing/invalid variable fails loudly.
 */
const base64Key = z
  .string()
  .min(1)
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes encoded in base64 (npm run gen:secret)");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/+$/, "")),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["require", "disable"]).optional(),
  TMDB_API_READ_ACCESS_TOKEN: z.string().min(20),
  /** Override only for local end-to-end tests against a fake TMDB server. */
  TMDB_API_BASE_URL: z.string().url().optional(),
  TOKEN_ENCRYPTION_KEY: base64Key,
  TOKEN_ENCRYPTION_KEY_PREVIOUS: base64Key.optional(),
  HASH_SECRET: z.string().min(32, "must be at least 32 characters"),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(15),
  CRON_TIME_BUDGET_SECONDS: z.coerce.number().int().min(20).max(780).default(240),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached environment. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
