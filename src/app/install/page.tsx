import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CopyField } from "@/components/CopyField";
import { requireOverview } from "@/lib/account/page-guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Installation Stremio" };

export default async function Install() {
  const o = await requireOverview();
  const { manifestUrl, stremioUrl, webInstallUrl } = o.install;

  return (
    <AppShell authed>
      <div className="page-head">
        <h1>Installer dans Stremio</h1>
        <p>Cette URL est personnelle : elle donne accès à vos catalogues sans connexion TMDB. Ne la partagez pas ; vous pouvez la régénérer dans les paramètres.</p>
      </div>

      <div className="panel panel-pad stack">
        <div className="btn-row">
          <a className="btn primary" href={stremioUrl}>Installer dans Stremio</a>
          <a className="btn" href={webInstallUrl} target="_blank" rel="noreferrer noopener">Ouvrir Stremio Web</a>
        </div>
        <CopyField label="URL du manifest" value={manifestUrl} />
      </div>

      <section className="section" aria-labelledby="profiles">
        <h2 id="profiles">Profils</h2>
        <div className="panel panel-pad stack">
          <p className="muted">Créez des URL supplémentaires qui n&apos;affichent qu&apos;une sélection de vos listes (enfants, autre compte Stremio…).</p>
          <div className="btn-row">
            <Link className="btn" href="/profiles">Gérer mes profils</Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="how">
        <h2 id="how">Ajouter l&apos;addon</h2>
        <ol className="steps">
          <li>
            <div>
              <h3>Ordinateur, Android, iPhone</h3>
              <p>Touchez « Installer dans Stremio » : l&apos;application s&apos;ouvre et propose l&apos;installation. Sinon, copiez l&apos;URL, ouvrez Stremio › Addons, collez-la dans la barre de recherche et validez.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Android TV et autres téléviseurs</h3>
              <p>Installez l&apos;addon depuis votre téléphone ou ordinateur avec le même compte Stremio : les addons sont synchronisés sur tous vos appareils connectés.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Retrouvez vos listes</h3>
              <p>Vos catalogues apparaissent sur l&apos;accueil et dans Découvrir, sous le nom de chaque liste suivi de « Movie » ou « Series ».</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section" aria-labelledby="order">
        <h2 id="order">Mettre vos listes en haut de l&apos;accueil</h2>
        <div className="panel panel-pad stack">
          <p className="muted">
            Stremio affiche les catalogues dans l&apos;ordre des addons installés et l&apos;application ne permet pas de les réordonner.
            Lielu Lists peut le faire pour vous, directement sur votre compte Stremio.
          </p>
          <div className="btn-row">
            <Link className="btn primary" href="/stremio">Gérer mes addons Stremio</Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="notes">
        <h2 id="notes">Bon à savoir</h2>
        <div className="panel panel-pad stack small">
          <p>Les titres sont exposés avec leur identifiant IMDb : la fiche détaillée et les sources de lecture viennent de vos autres addons (Cinemeta, etc.), comme pour n&apos;importe quel catalogue.</p>
          <p>Les rares titres sans identifiant IMDb utilisent un identifiant TMDB ; Lielu Lists fournit alors lui-même leur fiche, mais la plupart des addons de sources ne les reconnaissent pas.</p>
          <p>Titres, résumés et affiches sont en français lorsque TMDB les propose, sinon dans la langue d&apos;origine.</p>
        </div>
      </section>
    </AppShell>
  );
}
