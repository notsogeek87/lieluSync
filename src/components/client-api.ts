"use client";

export async function callApi(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: "Connexion impossible. Vérifiez votre réseau." } };
  }
}

export function errorText(r: { status: number; data: any }): string {
  if (r.data?.message) return r.data.message;
  if (r.status === 401) return "Votre session a expiré. Reconnectez-vous.";
  if (r.status === 429) return "Trop de demandes. Réessayez dans un instant.";
  return "Une erreur est survenue. Réessayez.";
}
