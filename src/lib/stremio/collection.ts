/**
 * Pure helpers to edit a Stremio account's addon collection (the list returned
 * by api.strem.io AddonCollectionGet). Used client-side only: the Stremio
 * credentials never reach the Lielu Lists server.
 */
export interface StremioAddonDescriptor {
  transportUrl: string;
  transportName?: string;
  manifest: { id: string; name: string; version?: string; logo?: string; description?: string; [k: string]: unknown };
  flags?: { official?: boolean; protected?: boolean; [k: string]: unknown };
  [k: string]: unknown;
}

export const LIELU_ADDON_ID = "eu.lielu.lists";

export function isProtected(a: StremioAddonDescriptor): boolean {
  return !!a.flags?.protected;
}

export function isLielu(a: StremioAddonDescriptor): boolean {
  return a.manifest?.id === LIELU_ADDON_ID;
}

/**
 * Installs (or refreshes) Lielu Lists at the top of the collection, removing
 * any other Lielu Lists entry (old domain, regenerated URL…).
 */
export function placeLieluFirst(addons: StremioAddonDescriptor[], manifestUrl: string, manifest: StremioAddonDescriptor["manifest"]): StremioAddonDescriptor[] {
  const others = addons.filter((a) => !isLielu(a));
  const entry: StremioAddonDescriptor = { transportUrl: manifestUrl, transportName: "http", manifest, flags: { official: false, protected: false } };
  return [entry, ...others];
}

export function moveAddon(addons: StremioAddonDescriptor[], index: number, delta: -1 | 1): StremioAddonDescriptor[] {
  const target = index + delta;
  if (index < 0 || index >= addons.length || target < 0 || target >= addons.length) return addons;
  const copy = [...addons];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}

export function removeAddon(addons: StremioAddonDescriptor[], index: number): StremioAddonDescriptor[] {
  const a = addons[index];
  if (!a || isProtected(a)) return addons;
  return addons.filter((_, i) => i !== index);
}

/** Lielu entries that do not point to the current URL (stale installs). */
export function staleLieluEntries(addons: StremioAddonDescriptor[], manifestUrl: string): number {
  return addons.filter((a) => isLielu(a) && a.transportUrl !== manifestUrl).length;
}

/** Identity of what Stremio displays from a manifest (catalog order, names, types). */
export function manifestSignature(m: StremioAddonDescriptor["manifest"] | undefined): string {
  const cats = (m?.catalogs as { type: string; id: string; name: string }[] | undefined) ?? [];
  return JSON.stringify([m?.version ?? "", cats.map((c) => [c.type, c.id, c.name])]);
}

/** Replaces the stored manifest of the current Lielu install, keeping its position. */
export function refreshLieluManifest(addons: StremioAddonDescriptor[], manifestUrl: string, manifest: StremioAddonDescriptor["manifest"]): StremioAddonDescriptor[] {
  return addons.map((a) => (isLielu(a) && a.transportUrl === manifestUrl ? { ...a, manifest } : a));
}
