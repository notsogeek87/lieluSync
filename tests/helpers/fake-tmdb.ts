/**
 * In-memory TMDB API used by tests. Implements the v4 auth flow, v4 account
 * lists / watchlists / list details with 20-item pagination, and v3 details.
 * Supports failure injection to exercise retries and error handling.
 */
type MT = "movie" | "tv";
export interface FakeItem { id: number; media_type: MT }
interface FakeList { id: number; name: string; items: FakeItem[]; updated_at: string; public: boolean }
interface FakeAccount { objectId: string; lists: FakeList[]; watchlist: Record<MT, FakeItem[]> }
interface Failure { pattern: RegExp; status: number; times: number }

export const APP_TOKEN = "test-app-read-access-token-0000000000";
const PAGE = 20;

export class FakeTmdb {
  accounts = new Map<string, FakeAccount>();
  tokens = new Map<string, string>(); // access token -> objectId
  requestTokens = new Map<string, { approvedFor?: string; redirectTo?: string }>();
  media = new Map<string, { imdb?: string | null; title: string; frTitle?: string; overview?: string; enOverview?: string; frPoster?: boolean; missing?: boolean }>();
  failures: Failure[] = [];
  calls: string[] = [];
  revoked: string[] = [];
  private seq = 0;

  addAccount(objectId: string): FakeAccount {
    const acc: FakeAccount = { objectId, lists: [], watchlist: { movie: [], tv: [] } };
    this.accounts.set(objectId, acc);
    return acc;
  }

  issueToken(objectId: string): string {
    const t = `eyJfake.${objectId}.${++this.seq}xxxxxxxxxx`;
    this.tokens.set(t, objectId);
    return t;
  }

  fail(pattern: RegExp, status: number, times = 1): void {
    this.failures.push({ pattern, status, times });
  }

  setMedia(type: MT, id: number, m: { imdb?: string | null; title: string; frTitle?: string; overview?: string; enOverview?: string; frPoster?: boolean; missing?: boolean }) {
    this.media.set(`${type}:${id}`, m);
  }

