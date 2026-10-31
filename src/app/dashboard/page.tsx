import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SyncButton } from "@/components/SyncButton";
import { healthLabel, jobStatusLabel, triggerLabel } from "@/components/labels";
import { requireOverview } from "@/lib/account/page-guard";
import { absoluteTime, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tableau de bord" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const o = await requireOverview();
  const sp = await searchParams;
  const health = healthLabel[o.health];
  const connected = o.tmdb?.status === "connected";

  return (
    <AppShell authed>
      <div className="page-head">
        <h1>Tableau de bord</h1>
        <p>
          <span className={`status ${health.cls}`}>{health.text}</span>
        </p>
      </div>

      {sp.welcome ? (
        <div className="notice ok" role="status">
          <strong>Compte TMDB connecté</strong>
          La première synchronisation est en cours. Vos listes apparaîtront dans quelques instants ; installez ensuite l&apos;addon depuis <Link href="/install">Installation</Link>.
        </div>
      ) : null}
      {!connected ? (
        <div className="notice danger" role="alert">
          <strong>{o.tmdb?.status === "revoked" ? "Accès TMDB révoqué" : "TMDB n'est pas connecté"}</strong>
          La synchronisation est en pause ; vos catalogues Stremio restent disponibles avec les dernières données.{" "}
          <a href="/api/auth/tmdb/login">Reconnecter TMDB</a>
        </div>
      ) : null}

      <dl className="facts" aria-label="Résumé">
        <div>
          <dt>Compte TMDB</dt>
          <dd>{o.tmdb?.username ?? o.tmdb?.displayName ?? "—"}<br /><small>{connected ? "connecté" : "déconnecté"}</small></dd>
        </div>
        <div>
          <dt>Listes détectées</dt>
          <dd>{o.stats.lists}</dd>
        </div>
        <div>
          <dt>Catalogues activés</dt>
          <dd>{o.stats.enabledCatalogs}</dd>
        </div>
        <div>
          <dt>Films synchronisés</dt>
          <dd>{o.stats.movies.toLocaleString("fr-FR")}</dd>
        </div>
        <div>
          <dt>Séries synchronisées</dt>
          <dd>{o.stats.series.toLocaleString("fr-FR")}</dd>
        </div>
        <div>
          <dt>Dernière synchronisation</dt>
          <dd title={absoluteTime(o.user.lastSuccessfulSyncAt)}>
            {o.user.syncing ? "en cours…" : relativeTime(o.user.lastSuccessfulSyncAt)}
            <br />
            <small>toutes les {o.syncIntervalMinutes} min</small>
          </dd>
        </div>
      </dl>

      <section className="section" aria-labelledby="sync">
        <div className="section-head">
          <h2 id="sync">Synchronisation</h2>
          <span className="small muted">Prochaine : {relativeTime(o.user.nextSyncAt)}</span>
        </div>
        <div className="panel panel-pad stack">
          <p className="muted">
            Les listes sont relues automatiquement. En cas d&apos;erreur TMDB, les catalogues gardent leurs dernières données valides et la liste est réessayée.
            {o.stats.listsInError > 0 ? ` ${o.stats.listsInError} liste(s) en erreur actuellement.` : ""}
          </p>
          <SyncButton disabled={!connected} />
        </div>
        {o.lastJobs.length ? (
          <ul className="rows panel" aria-label="Dernières synchronisations">
            {o.lastJobs.map((j, i) => (
              <li key={i}>
                <div className="row-head">
                  <span className="row-title">{jobStatusLabel[j.status] ?? j.status}</span>
                  <span className="small muted" title={absoluteTime(j.started_at)}>{relativeTime(j.started_at)}</span>
                </div>
                <div className="row-meta">
                  <span>{triggerLabel[j.trigger] ?? j.trigger}</span>
                  <span>+{j.items_added} / −{j.items_removed}</span>
                  {j.error ? <span>{j.error}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="section" aria-labelledby="next">
        <h2 id="next">Raccourcis</h2>
        <div className="btn-row">
          <Link className="btn" href="/lists">Choisir mes listes</Link>
          <Link className="btn" href="/install">Installer dans Stremio</Link>
        </div>
      </section>
    </AppShell>
  );
}
