"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi, errorText } from "./client-api";

/** Button calling a private API endpoint, with optional confirmation and inline feedback. */
export function ActionButton(props: {
  endpoint: string;
  method?: "POST" | "DELETE";
  label: string;
  busyLabel?: string;
  confirm?: string;
  success?: string;
  variant?: "primary" | "danger" | "default";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "danger"; text: string } | null>(null);

  async function run() {
    if (props.confirm && !window.confirm(props.confirm)) return;
    setBusy(true);
    setMsg(null);
    const r = await callApi(props.endpoint, props.method ?? "POST");
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "danger", text: errorText(r) });
      return;
    }
    if (props.redirectTo) {
      window.location.assign(props.redirectTo);
      return;
    }
    setMsg(props.success ? { kind: "ok", text: props.success } : null);
    router.refresh();
  }

  const cls = `btn${props.variant === "primary" ? " primary" : props.variant === "danger" ? " danger" : ""}`;
  return (
    <div className="stack">
      <button type="button" className={cls} onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        {busy ? (props.busyLabel ?? props.label) : props.label}
      </button>
      <p role="status" aria-live="polite" className={`small ${msg?.kind === "danger" ? "status danger" : "muted"}`} hidden={!msg}>
        {msg?.text}
      </p>
    </div>
  );
}
