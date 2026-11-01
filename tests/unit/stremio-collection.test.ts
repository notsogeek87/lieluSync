import { describe, expect, it } from "vitest";
import { moveAddon, placeLieluFirst, removeAddon, staleLieluEntries, type StremioAddonDescriptor } from "@/lib/stremio/collection";

const mk = (id: string, url: string, prot = false): StremioAddonDescriptor => ({ transportUrl: url, manifest: { id, name: id }, flags: { protected: prot } });
const cinemeta = mk("com.linvo.cinemeta", "https://v3-cinemeta.strem.io/manifest.json", true);
const torrent = mk("x.streams", "https://streams.example/manifest.json");
const oldLielu = mk("eu.lielu.lists", "https://lielu-sync.vercel.app/u/OLD/manifest.json");
const NEW = "https://lists.lielu.eu/u/NEW/manifest.json";

describe("Stremio collection editing", () => {
  it("puts Lielu Lists first and drops stale Lielu entries", () => {
    const out = placeLieluFirst([cinemeta, oldLielu, torrent], NEW, { id: "eu.lielu.lists", name: "Lielu Lists" });
    expect(out.map((a) => a.transportUrl)).toEqual([NEW, cinemeta.transportUrl, torrent.transportUrl]);
    expect(staleLieluEntries([cinemeta, oldLielu], NEW)).toBe(1);
  });
  it("moves within bounds only", () => {
    expect(moveAddon([cinemeta, torrent], 1, -1).map((a) => a.manifest.id)).toEqual(["x.streams", "com.linvo.cinemeta"]);
    expect(moveAddon([cinemeta, torrent], 0, -1)).toEqual([cinemeta, torrent]);
  });
  it("never removes protected addons", () => {
    expect(removeAddon([cinemeta, torrent], 0)).toHaveLength(2);
    expect(removeAddon([cinemeta, torrent], 1)).toEqual([cinemeta]);
  });
});

import { manifestSignature, refreshLieluManifest } from "@/lib/stremio/collection";
describe("manifest refresh", () => {
  it("detects catalog order changes and updates in place", () => {
    const a = { id: "eu.lielu.lists", name: "Lielu Lists", catalogs: [{ type: "movie", id: "ll-1", name: "A" }, { type: "movie", id: "ll-2", name: "B" }] };
    const b = { ...a, catalogs: [a.catalogs[1], a.catalogs[0]] };
    expect(manifestSignature(a)).not.toBe(manifestSignature(b));
    const cinemeta = mk("com.linvo.cinemeta", "https://v3-cinemeta.strem.io/manifest.json", true);
    const out = refreshLieluManifest([cinemeta, { transportUrl: NEW, manifest: a }], NEW, b);
    expect(out[0]).toBe(cinemeta);
    expect(manifestSignature(out[1]!.manifest)).toBe(manifestSignature(b));
  });
});
