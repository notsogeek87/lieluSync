"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi, errorText } from "./client-api";

export interface OrderItem {
  id: string;
  name: string;
  typeLabel: string;
}

/** Up/down ordering of the enabled catalogs (= order of rows on the Stremio home screen). */
export function CatalogOrder({ items: initial }: { items: OrderItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "danger"; text: string } | null>(null);

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const copy = [...items];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    setItems(copy);
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    const r = await callApi("/api/catalogs/order", "POST", { ids: items.map((i) => i.id) });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "danger", text: errorText(r) });
    setDirty(false);
    setMsg({ kind: "ok", text: "Ordre enregistré." });
    router.refresh();
  }

  if (items.length < 2) return <p className="small muted">Activez au moins deux catalogues pour choisir leur ordre.</p>;

  return (
    <div className="stack">
      <ol className="rows panel" aria-label="Ordre des catalogues dans Stremio">
        {items.map((it, i) => (
          <li key={it.id}>
            <div className="row-head" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="tag" aria-hidden="true">{i + 1}</span>
                <div>
                  <div className="row-title">{it.name}</div>
                  <div className="row-meta">{it.typeLabel}</div>
                </div>
              </div>
              <div className="btn-row" style={{ flexWrap: "nowrap" }}>
                <button type="button" className="btn" aria-label={`Monter ${it.name} (${it.typeLabel})`} disabled={i === 0 || busy} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn" aria-label={`Descendre ${it.name} (${it.typeLabel})`} disabled={i === items.length - 1 || busy} onClick={() => move(i, 1)}>↓</button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={save} disabled={!dirty || busy}>{busy ? "Enregistrement…" : "Enregistrer l'ordre"}</button>
      </div>
      {msg ? (
        <p role="status" aria-live="polite" className={`small status ${msg.kind}`}>
          <span>
            {msg.text}
            {msg.kind === "ok" ? <>{" "}Pour l&apos;appliquer dans Stremio : <Link href="/stremio">mettre à jour Lielu Lists dans Stremio</Link>.</> : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}
