import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ActionButton } from "@/components/ActionButton";
import { DeleteAccount } from "@/components/DeleteAccount";
import { SyncButton } from "@/components/SyncButton";
import { requireOverview } from "@/lib/account/page-guard";
import { absoluteTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Paramètres" };

export default async function Settings() {
  const o = await requireOverview();
  const connected = o.tmdb?.status === "connected";

  return (
    <AppShell authed>
      <div className="page-head">
        <h1>Paramètres</h1>
      </div>

      <section className="section" aria-labelledby="tmdb" style={{ marginTop: 0 }}>
        <h2 id="tmdb">Compte TMDB</h2>
        <div className="panel panel-pad stack">
          <p>
            {o.tmdb ? (
              <>
                <strong>{o.tmdb.username ?? o.tmdb.displayName ?? "Compte TMDB"}</strong>{" "}
                <span className={`status ${connected ? "ok" : "danger"}`}>{connected ? "connecté" : o.tmdb.status === "revoked" ? "accès révoqué" : "déconnecté"}</span>
              </>
            ) : (
              "Aucun compte TMDB lié."
            )}
          </p>
          {o.tmdb ? <p className="small muted">Connecté le {absoluteTime(o.tmdb.connectedAt)}</p> : null}
          <div className="btn-row">
            <a className="btn" href="/api/auth/tmdb/login">{connected ? "Reconnecter TMDB" : "Connecter TMDB"}</a>
            {connected ? (
              <ActionButton
                endpoint="/api/tmdb/disconnect"
                label="Déconnecter TMDB"
                variant="danger"
                confirm="Déconnecter TMDB ? L'accès sera révoqué et la synchronisation mise en pause. Vos catalogues Stremio gardent leurs dernières données."
                success="TMDB est déconnecté et l'accès a été révoqué."
              />
            ) : null}
          </div>
          <p className="small muted">Vous pouvez aussi retirer l&apos;autorisation depuis les paramètres de votre compte sur themoviedb.org.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="sync">
        <h2 id="sync">Synchronisation</h2>
        <div className="panel panel-pad stack">
          <p className="muted">Automatique toutes les {o.syncIntervalMinutes} minutes. Vous pouvez la lancer manuellement (une fois par minute au plus).</p>
          <SyncButton disabled={!connected} />
        </div>
      </section>

      <section className="section" aria-labelledby="url">
        <h2 id="url">URL Stremio</h2>
        <div className="panel panel-pad stack">
          <p className="muted">Régénérez l&apos;URL si elle a été partagée par erreur. L&apos;ancienne cessera immédiatement de fonctionner ; il faudra réinstaller l&apos;addon dans Stremio.</p>
          <p className="small muted">Dernière génération : {absoluteTime(o.user.configRotatedAt)}</p>
          <ActionButton
            endpoint="/api/config/regenerate"
            label="Régénérer l'URL"
            confirm="Régénérer l'URL ? L'addon actuellement installé dans Stremio cessera de fonctionner."
            redirectTo="/install"
          />
        </div>
      </section>

      <section className="section" aria-labelledby="session">
        <h2 id="session">Session</h2>
        <div className="panel panel-pad stack">
          <p className="muted">Se déconnecter de Lielu Lists sur cet appareil. La synchronisation continue.</p>
          <ActionButton endpoint="/api/auth/logout" label="Se déconnecter" redirectTo="/" />
        </div>
      </section>

      <section className="section" aria-labelledby="delete">
        <h2 id="delete">Supprimer mon compte</h2>
        <div className="panel panel-pad stack">
          <p className="muted">
            Supprime votre compte Lielu Lists et toutes les données associées (listes, catalogues, historique), révoque l&apos;accès TMDB et désactive l&apos;URL Stremio. Action irréversible.
          </p>
          <DeleteAccount />
        </div>
      </section>
    </AppShell>
  );
}
