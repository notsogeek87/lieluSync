"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi, errorText } from "./client-api";

export function CatalogControl(props: { id: string; typeLabel: string; listName: string; enabled: boolean; customName: string | null; count: number; disabled?: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(props.enabled);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.customName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const display = props.customName || props.listName;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const r = await callApi(`/api/catalogs/${props.id}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) setError(errorText(r));
    return r.ok;
  }

  async function toggle(next: boolean) {
    setEnabled(next);
    if (!(await patch({ enabled: next }))) setEnabled(!next);
    else router.refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await patch({ customName: name })) {
      setEditing(false);
      router.refresh();
    }
  }

  return (
    <div className="catalog">
      <div className="name">
        <strong>{display}</strong>
        <span>
          {props.typeLabel} · {props.count.toLocaleString("fr-FR")} élément{props.count > 1 ? "s" : ""}
          {" · "}
          <button type="button" className="linklike" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            Renommer
          </button>
        </span>
      </div>
      <label className="switch">
        <span className="sr-only">Afficher « {display} » ({props.typeLabel}) dans Stremio</span>
        <input type="checkbox" checked={enabled} disabled={busy || props.disabled} onChange={(e) => toggle(e.currentTarget.checked)} />
        <span className="track" aria-hidden="true" />
      </label>
      {editing ? (
        <form onSubmit={save}>
          <label className="sr-only" htmlFor={`name-${props.id}`}>Nom du catalogue</label>
          <input id={`name-${props.id}`} className="input" maxLength={80} placeholder={props.listName} value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <button className="btn" type="submit" disabled={busy}>Enregistrer</button>
        </form>
      ) : null}
      {error ? <p className="small status danger" role="alert" style={{ gridColumn: "1 / -1" }}>{error}</p> : null}
    </div>
  );
}
