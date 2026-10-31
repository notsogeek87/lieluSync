"use client";

import { useState } from "react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const id = `copy-${label.replace(/\W+/g, "-").toLowerCase()}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.getElementById(id) as HTMLInputElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="copy">
        <input id={id} className="input mono" value={value} readOnly onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
        <button type="button" className="btn" onClick={copy} aria-live="polite">
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
    </div>
  );
}
