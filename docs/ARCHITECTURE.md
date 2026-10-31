# Architecture et choix techniques

Ce document résume l'analyse des documentations officielles (octobre 2026) et les décisions qui en découlent.

## 1. Constats issus des documentations

### TMDB
| Sujet | Constat | Conséquence |
|---|---|---|
| Authentification | Flux utilisateur **v4** : `POST /4/auth/request_token` (avec `redirect_to`) → approbation sur `https://www.themoviedb.org/auth/access?request_token=…` → `POST /4/auth/access_token`. Les request tokens expirent après **15 min**. | Implémenté tel quel ; l'état OAuth est lié au navigateur (cookie) et stocké chiffré côté serveur. |
| Durée des tokens | Le token d'accès v4 **n'expire pas** et il n'existe **pas de refresh token**. Révocation : `DELETE /4/auth/access_token`. | Pas de renouvellement à gérer. Un `401` pendant une synchro = accès révoqué → compte marqué `revoked`, synchro en pause, catalogues conservés, l'utilisateur est invité à se reconnecter. |
| Profil | Aucun endpoint profil en v4. | Conversion ponctuelle en session v3 (`/3/authentication/session/convert/4`), lecture de `/3/account`, puis suppression de la session v3. Échec non bloquant. |
| Listes | `GET /4/account/{account_object_id}/lists` (listes perso, paginé, avec `number_of_items` et `updated_at`), `GET /4/list/{id}` (détails + éléments, 20/page, `media_type` par élément), `GET /4/account/{id}/movie/watchlist` et `/tv/watchlist` (20/page, tri `created_at`). | Watchlist films et séries = deux listes distinctes ; une liste perso peut mélanger films et séries → jusqu'à deux catalogues. |
| Identifiants | Les ids TMDB ne sont **pas** compris par Stremio ; l'IMDb id s'obtient via `external_ids`. | Résolution par `GET /3/{movie,tv}/{id}?language=fr-FR&append_to_response=external_ids,translations,images` (un seul appel par titre), mise en cache partagée. |
| Quotas | Plus de limite stricte depuis 2019, mais un plafond « autour de 40 req/s » et des `429` possibles. | Limiteur par instance (≤ ~33 req/s, 8 en parallèle), retry exponentiel avec `Retry-After`, signatures de changement pour éviter de relire les listes inchangées, cache des métadonnées (7 j, 2 j sans IMDb). |

### Stremio
- Protocole : `/manifest.json`, `/catalog/{type}/{id}.json`, `/catalog/{type}/{id}/{extra}.json`, `/meta/{type}/{id}.json`. **CORS obligatoire** sur toutes les routes.
- Pagination : extra `skip`, pas de **100** ; moins de 100 éléments = fin du catalogue.
- Configuration utilisateur : portée par le chemin de l'URL (`https://hôte/<config>/manifest.json`), installation via `stremio://hôte/<config>/manifest.json`.
- Les items `tt…` sont décrits par Cinemeta et compris par tous les addons de flux/sous-titres. Un addon peut fournir ses propres métadonnées pour un préfixe déclaré dans `idPrefixes`.
- Plusieurs catalogues par addon : oui (`catalogs[]`), chacun avec `type`, `id`, `name`. Stremio affiche « nom – type ».

**SDK Stremio** : `addonBuilder` fige le manifest à la construction et `serveHTTP`/`getRouter` supposent un serveur Express persistant. Or chaque utilisateur a un manifest différent (ses listes) et l'hébergement est serverless. Le protocole est donc implémenté directement dans des Route Handlers Next.js, en suivant la spécification du SDK (format du manifest, `extra`, en-têtes de cache `cacheMaxAge`/`staleRevalidate`/`staleError` traduits en `Cache-Control`). Aucune dépendance supplémentaire.

### Vercel
- **Cron** : plan **Hobby limité à une exécution par jour** (une expression plus fréquente fait échouer le déploiement) ; **Pro** : jusqu'à la minute. Le cron envoie `Authorization: Bearer $CRON_SECRET`.
- **Durée max** (Fluid compute) : 300 s sur Hobby, jusqu'à 800 s sur Pro.
- Pas de stockage persistant local, pas de processus permanent.

### Supabase
- Connexion serverless recommandée via le **pooler en mode transaction** (port 6543) → pas de requêtes préparées (`prepare: false`).
- La Data API (PostgREST) expose le schéma `public` aux rôles `anon`/`authenticated` : il faut RLS + révocation des droits si on ne l'utilise pas.

## 2. Décisions

