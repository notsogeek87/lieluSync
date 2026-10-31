"use client";

import { useState } from "react";
import { isLielu, isProtected, moveAddon, placeLieluFirst, removeAddon, staleLieluEntries, type StremioAddonDescriptor } from "@/lib/stremio/collection";

/**
 * Edits the user's Stremio addon collection directly from the browser.
 * Requests go to api.strem.io only: credentials and the Stremio session key
 * stay in this page's memory and are never sent to Lielu Lists.
 */
const API = "https://api.strem.io/api/";

async function stremio<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { result?: T; error?: { message?: string } } | null;
  if (!data || data.error || data.result == null) throw new Error(data?.error?.message ?? "Réponse inattendue de Stremio");
  return data.result;
}

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/password|user not found|wrong/i.test(m)) return "E-mail ou mot de passe Stremio incorrect.";
  if (/session/i.test(m)) return "Session Stremio expirée ou clé invalide. Reconnectez-vous.";
  if (/fetch|network/i.test(m)) return "Stremio est injoignable. Vérifiez votre connexion.";
  return m;
}

export function StremioManager({ manifestUrl }: { manifestUrl: string }) {
  const [authKey, setAuthKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "key">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [addons, setAddons] = useState<StremioAddonDescriptor[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "danger" | "warn"; text: string } | null>(null);

  async function load(key: string) {
    const r = await stremio<{ addons: StremioAddonDescriptor[] }>("addonCollectionGet", { type: "AddonCollectionGet", authKey: key, update: true });
    setAddons(r.addons);
    setDirty(false);
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy("connect");
    setMsg(null);
    try {
      let key = pastedKey.replaceAll('"', "").trim();
      if (mode === "password") {
        const r = await stremio<{ authKey: string }>("login", { authKey: null, email: email.trim(), password });
        key = r.authKey;
      }
      await load(key);
      setAuthKey(key);
      setPassword("");
    } catch (err) {
      setMsg({ kind: "danger", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function installFirst() {
    if (!addons) return;
    setBusy("install");
    setMsg(null);
    try {
      const res = await fetch(manifestUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("Impossible de lire votre manifest Lielu Lists.");
      const manifest = (await res.json()) as StremioAddonDescriptor["manifest"];
      setAddons(placeLieluFirst(addons, manifestUrl, manifest));
      setDirty(true);
      setMsg({ kind: "warn", text: "Lielu Lists est placé en tête. Enregistrez pour l'appliquer à Stremio." });
    } catch (err) {
      setMsg({ kind: "danger", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!authKey || !addons) return;
    setBusy("save");
    setMsg(null);
    try {
      await stremio("addonCollectionSet", { type: "AddonCollectionSet", authKey, addons });
      await load(authKey);
      setMsg({ kind: "ok", text: "Enregistré dans Stremio. Relancez l'application Stremio pour voir le nouvel ordre." });
    } catch (err) {
      setMsg({ kind: "danger", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  function disconnect() {
    setAuthKey(null);
    setAddons(null);
    setPastedKey("");
    setDirty(false);
    setMsg(null);
  }

  if (!authKey || !addons) {
    return (
      <form className="panel panel-pad stack" onSubmit={connect}>
        <div className="btn-row" role="radiogroup" aria-label="Méthode de connexion">
          <button type="button" role="radio" aria-checked={mode === "password"} className={`btn${mode === "password" ? " primary" : ""}`} onClick={() => setMode("password")}>E-mail et mot de passe</button>
          <button type="button" role="radio" aria-checked={mode === "key"} className={`btn${mode === "key" ? " primary" : ""}`} onClick={() => setMode("key")}>Clé de session</button>
        </div>
        {mode === "password" ? (
          <>
            <div className="field">
              <label htmlFor="st-email">E-mail Stremio</label>
              <input id="st-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            </div>
            <div className="field">
              <label htmlFor="st-pass">Mot de passe Stremio</label>
              <input id="st-pass" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="st-key">Clé de session Stremio (authKey)</label>
            <input id="st-key" className="input mono" autoComplete="off" spellCheck={false} required value={pastedKey} onChange={(e) => setPastedKey(e.currentTarget.value)} />
            <p className="small muted">
              Pour les comptes créés avec Google, Facebook ou Apple : sur web.stremio.com connecté, ouvrez la console du navigateur et tapez{" "}
              <code>JSON.parse(localStorage.getItem(&quot;profile&quot;)).auth.key</code>
            </p>
          </div>
        )}
        <button type="submit" className="btn primary" disabled={busy !== null}>{busy === "connect" ? "Connexion…" : "Se connecter à Stremio"}</button>
        {msg ? <p role="alert" className={`small status ${msg.kind}`}>{msg.text}</p> : null}
        <p className="small muted">
          Vos identifiants sont envoyés directement à Stremio (api.strem.io) depuis votre navigateur. Lielu Lists ne les reçoit pas et ne conserve rien : la session est oubliée dès que vous quittez la page.
        </p>
      </form>
    );
  }

  const stale = staleLieluEntries(addons, manifestUrl);
  const installed = addons.some((a) => isLielu(a) && a.transportUrl === manifestUrl);
  const first = addons[0] && isLielu(addons[0]) && addons[0].transportUrl === manifestUrl;

  return (
    <div className="stack">
      <div className="panel panel-pad stack">
        <p>
          {first ? <span className="status ok">Lielu Lists est en tête</span> : installed ? <span className="status warn">Lielu Lists est installé, mais pas en tête</span> : <span className="status danger">Lielu Lists n&apos;est pas installé sur ce compte</span>}
        </p>
        {stale ? <p className="small muted">{stale} ancienne(s) installation(s) de Lielu Lists seront retirées.</p> : null}
        <div className="btn-row">
          {!first || stale ? (
            <button type="button" className="btn primary" onClick={installFirst} disabled={busy !== null}>
              {installed ? "Mettre Lielu Lists en tête" : "Installer Lielu Lists en tête"}
            </button>
          ) : null}
          <button type="button" className={`btn${dirty ? " primary" : ""}`} onClick={save} disabled={!dirty || busy !== null}>
            {busy === "save" ? "Enregistrement…" : "Enregistrer dans Stremio"}
          </button>
          <button type="button" className="btn" onClick={disconnect}>Se déconnecter de Stremio</button>
        </div>
        {msg ? <p role="status" aria-live="polite" className={`small status ${msg.kind}`}>{msg.text}</p> : null}
      </div>

      <ol className="rows panel" aria-label="Ordre des addons dans Stremio">
        {addons.map((a, i) => (
          <li key={`${a.transportUrl}-${i}`}>
            <div className="row-head" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                {a.manifest.logo ? <img src={a.manifest.logo} alt="" width={32} height={32} style={{ borderRadius: 8, flex: "none", objectFit: "contain" }} /> : <span className="tag" aria-hidden="true">{i + 1}</span>}
                <div style={{ minWidth: 0 }}>
                  <div className="row-title">{a.manifest.name}</div>
                  <div className="row-meta">
                    {isLielu(a) ? <span className="tag">{a.transportUrl === manifestUrl ? "Votre addon" : "Ancienne URL"}</span> : null}
                    {isProtected(a) ? <span>protégé</span> : null}
                  </div>
                </div>
              </div>
              <div className="btn-row" style={{ flexWrap: "nowrap" }}>
                <button type="button" className="btn" aria-label={`Monter ${a.manifest.name}`} disabled={i === 0 || busy !== null} onClick={() => { setAddons(moveAddon(addons, i, -1)); setDirty(true); }}>↑</button>
                <button type="button" className="btn" aria-label={`Descendre ${a.manifest.name}`} disabled={i === addons.length - 1 || busy !== null} onClick={() => { setAddons(moveAddon(addons, i, 1)); setDirty(true); }}>↓</button>
                {!isProtected(a) ? (
                  <button
                    type="button"
                    className="btn danger"
                    aria-label={`Retirer ${a.manifest.name}`}
                    disabled={busy !== null}
                    onClick={() => {
                      if (window.confirm(`Retirer « ${a.manifest.name} » de Stremio ? (effectif après « Enregistrer »)`)) {
                        setAddons(removeAddon(addons, i));
                        setDirty(true);
                      }
                    }}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="small muted">Ne retirez pas Cinemeta : il fournit les fiches détaillées des films et séries de vos listes.</p>
    </div>
  );
}
