import { TmdbError } from "./errors";
import { mapConcurrent } from "./limiter";

export interface Page<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

export interface FetchAllOptions {
  /** Hard cap on pages (protects function duration). Exceeding it is an error, never a silent truncation. */
  maxPages?: number;
  concurrency?: number;
  /** Already fetched first page (avoids a duplicate request). */
  firstPage?: Page<unknown>;
}

export interface FetchAllResult<T> {
  items: T[];
  totalResults: number;
  totalPages: number;
}

/**
 * Fetch every page of a TMDB paginated endpoint. The result is only returned
 * when ALL pages were fetched and the collection stayed stable during the
 * fetch (same total on every page); otherwise an error is thrown so callers
 * never commit a partial list (which would look like deletions).
 */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<Page<T>>, opts: FetchAllOptions = {}): Promise<FetchAllResult<T>> {
  const maxPages = opts.maxPages ?? 500;
  const first = (opts.firstPage as Page<T> | undefined) ?? (await fetchPage(1));
  const totalPages = Math.max(1, first.total_pages);
  if (totalPages > maxPages) {
    throw new TmdbError("invalid_response", `list too large: ${totalPages} pages exceeds the ${maxPages} page limit`);
  }
  const rest = totalPages > 1 ? Array.from({ length: totalPages - 1 }, (_, i) => i + 2) : [];
  const pages = await mapConcurrent(rest, opts.concurrency ?? 4, (p) => fetchPage(p));
  for (const p of pages) {
    if (p.total_results !== first.total_results || p.total_pages !== first.total_pages) {
      throw new TmdbError("invalid_response", "list changed while it was being fetched");
    }
  }
  const all = [first, ...pages];
  // Every page but the last must be full, and the last one non-empty: a short
  // page means TMDB returned an incomplete result, which must never be
  // committed (missing items would be treated as deletions).
  if (totalPages > 1) {
    const pageSize = first.results.length;
    const shortPage = all.slice(0, -1).some((p) => p.results.length !== pageSize || pageSize === 0);
    if (shortPage || all[all.length - 1]!.results.length === 0) {
      throw new TmdbError("invalid_response", "incomplete pagination result");
    }
  }
  const items = all.flatMap((p) => p.results);
  return { items, totalResults: first.total_results, totalPages };
}
