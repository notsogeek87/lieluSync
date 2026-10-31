import { completeTmdbLogin } from "@/lib/auth/tmdb-auth";
import { runInBackground } from "@/lib/background";
import { syncUser } from "@/lib/sync/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  return completeTmdbLogin(req, (userId) => {
    // First synchronisation right away, after the redirect has been sent.
    runInBackground("login-sync", () => syncUser(userId, "login", { deadline: Date.now() + 50_000 }));
  });
}
