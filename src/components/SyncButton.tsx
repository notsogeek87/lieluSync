"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi, errorText } from "./client-api";

export function SyncButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "danger"; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await callApi("/api/sync", "POST");
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "danger", text: errorText(r) });
    } else {
      const res = r.data.result;
      if (res.status === "success") {
        setMsg({ kind: "ok", text: `Synchronisé : ${res.listsChecked} liste(s) vérifiée(s), +${res.itemsAdded} / −${res.itemsRemoved} élément(s).` });
      } else if (res.status === "partial") {
        setMsg({ kind: "warn", text: "Synchronisation partielle : certaines listes seront réessayées automatiquement." });
      } else {
        setMsg({ kind: "danger", text: res.error ?? "La synchronisation a échoué. Les données précédentes sont conservées." });
      }
    }
    router.refresh();
  }

  return (
    <div className="stack">
      <button type="button" className="btn primary" onClick={run} disabled={busy || disabled} aria-busy={busy}>
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        {busy ? "Synchronisation…" : "Synchroniser maintenant"}
      </button>
      <p role="status" aria-live="polite" className={`small status ${msg?.kind ?? ""}`} hidden={!msg}>
        {msg?.text}
      </p>
    </div>
  );
}
