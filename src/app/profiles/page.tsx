import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProfileManager } from "@/components/ProfileManager";
import { requireOverview } from "@/lib/account/page-guard";
import { installUrls } from "@/lib/account/overview";
import { getEnabledCatalogs } from "@/lib/repo/catalogs";
import { decryptProfileToken, listProfiles, MAX_PROFILES } from "@/lib/repo/profiles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profils" };

export default async function Profiles() {
  const o = await requireOverview();
  const [profiles, catalogs] = await Promise.all([listProfiles(o.user.id), getEnabledCatalogs(o.user.id)]);
  const options = catalogs.map((c) => ({ id: c.id, label: `${c.name} · ${c.media_type === "movie" ? "Films" : "Séries"}` }));

  return (
    <AppShell authed>
      <div className="page-head">
        <h1>Profils</h1>
        <p>
          Un profil est une URL d&apos;installation Stremio qui n&apos;affiche qu&apos;une sélection de vos catalogues, par exemple pour les enfants ou pour un autre
          compte Stremio. Votre URL principale, elle, affiche toujours tous vos catalogues activés. Les listes se gèrent dans <Link href="/lists">Mes listes</Link>.
        </p>
      </div>
      <ProfileManager
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, catalogIds: p.catalog_ids, install: installUrls(decryptProfileToken(p)) }))}
        options={options}
        canCreate={profiles.length < MAX_PROFILES}
      />
      <p className="small muted" style={{ marginTop: 24 }}>
        Pour utiliser un profil sur un autre compte Stremio, installez son URL depuis ce compte. Un profil garde son propre nom dans Stremio : « Lielu Lists · nom du profil ».
      </p>
    </AppShell>
  );
}
