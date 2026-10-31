import { TmdbClient } from "@/lib/tmdb/client";
import { RequestLimiter } from "@/lib/tmdb/limiter";
import { setTmdbClient } from "@/lib/tmdb";
import { bindAccount } from "@/lib/auth/tmdb-auth";
import { createSession } from "@/lib/repo/sessions";
import { decryptConfigToken, getUserById } from "@/lib/repo/users";
import { APP_TOKEN, FakeTmdb } from "./fake-tmdb";

export const APP = "https://lists.test.local";

export function setupFakeTmdb(): { fake: FakeTmdb; client: TmdbClient } {
  const fake = new FakeTmdb();
  const client = new TmdbClient(APP_TOKEN, { fetch: fake.fetch as typeof fetch, sleep: async () => {}, limiter: new RequestLimiter(16, 0) });
  setTmdbClient(client);
  return { fake, client };
}

/** Creates a Lielu user connected to a fake TMDB account, with a web session. */
export async function connectedUser(fake: FakeTmdb, objectId: string) {
  if (!fake.accounts.has(objectId)) fake.addAccount(objectId);
  const token = fake.issueToken(objectId);
  const res = await bindAccount(null, objectId, token, { username: objectId });
  if (!res.ok) throw new Error(res.error);
  const session = await createSession(res.userId);
  const user = (await getUserById(res.userId))!;
  return { userId: res.userId, accessToken: token, sessionToken: session.token, configToken: decryptConfigToken(user), account: fake.accounts.get(objectId)! };
}

export function authedRequest(path: string, sessionToken: string | null, init: RequestInit & { origin?: string | null } = {}): Request {
  const headers = new Headers(init.headers);
  if (sessionToken) headers.set("cookie", `__Host-lielu_session=${sessionToken}`);
  const origin = init.origin === undefined ? APP : init.origin;
  if (origin) headers.set("origin", origin);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`${APP}${path}`, { ...init, headers });
}

export const params = <T>(p: T) => ({ params: Promise.resolve(p) });
