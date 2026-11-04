"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyField } from "./CopyField";
import { callApi, errorText } from "./client-api";

export interface CatalogOption { id: string; label: string }
export interface ProfileView {
  id: string;
  name: string;
  catalogIds: string[];
  install: { manifestUrl: string; stremioUrl: string; webInstallUrl: string };
}

function CatalogPicker({ options, selected, onChange, idPrefix }: { options: CatalogOption[]; selected: Set<string>; onChange: (next: Set<string>) => void; idPrefix: string }) {
  if (options.length === 0) return <p className="small muted">Aucun catalogue activé : activez d&apos;abord des listes dans « Mes listes ».</p>;
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small muted">Catalogues affichés dans ce profil</legend>
      {options.map((o) => (
        <label key={o.id} htmlFor={`${idPrefix}-${o.id}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            id={`${idPrefix}-${o.id}`}
            type="checkbox"
            checked={selected.has(o.id)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.currentTarget.checked) next.add(o.id);
              else next.delete(o.id);
              onChange(next);
            }}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ProfileCard({ profile, options }: { profile: ProfileView; options: CatalogOption[] }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [selected, setSelected] = useState(new Set(profile.catalogIds));
  const [install, setInstall] = useState(profile.install);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; status: number; data: any }>, success?: string, after?: (data: any) => void) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: errorText(r) });
    after?.(r.data);
    setMsg(success ? { ok: true, text: success } : null);
    router.refresh();
  }

  return (
    <li>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => callApi(`/api/profiles/${profile.id}`, "PATCH", { name, catalogIds: [...selected] }), "Profil enregistré. Mettez à jour l'addon dans Stremio pour appliquer les changements.");
        }}
      >
        <div className="field">
          <label htmlFor={`pname-${profile.id}`}>Nom du profil</label>
          <input id={`pname-${profile.id}`} className="input" maxLength={40} required value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </div>
        <CatalogPicker options={options} selected={selected} onChange={setSelected} idPrefix={`p-${profile.id}`} />
        <div className="btn-row">
          <button className="btn primary" type="submit" disabled={busy}>Enregistrer</button>
          <a className="btn" href={install.stremioUrl}>Installer dans Stremio</a>
          <a className="btn" href={install.webInstallUrl} target="_blank" rel="noreferrer noopener">Stremio Web</a>
        </div>
        <CopyField label={`URL du manifest — ${profile.name}`} value={install.manifestUrl} />
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Générer une nouvelle URL ? L'ancienne cessera immédiatement de fonctionner.")) return;
              void run(() => callApi(`/api/profiles/${profile.id}/regenerate`, "POST"), "Nouvelle URL générée.", (d) => setInstall(d.install));
            }}
          >
            Régénérer l&apos;URL
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Supprimer le profil « ${profile.name} » ? Son URL cessera de fonctionner.`)) return;
              void run(() => callApi(`/api/profiles/${profile.id}`, "DELETE"));
            }}
          >
            Supprimer
          </button>
        </div>
        <p role="status" aria-live="polite" className={`small ${msg && !msg.ok ? "status danger" : "muted"}`} hidden={!msg}>{msg?.text}</p>
      </form>
    </li>
  );
}

export function ProfileManager({ profiles, options, canCreate }: { profiles: ProfileView[]; options: CatalogOption[]; canCreate: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await callApi("/api/profiles", "POST", { name, catalogIds: [...selected] });
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    setName("");
    setSelected(new Set());
    router.refresh();
  }

  return (
    <>
      {profiles.length ? (
        <ul className="rows panel">
          {profiles.map((p) => (
            <ProfileCard key={`${p.id}:${p.catalogIds.join(",")}:${p.name}`} profile={p} options={options} />
          ))}
        </ul>
      ) : (
        <div className="notice" role="status"><strong>Aucun profil</strong>Créez-en un ci-dessous, par exemple « Enfants » ou « Soirée film ».</div>
      )}

      {canCreate ? (
        <section className="section" aria-labelledby="new-profile">
          <h2 id="new-profile">Nouveau profil</h2>
          <form className="panel panel-pad stack" onSubmit={create}>
            <div className="field">
              <label htmlFor="new-profile-name">Nom du profil</label>
              <input id="new-profile-name" className="input" maxLength={40} required placeholder="Enfants" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            </div>
            <CatalogPicker options={options} selected={selected} onChange={setSelected} idPrefix="new" />
            <div className="btn-row">
              <button className="btn primary" type="submit" disabled={busy || !name.trim()}>Créer le profil</button>
            </div>
            {error ? <p className="small status danger" role="alert">{error}</p> : null}
          </form>
        </section>
      ) : (
        <p className="small muted">Nombre maximum de profils atteint.</p>
      )}
    </>
  );
}
