import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { currentUserId } from "@/lib/auth/session";
import { errorMessages } from "@/components/labels";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const userId = await currentUserId().catch(() => null);
  const error = sp.error ? (errorMessages[sp.error] ?? "La connexion a échoué. Réessayez.") : null;

  return (
    <AppShell authed={!!userId}>
      {error ? (
        <div className="notice danger" role="alert">
          <strong>Connexion impossible</strong>
          {error}
        </div>
      ) : null}
      {sp.deleted ? (
        <div className="notice ok" role="status">
          <strong>Compte supprimé</strong>
          Vos données Lielu Lists ont été effacées et l&apos;accès TMDB a été révoqué.
        </div>
      ) : null}
      {sp.login === "required" && !userId ? (
        <div className="notice" role="status">Connectez-vous avec TMDB pour accéder à votre espace.</div>
      ) : null}

      <section className="hero">
        <p className="tagline">Lielu Lists — Your TMDB lists in Stremio</p>
        <h1>Vos listes TMDB, automatiquement dans Stremio.</h1>
        <p className="lead">
          Connectez votre compte TMDB, choisissez vos watchlists et listes personnelles : chacune devient un catalogue Stremio,
          tenu à jour toutes les 15 minutes, ajouts comme suppressions.
        </p>
        <div className="btn-row">
          {userId ? (
            <Link className="btn primary" href="/dashboard">Ouvrir mon tableau de bord</Link>
          ) : (
            <a className="btn primary" href="/api/auth/tmdb/login">Se connecter avec TMDB</a>
          )}
          <a className="btn" href="#fonctionnement">Comment ça marche</a>
        </div>
      </section>

      <section className="section" id="fonctionnement" aria-labelledby="how">
        <h2 id="how">Comment ça marche</h2>
        <ol className="steps">
          <li>
            <div>
              <h3>Autorisez Lielu Lists sur TMDB</h3>
              <p>Vous êtes redirigé vers themoviedb.org pour approuver l&apos;accès. Aucun mot de passe ne transite par Lielu Lists.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Choisissez vos catalogues</h3>
              <p>Watchlist films, watchlist séries, listes personnelles : activez celles que vous voulez voir, renommez-les si besoin. Films et séries restent séparés.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Installez votre addon personnel</h3>
              <p>Un bouton ouvre Stremio avec votre URL privée. Vos listes y restent synchronisées sans rien faire.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section" aria-labelledby="data">
        <h2 id="data">Vos données</h2>
        <div className="panel panel-pad stack">
          <p>L&apos;accès TMDB est chiffré en base et n&apos;apparaît jamais dans le navigateur ni dans l&apos;URL Stremio, qui utilise un identifiant aléatoire que vous pouvez régénérer.</p>
          <p className="muted">Vous pouvez déconnecter TMDB ou supprimer votre compte à tout moment depuis les paramètres ; la suppression efface toutes vos données.</p>
        </div>
      </section>
    </AppShell>
  );
}
