# Variables d'environnement

| Variable | Obligatoire | Description | Où l'obtenir |
|---|---|---|---|
| `APP_URL` | oui | URL publique, sans `/` final. Sert aux redirections TMDB, aux URLs Stremio et au contrôle d'origine. | Domaine Vercel (ex. `https://lists.lielu.eu`) |
| `DATABASE_URL` | oui | Chaîne Postgres. Sur Vercel : **Transaction pooler** (port 6543). | Supabase › *Connect* |
| `DATABASE_SSL` | non | `require` / `disable`. Par défaut : désactivé pour localhost, requis sinon. | — |
| `TMDB_API_READ_ACCESS_TOKEN` | oui | Jeton applicatif v4 (« API Read Access Token »). | themoviedb.org › Paramètres › API |
| `TOKEN_ENCRYPTION_KEY` | oui | 32 octets en base64. Chiffre les tokens TMDB. **Le perdre = tous les utilisateurs doivent se reconnecter.** | `npm run gen:secret` |
| `TOKEN_ENCRYPTION_KEY_PREVIOUS` | non | Ancienne clé pendant une rotation. | — |
| `HASH_SECRET` | oui | ≥ 32 caractères. Clé HMAC des sessions, identifiants Stremio et clés de limitation. **Le changer invalide sessions et URLs Stremio.** | `npm run gen:secret` |
| `CRON_SECRET` | oui | ≥ 32 caractères. Protège `/api/cron/sync`. Vercel l'envoie automatiquement au cron. | `npm run gen:secret` |
| `SYNC_INTERVAL_MINUTES` | non (15) | Délai entre deux synchronisations d'un utilisateur. | — |
| `CRON_TIME_BUDGET_SECONDS` | non (240) | Temps de travail max d'un tick cron (garder < `maxDuration` 300 s). | — |
| `LOG_LEVEL` | non (info) | `debug`, `info`, `warn`, `error`. | — |
| `TMDB_API_BASE_URL` | non | **Tests uniquement** : redirige les appels TMDB vers un faux serveur. Ne pas définir en production. | — |

## Environnements
Créez **deux** projets Supabase (ou deux bases) et **deux** jeux de variables :

| | Development / Preview | Production |
|---|---|---|
| Supabase | projet `lielu-lists-dev` | projet `lielu-lists` |
| `APP_URL` | URL de preview stable ou `http://localhost:3000` | domaine de production |
| Secrets | propres à l'environnement | propres à l'environnement |
| App TMDB | peut être la même (le `redirect_to` est dynamique) | — |

Les secrets ne doivent **jamais** être partagés entre dev et prod.

## Fichier local
```bash
cp .env.example .env.local
npm run gen:secret   # à exécuter 3 fois : TOKEN_ENCRYPTION_KEY, HASH_SECRET, CRON_SECRET
```
