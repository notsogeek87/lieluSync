/**
 * Local HTTP server wrapping FakeTmdb, for end-to-end smoke tests of a real
 * `next start` instance (TMDB_API_BASE_URL=http://127.0.0.1:4010).
 * Extra endpoint: POST /__approve {request_token, account} simulates the user
 * approving the request on themoviedb.org.
 */
import http from "node:http";
import { FakeTmdb, items } from "../helpers/fake-tmdb";

const fake = new FakeTmdb();
const acc = fake.addAccount("e2e-account");
acc.watchlist.movie = items("movie", ...Array.from({ length: 120 }, (_, i) => 100 + i));
acc.watchlist.tv = items("tv", 1399, 66732);
acc.lists.push({ id: 7001, name: "Charlie", items: [...items("movie", 100, 101), ...items("tv", 1399)], updated_at: "2026-10-01", public: false });
acc.lists.push({ id: 7002, name: "Films à voir", items: items("movie", 102, 103, 104), updated_at: "2026-10-01", public: true });
fake.setMedia("movie", 100, { title: "The Matrix", frTitle: "Matrix", overview: "Un pirate informatique découvre la vérité.", frPoster: true, imdb: "tt0133093" });
fake.setMedia("tv", 66732, { title: "Indie Show", imdb: null, overview: "Série sans identifiant IMDb." });

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks).toString();
  if (req.url === "/__approve") {
    const { request_token, account } = JSON.parse(body);
    const rt = fake.requestTokens.get(request_token);
    if (rt) rt.approvedFor = account;
    res.writeHead(rt ? 200 : 404).end(JSON.stringify({ redirectTo: rt?.redirectTo ?? null }));
    return;
  }
  if (req.url === "/__state") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ revoked: fake.revoked.length, calls: fake.calls.length }));
    return;
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
  const r = await fake.fetch(`http://fake${req.url}`, { method: req.method, headers, body: body || undefined });
  res.writeHead(r.status, { "content-type": "application/json" }).end(await r.text());
});
server.listen(4010, "127.0.0.1", () => console.log("fake TMDB on :4010"));
