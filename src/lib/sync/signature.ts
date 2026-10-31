import { createHash } from "node:crypto";
import type { Page } from "@/lib/tmdb/pagination";

/**
 * Cheap change detectors used to skip unchanged lists between full refreshes.
 * - Custom lists: TMDB exposes number_of_items + updated_at in the account index.
 * - Watchlists: no updated_at, but sorted by created_at.desc any addition shows
 *   up on page 1 and any removal changes total_results.
 */
export function customListSignature(itemCount: number | null, updatedAt: string | null): string {
  return `c:${itemCount ?? "?"}:${updatedAt ?? "?"}`;
}

export function watchlistSignature(firstPage: Page<{ id: number; media_type?: string }>): string {
  const ids = firstPage.results.map((r) => `${r.media_type ?? ""}${r.id}`).join(",");
  return `w:${firstPage.total_results}:${createHash("sha1").update(ids).digest("hex").slice(0, 16)}`;
}
