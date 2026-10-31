// Deterministic, obviously fake configuration for tests. Never real secrets.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL = process.env.TEST_APP_URL ?? "https://lists.test.local";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/lielu_test";
process.env.TMDB_API_READ_ACCESS_TOKEN = "test-app-read-access-token-0000000000";
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.HASH_SECRET = "test-hash-secret-test-hash-secret-0000";
process.env.CRON_SECRET = "test-cron-secret-test-cron-secret-0000";
process.env.LIELU_DISABLE_BACKGROUND = "1";
