"use client";

import { useState } from "react";
import { callApi, errorText } from "./client-api";

export function DeleteAccount() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await callApi("/api/account", "DELETE", { confirm: value });
    setBusy(false);
    if (!r.ok) return setError(errorText(r));
    window.location.assign("/?deleted=1");
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="confirm-delete">Tapez SUPPRIMER pour confirmer</label>
        <input id="confirm-delete" className="input" autoComplete="off" value={value} onChange={(e) => setValue(e.currentTarget.value)} />
      </div>
      <button type="submit" className="btn danger solid" disabled={busy || value !== "SUPPRIMER"}>
        {busy ? "Suppression…" : "Supprimer définitivement mon compte"}
      </button>
      {error ? <p className="small status danger" role="alert">{error}</p> : null}
    </form>
  );
}
