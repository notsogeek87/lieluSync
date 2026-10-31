import pkg from "../../../package.json";
import { catalogIdFor, toStremioType, TMDB_PREFIX } from "./ids";
import type { MediaType } from "@/lib/tmdb/schemas";

export const ADDON_ID = "eu.lielu.lists";
export const ADDON_NAME = "Lielu Lists";
export const TAGLINE = "Your TMDB lists in Stremio";

export interface ManifestCatalogInput {
  id: string;
  media_type: MediaType;
  name: string;
}

export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  logo?: string;
  resources: (string | { name: string; types: string[]; idPrefixes?: string[] })[];
  types: string[];
  idPrefixes?: string[];
  catalogs: { type: string; id: string; name: string; extra?: { name: string; isRequired?: boolean }[] }[];
  behaviorHints: { configurable: boolean; configurationRequired: boolean };
}

/**
 * Per-user manifest. Each enabled list/type pair becomes one catalog.
 * Stremio displays catalogs as "<name> - <type>", so a mixed TMDB list shows
 * as two rows (films / séries) and contents never mix.
 */
export function buildManifest(appUrl: string, catalogs: ManifestCatalogInput[]): StremioManifest {
  return {
    id: ADDON_ID,
    version: pkg.version,
    name: ADDON_NAME,
    description: `${ADDON_NAME} — ${TAGLINE}. Vos listes TMDB (watchlists et listes personnelles) synchronisées automatiquement dans Stremio. Édité par Lielu.`,
    logo: `${appUrl}/logo-256.png`,
    resources: ["catalog", { name: "meta", types: ["movie", "series"], idPrefixes: [TMDB_PREFIX] }],
    types: ["movie", "series"],
    idPrefixes: [TMDB_PREFIX],
    catalogs: catalogs.map((c) => ({
      type: toStremioType(c.media_type),
      id: catalogIdFor(c.id),
      name: c.name,
      extra: [{ name: "skip", isRequired: false }],
    })),
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}
