import { TmdbHttp, type TmdbHttpOptions } from "./http";
import { fetchAllPages, type FetchAllResult } from "./pagination";
import * as S from "./schemas";
import type { MediaType } from "./schemas";

export const TMDB_APPROVE_URL = "https://www.themoviedb.org/auth/access";
export const METADATA_LANGUAGE = "fr-FR";

export type WatchlistType = MediaType;

/**
 * Typed wrapper around the TMDB endpoints used by Lielu Lists.
 * - App-level calls use the application "API Read Access Token" (v4 bearer).
 * - User-level calls use the user's v4 access token (obtained via the v4 auth flow).
 */
export class TmdbClient {
  readonly http: TmdbHttp;

  constructor(
    private readonly appToken: string,
    opts: TmdbHttpOptions = {},
  ) {
    this.http = new TmdbHttp(opts);
  }

  // ------------------------------------------------------------- auth (v4)
  async createRequestToken(redirectTo: string): Promise<string> {
    const r = await this.http.request({
      method: "POST",
      path: "/4/auth/request_token",
      bearer: this.appToken,
      body: { redirect_to: redirectTo },
      schema: S.requestTokenResponse,
    });
    return r.request_token;
  }

  approveUrl(requestToken: string): string {
    return `${TMDB_APPROVE_URL}?request_token=${encodeURIComponent(requestToken)}`;
  }

  async createAccessToken(requestToken: string): Promise<{ accessToken: string; accountObjectId: string }> {
    const r = await this.http.request({
      method: "POST",
      path: "/4/auth/access_token",
      bearer: this.appToken,
      body: { request_token: requestToken },
      schema: S.accessTokenResponse,
    });
    return { accessToken: r.access_token, accountObjectId: r.account_id };
  }

  /** Revokes a user access token on TMDB (v4 "Logout"). */
  async revokeAccessToken(accessToken: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: "/4/auth/access_token",
      bearer: this.appToken,
      body: { access_token: accessToken },
      schema: S.genericStatus,
    });
  }

  /**
   * Profile lookup. TMDB v4 has no profile endpoint, so we briefly convert the
   * v4 token into a v3 session, read /3/account, then delete that session.
   */
  async getProfile(accessToken: string): Promise<{ id: number; username: string | null; name: string | null; avatarPath: string | null }> {
    const { session_id } = await this.http.request({
      method: "POST",
      path: "/3/authentication/session/convert/4",
      bearer: this.appToken,
      body: { access_token: accessToken },
      schema: S.sessionConvertResponse,
    });
    try {
      const acc = await this.http.request({
        path: "/3/account",
        bearer: this.appToken,
        query: { session_id },
        schema: S.accountDetailsResponse,
      });
      return {
        id: acc.id,
        username: acc.username ?? null,
        name: acc.name || null,
        avatarPath: acc.avatar?.tmdb?.avatar_path ?? null,
      };
    } finally {
      await this.http
        .request({
          method: "DELETE",
          path: "/3/authentication/session",
          bearer: this.appToken,
          body: { session_id },
          schema: S.genericStatus,
        })
        .catch(() => undefined);
    }
  }

  // ------------------------------------------------------------- lists (v4, user token)
  async getAccountListsPage(userToken: string, accountObjectId: string, page: number) {
    return this.http.request({
      path: `/4/account/${encodeURIComponent(accountObjectId)}/lists`,
      bearer: userToken,
      query: { page },
      schema: S.accountLists,
    });
  }

  async getAllAccountLists(userToken: string, accountObjectId: string): Promise<FetchAllResult<S.AccountListSummary>> {
    return fetchAllPages((page) => this.getAccountListsPage(userToken, accountObjectId, page), { maxPages: 50 });
  }

  async getWatchlistPage(userToken: string, accountObjectId: string, type: WatchlistType, page: number) {
    return this.http.request({
      path: `/4/account/${encodeURIComponent(accountObjectId)}/${type}/watchlist`,
      bearer: userToken,
      query: { page, language: METADATA_LANGUAGE, sort_by: "created_at.desc" },
      schema: S.pagedItems,
    });
  }

  async getListPage(userToken: string, listId: string, page: number) {
    return this.http.request({
      path: `/4/list/${encodeURIComponent(listId)}`,
      bearer: userToken,
      query: { page, language: METADATA_LANGUAGE },
      schema: S.listDetails,
    });
  }

  // ------------------------------------------------------------- metadata (v3, app token)
  async getMovie(id: number) {
    return this.http.request({
      path: `/3/movie/${id}`,
      bearer: this.appToken,
      query: {
        language: METADATA_LANGUAGE,
        append_to_response: "external_ids,translations,images",
        include_image_language: "fr,null,en",
      },
      schema: S.movieDetails,
    });
  }

  async getTv(id: number) {
    return this.http.request({
      path: `/3/tv/${id}`,
      bearer: this.appToken,
      query: {
        language: METADATA_LANGUAGE,
        append_to_response: "external_ids,translations,images",
        include_image_language: "fr,null,en",
      },
      schema: S.tvDetails,
    });
  }

  async getSeason(tvId: number, season: number) {
    return this.http.request({
      path: `/3/tv/${tvId}/season/${season}`,
      bearer: this.appToken,
      query: { language: METADATA_LANGUAGE },
      schema: S.seasonDetails,
    });
  }
}