| Décision | Raison |
|---|---|
| **Next.js 16 (App Router) + TypeScript** | UI et API dans un seul projet Vercel. |
| **Identité = compte TMDB** (« Se connecter avec TMDB ») + sessions serveur | Pas de mot de passe ni d'e-mail à gérer ; l'utilisateur doit de toute façon autoriser TMDB. Cookie `__Host-` HttpOnly/Secure/SameSite=Lax, token aléatoire 256 bits stocké haché (HMAC). |
| **PostgreSQL sur Neon** (Francfort, branches `production`/`development`) | Postgres standard sans fonctionnalité propriétaire : le code reste compatible Supabase. Vercel en `fra1` pour être à côté de la base. |
| **Driver `postgres` direct** (pas supabase-js) | Transactions réelles pour le remplacement atomique des listes, verrous, `FOR UPDATE SKIP LOCKED`. |
| **RLS activé sans politique + REVOKE** pour `anon`/`authenticated` | La Data API ne peut rien lire ni écrire. Le serveur utilise le rôle propriétaire et **chaque requête est filtrée par `user_id`** (tests d'isolation). |
| **IDs Stremio** : `tt…` si IMDb, sinon `tmdb:{id}` | Compatibilité maximale avec Cinemeta et les addons de flux ; fallback servi par notre ressource `meta` (préfixe `tmdb:`), avec épisodes pour les séries. |
| **Métadonnées françaises** dans les catalogues | Titre, résumé, affiche FR (affiche `fr` la mieux notée, sinon celle par défaut) ; fallback anglais puis langue d'origine. |
| Pas de ressource `meta` pour les `tt…` | Stremio interroge Cinemeta (premier addon) pour les fiches IMDb ; surcharger ces fiches imposerait de reconstruire la numérotation des épisodes, au risque de casser les flux. La fiche détaillée reste donc celle de Cinemeta, les **catalogues** sont en français. |
| **Cron sans état** + rattrapage | Chaque tick traite tout ce qui est dû (`next_sync_at <= now()`), même après des ticks manqués ; synchro à la demande quand un catalogue est servi avec des données périmées. |

## 3. Modèle de données

```
users ─┬─ user_sessions            sessions web (hash)
       ├─ auth_requests            flux OAuth en cours (request token chiffré, 15 min)
       ├─ tmdb_accounts ── tmdb_tokens   (token v4 chiffré AES-256-GCM)
       ├─ tmdb_lists ─┬─ list_items      miroir exact de TMDB (ordre, type)
       │              └─ selected_catalogs  (liste × type) : activé, nom perso, ordre
       ├─ sync_jobs ── sync_logs          historique sans données sensibles
tmdb_media                                cache partagé des métadonnées (sans donnée perso)
catalog_items (vue)                       lignes prêtes pour Stremio
rate_limits                               compteurs à fenêtre fixe (clés hachées)
```
`catalog_items` est une **vue** (catalogue × éléments résolus) plutôt qu'une table : un même élément de liste sert un seul catalogue selon son type, et la métadonnée est partagée entre utilisateurs. Toutes les tables utilisateur cascadent depuis `users`.

## 4. Synchronisation

```
n8n (*/15) ou Vercel Cron ─► GET /api/cron/sync ─► runCronTick(budget 240 s)
                                              │  claimNextDueUser()  (UPDATE … FOR UPDATE SKIP LOCKED, repousse next_sync_at)
                                              ▼
                                         syncUser(user)
  1. verrou à bail (users.sync_lock_until, 180 s, renouvelé) — un seul run par utilisateur
  2. index : listes perso (toutes pages) + page 1 des deux watchlists
     → si l'index échoue : arrêt, AUCUNE liste marquée supprimée
  3. listes absentes d'un index complet → « gone » (masquées, purgées après 7 j)
  4. pour chaque liste : signature (count+updated_at, ou total+hash page 1)
     inchangée et relue < 6 h → ignorée ; sinon lecture de TOUTES les pages
     → contrôles : pages complètes, total stable pendant la lecture
     → transaction unique : upsert, suppression des absents, compteurs
     → en cas d'erreur : rien n'est modifié, backoff propre à la liste
  5. résolution des métadonnées manquantes/périmées (budget 400, 6 en parallèle)
  6. planification : +15 min (± jitter), backoff exponentiel si échec (≤ 6 h),
     reprise immédiate si budget temps épuisé
```
Déclencheurs : cron, bouton manuel (1/min), connexion, catalogue servi avec des données de plus de 30 min (en arrière-plan via `after()`).

## 5. Addon Stremio

| Route | Rôle | Cache |
|---|---|---|
| `/u/{config}/manifest.json` | manifest personnel, un catalogue par (liste, type) activé | 5 min |
| `/u/{config}/catalog/{movie\|series}/ll-{uuid}[/skip=N].json` | 100 éléments par page, ordre TMDB | 5 min, `stale-if-error` 24 h |
| `/u/{config}/meta/{type}/tmdb:{id}.json` | fiche des titres sans IMDb (+ épisodes) | 6 h |
| `/u/{config}/configure` | bouton « Configurer » de Stremio → `/lists` | — |

`{config}` : 32 octets aléatoires (base64url, 43 caractères), stocké haché (HMAC) pour la recherche et chiffré pour l'affichage ; régénérable.
