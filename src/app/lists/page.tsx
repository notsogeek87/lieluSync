import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CatalogControl } from "@/components/CatalogControl";
import { CatalogOrder } from "@/components/CatalogOrder";
import { getEnabledCatalogs } from "@/lib/repo/catalogs";
import { kindLabel, listStatusLabel } from "@/components/labels";
import { requireOverview } from "@/lib/account/page-guard";
import { absoluteTime, plural, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mes listes" };

export default async function Lists() {
  const o = await requireOverview();
  const visible = o.lists.filter((l) => l.status !== "gone");
  const gone = o.lists.filter((l) => l.status === "gone");
  const order = (await getEnabledCatalogs(o.user.id)).map((c) => ({ id: c.id, name: c.name, typeLabel: c.media_type === "movie" ? "Films" : "Séries" }));

  return (
    <AppShell authed>
      <div className="page-head">
        <h1>Mes listes</h1>
        <p>Activez les catalogues à afficher dans Stremio. Une liste qui mélange films et séries donne deux catalogues séparés.</p>
      </div>

      {visible.length === 0 ? (
        <div className="notice" role="status">
          <strong>Aucune liste pour l&apos;instant</strong>
          {o.user.lastSuccessfulSyncAt
            ? "Votre compte TMDB ne contient pas encore de liste. Ajoutez des titres à votre watchlist ou créez une liste sur themoviedb.org."
            : "La première synchronisation est en cours ; actualisez la page dans un instant."}
        </div>
      ) : (
        <ul className="rows panel">
          {visible.map((l) => {
            const st = listStatusLabel[l.status] ?? { text: l.status, cls: "muted" };
            const total = l.movie_count + l.series_count;
            return (
              <li key={l.id}>
                <div className="row-head">
                  <div>
                    <div className="row-title">{l.kind === "custom" ? l.name : kindLabel[l.kind]}</div>
                    <div className="row-meta">
                      <span className="tag">{l.kind === "custom" ? "Liste" : "Watchlist"}</span>
                      <span>{plural(l.movie_count, "film", "films")}</span>
                      <span>{plural(l.series_count, "série", "séries")}</span>
                      <span title={absoluteTime(l.last_synced_at)}>Synchro {relativeTime(l.last_synced_at)}</span>
                    </div>
                  </div>
                  <span className={`status ${st.cls}`}>{st.text}</span>
                </div>
                {l.status === "error" && l.last_error ? <p className="small muted">Dernière erreur : {l.last_error}</p> : null}
                {l.catalogs.length ? (
                  <div className="catalogs">
                    {l.catalogs.map((c) => (
                      <CatalogControl
                        key={c.id}
                        id={c.id}
                        typeLabel={c.media_type === "movie" ? "Films" : "Séries"}
                        listName={l.name}
                        enabled={c.enabled}
                        customName={c.custom_name}
                        count={c.visible_count}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="small muted" style={{ marginTop: 8 }}>
                    {total === 0 ? "Liste vide : le catalogue apparaîtra dès qu'elle contiendra un film ou une série." : "Préparation du catalogue…"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {visible.length ? (
        <section className="section" aria-labelledby="order">
          <h2 id="order">Ordre sur l&apos;accueil Stremio</h2>
          <p className="muted small">Les catalogues activés apparaissent dans Stremio dans cet ordre.</p>
          <CatalogOrder key={order.map((c) => c.id).sort().join(",")} items={order} />
        </section>
      ) : null}

      {gone.length ? (
        <section className="section" aria-labelledby="gone">
          <h2 id="gone">Listes supprimées sur TMDB</h2>
          <p className="muted small">Elles ne sont plus proposées dans Stremio et seront effacées 7 jours après leur disparition.</p>
          <ul className="rows panel">
            {gone.map((l) => (
              <li key={l.id}>
                <div className="row-title">{l.name}</div>
                <div className="row-meta">Disparue {relativeTime(l.gone_at)}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="small muted" style={{ marginTop: 24 }}>
        Les changements de contenu (ajouts, suppressions) apparaissent dans Stremio sans rien faire. Après avoir activé, renommé ou
        réordonné des catalogues, utilisez <Link href="/stremio">Mes addons Stremio › Mettre à jour Lielu Lists</Link> pour que Stremio en tienne compte.
        Pour n&apos;afficher que certaines listes sur un appareil ou un compte, créez un <Link href="/profiles">profil</Link>.
      </p>
    </AppShell>
  );
}