  touch(list: FakeList) {
    list.updated_at = new Date(Date.now() + ++this.seq * 1000).toISOString();
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const auth = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const key = `${method} ${url.pathname}`;
    this.calls.push(key);

    const f = this.failures.find((x) => x.times > 0 && x.pattern.test(key));
    if (f) {
      f.times--;
      return this.res(f.status, { success: false, status_code: f.status === 401 ? 3 : 0 });
    }
    const page = Number(url.searchParams.get("page") ?? 1);
    let m: RegExpMatchArray | null;

    if (key === "POST /4/auth/request_token") {
      if (auth !== APP_TOKEN) return this.res(401, {});
      const rt = `rt_${++this.seq}_xxxxxxxxxxxx`;
      this.requestTokens.set(rt, { redirectTo: body.redirect_to });
      return this.res(200, { success: true, request_token: rt });
    }
    if (key === "POST /4/auth/access_token") {
      const rt = this.requestTokens.get(body.request_token);
      if (auth !== APP_TOKEN || !rt?.approvedFor) return this.res(401, { success: false });
      this.requestTokens.delete(body.request_token);
      const token = this.issueToken(rt.approvedFor);
      return this.res(200, { success: true, access_token: token, account_id: rt.approvedFor });
    }
    if (key === "DELETE /4/auth/access_token") {
      this.revoked.push(body.access_token);
      this.tokens.delete(body.access_token);
      return this.res(200, { success: true, status_code: 13 });
    }
    if (key === "POST /3/authentication/session/convert/4") {
      if (!this.tokens.has(body.access_token)) return this.res(401, {});
      return this.res(200, { success: true, session_id: `sess_${this.tokens.get(body.access_token)}_xxxxxxxx` });
    }
    if (key === "GET /3/account") {
      const oid = url.searchParams.get("session_id")!.split("_")[1]!;
      return this.res(200, { id: 42, username: `user-${oid}`, name: "Charlie", avatar: { tmdb: { avatar_path: "/a.png" } } });
    }
    if (key === "DELETE /3/authentication/session") return this.res(200, { success: true });

    if ((m = url.pathname.match(/^\/4\/account\/([^/]+)\/(lists|movie\/watchlist|tv\/watchlist)$/))) {
      const acc = this.accounts.get(m[1]!);
      if (!acc || this.tokens.get(auth) !== acc.objectId) return this.res(401, { success: false, status_code: 3 });
      if (m[2] === "lists") {
        return this.res(200, this.paginate(acc.lists.map((l) => ({ id: l.id, name: l.name, number_of_items: l.items.length, updated_at: l.updated_at, public: l.public ? 1 : 0, description: "" })), page));
      }
      const t = m[2]!.startsWith("movie") ? "movie" : "tv";
      return this.res(200, this.paginate(acc.watchlist[t].map((i) => this.itemJson(i)), page));
    }
    if ((m = url.pathname.match(/^\/4\/list\/(\d+)$/))) {
      const oid = this.tokens.get(auth);
      const acc = oid ? this.accounts.get(oid) : undefined;
      if (!acc) return this.res(401, {});
      const list = acc.lists.find((l) => l.id === Number(m![1]));
      if (!list) return this.res(404, { status_code: 34 });
      return this.res(200, { id: list.id, name: list.name, description: "", public: list.public, item_count: list.items.length, ...this.paginate(list.items.map((i) => this.itemJson(i)), page) });
    }
    if ((m = url.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/))) {
      if (auth !== APP_TOKEN) return this.res(401, {});
      const t = m[1] as MT;
      const id = Number(m[2]);
      const md = this.media.get(`${t}:${id}`) ?? { title: `${t} ${id}`, imdb: `tt${String(1000000 + id)}` };
      if (md.missing) return this.res(404, { status_code: 34 });
      const imdb = md.imdb === undefined ? `tt${String(1000000 + id)}` : md.imdb;
      const translations = [
        { iso_639_1: "en", iso_3166_1: "US", data: { overview: md.enOverview ?? `EN overview ${id}`, title: md.title, name: md.title } },
      ];
      const posters = md.frPoster ? [{ file_path: `/fr-${id}.jpg`, iso_639_1: "fr", vote_average: 5 }] : [];
      const common = {
        id, overview: md.overview ?? "", poster_path: `/p-${id}.jpg`, backdrop_path: `/b-${id}.jpg`, original_language: "en",
        genres: [{ id: 1, name: "Drame" }], vote_average: 7.25, external_ids: { imdb_id: imdb }, translations: { translations }, images: { posters },
      };
      if (t === "movie") return this.res(200, { ...common, title: md.frTitle ?? md.title, original_title: md.title, release_date: "2020-05-01", runtime: 100 });
      return this.res(200, { ...common, name: md.frTitle ?? md.title, original_name: md.title, first_air_date: "2019-01-01", last_air_date: "2021-01-01", in_production: false, seasons: [{ season_number: 1 }] });
    }
    if ((m = url.pathname.match(/^\/3\/tv\/(\d+)\/season\/(\d+)$/))) {
      return this.res(200, { season_number: Number(m[2]), episodes: [1, 2].map((e) => ({ episode_number: e, season_number: Number(m![2]), name: `Ép ${e}`, air_date: "2019-01-0" + e })) });
    }
    return this.res(404, { status_code: 34, path: key });
  };

  private itemJson(i: FakeItem) {
    return { id: i.id, media_type: i.media_type, title: `t${i.id}`, poster_path: null };
  }

  private paginate<T>(all: T[], page: number) {
    const total_pages = Math.ceil(all.length / PAGE);
    return { page, total_pages, total_results: all.length, results: all.slice((page - 1) * PAGE, page * PAGE) };
  }

  private res(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }
}

export function items(type: MT, ...ids: number[]): FakeItem[] {
  return ids.map((id) => ({ id, media_type: type }));
}
