import type { Overview } from "@/lib/account/overview";

export const healthLabel: Record<Overview["health"], { text: string; cls: string }> = {
  ok: { text: "Opérationnel", cls: "ok" },
  degraded: { text: "Partiellement synchronisé", cls: "warn" },
  attention: { text: "Synchronisation en échec", cls: "danger" },
  disconnected: { text: "TMDB déconnecté", cls: "danger" },
};

export const listStatusLabel: Record<string, { text: string; cls: string }> = {
  ok: { text: "À jour", cls: "ok" },
  pending: { text: "En attente", cls: "muted" },
  error: { text: "Erreur — données conservées", cls: "warn" },
  gone: { text: "Supprimée sur TMDB", cls: "muted" },
};

export const kindLabel: Record<string, string> = {
  watchlist_movie: "Watchlist films",
  watchlist_tv: "Watchlist séries",
  custom: "Liste personnalisée",
};

export const jobStatusLabel: Record<string, string> = {
  running: "En cours",
  success: "Réussie",
  partial: "Partielle",
  failed: "Échec",
  skipped: "Ignorée",
};

export const triggerLabel: Record<string, string> = {
  cron: "automatique",
  manual: "manuelle",
  stale: "à la demande",
  login: "connexion",
};

export const errorMessages: Record<string, string> = {
  invalid_state: "La demande de connexion n'est plus valide. Recommencez depuis cette page.",
  expired: "La demande de connexion a expiré (15 minutes). Recommencez.",
  tmdb_denied: "L'autorisation n'a pas été accordée sur TMDB.",
  tmdb_config: "Le service n'est pas encore correctement configuré (jeton TMDB refusé). Réessayez plus tard.",
  tmdb_unavailable: "TMDB ne répond pas pour le moment. Réessayez dans quelques minutes.",
  account_mismatch: "Ce compte TMDB est déjà lié à un autre compte Lielu Lists, ou ne correspond pas au compte connecté.",
  rate_limited: "Trop de tentatives de connexion. Patientez quelques minutes.",
};
