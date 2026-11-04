import { db, type Db } from "@/lib/db/client";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "@/lib/security/crypto";

export const MAX_PROFILES = 10;
const PROFILE_AAD = "stremio-profile";

export interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_enc: string;
  token_rotated_at: Date;
  created_at: Date;
}

export interface ProfileWithCatalogs extends ProfileRow {
  catalog_ids: string[];
}

function newProfileToken(): { token: string; hash: string; enc: string } {
  const token = randomToken(32);
  return { token, hash: hashToken(token, "config"), enc: encryptSecret(token, PROFILE_AAD) };
}

export function decryptProfileToken(p: Pick<ProfileRow, "token_enc">): string {
  return decryptSecret(p.token_enc, PROFILE_AAD);
}

/** Only catalogs owned by this user may be attached to a profile. */
async function ownedCatalogIds(userId: string, ids: string[], sql: Db): Promise<string[] | null> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await sql<{ id: string }[]>`select id from selected_catalogs where user_id = ${userId} and id in ${sql(unique)}`;
  return rows.length === unique.length ? unique : null;
}

export type ProfileResult = { ok: true; id: string } | { ok: false; error: "limit" | "invalid_catalogs" | "not_found" };

export async function createProfile(userId: string, name: string, catalogIds: string[], sql = db()): Promise<ProfileResult> {
  return sql.begin(async (tx) => {
    const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from profiles where user_id = ${userId}`;
    if (n >= MAX_PROFILES) return { ok: false, error: "limit" } as const;
    const owned = await ownedCatalogIds(userId, catalogIds, tx);
    if (!owned) return { ok: false, error: "invalid_catalogs" } as const;
    const t = newProfileToken();
    const [row] = await tx<{ id: string }[]>`
      insert into profiles (user_id, name, token_hash, token_enc) values (${userId}, ${name}, ${t.hash}, ${t.enc}) returning id`;
    await setProfileCatalogs(tx, row!.id, owned);
    return { ok: true, id: row!.id } as const;
  });
}

async function setProfileCatalogs(tx: Db, profileId: string, catalogIds: string[]): Promise<void> {
  await tx`delete from profile_catalogs where profile_id = ${profileId}`;
  if (catalogIds.length) {
    await tx`insert into profile_catalogs (profile_id, catalog_id) select ${profileId}, c from unnest(${catalogIds}::uuid[]) as c`;
  }
}

export async function updateProfile(userId: string, profileId: string, patch: { name?: string; catalogIds?: string[] }, sql = db()): Promise<ProfileResult> {
  return sql.begin(async (tx) => {
    const [p] = await tx<{ id: string }[]>`select id from profiles where id = ${profileId} and user_id = ${userId} for update`;
    if (!p) return { ok: false, error: "not_found" } as const;
    if (patch.catalogIds) {
      const owned = await ownedCatalogIds(userId, patch.catalogIds, tx);
      if (!owned) return { ok: false, error: "invalid_catalogs" } as const;
      await setProfileCatalogs(tx, profileId, owned);
    }
    await tx`update profiles set name = coalesce(${patch.name ?? null}, name), updated_at = now() where id = ${profileId}`;
    return { ok: true, id: profileId } as const;
  });
}

export async function deleteProfile(userId: string, profileId: string, sql: Db = db()): Promise<boolean> {
  const rows = await sql`delete from profiles where id = ${profileId} and user_id = ${userId} returning id`;
  return rows.length === 1;
}

/** New install URL for the profile; the previous one stops working immediately. */
export async function rotateProfileToken(userId: string, profileId: string, sql: Db = db()): Promise<string | null> {
  const t = newProfileToken();
  const rows = await sql`
    update profiles set token_hash = ${t.hash}, token_enc = ${t.enc}, token_rotated_at = now(), updated_at = now()
    where id = ${profileId} and user_id = ${userId} returning id`;
  return rows.length === 1 ? t.token : null;
}

export async function listProfiles(userId: string, sql: Db = db()): Promise<ProfileWithCatalogs[]> {
  return sql<ProfileWithCatalogs[]>`
    select p.*, coalesce(array(select pc.catalog_id from profile_catalogs pc where pc.profile_id = p.id), '{}') as catalog_ids
    from profiles p where p.user_id = ${userId} order by p.created_at`;
}

/** Resolve a profile from the token in its install URL. */
export async function getProfileByToken(token: string, sql: Db = db()): Promise<ProfileRow | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await sql<ProfileRow[]>`select * from profiles where token_hash = ${hashToken(token, "config")}`;
  return row ?? null;
}
