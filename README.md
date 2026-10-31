# Lielu Lists

**Lielu Lists — Your TMDB lists in Stremio**

Addon Stremio qui synchronise automatiquement les listes d'un compte TMDB (watchlist films, watchlist séries, listes personnelles) vers des catalogues Stremio personnels, mis à jour toutes les 15 minutes — ajouts **et** suppressions. Édité par Lielu.

- Connexion TMDB officielle (authentification utilisateur v4), token chiffré, révocable.
- Choix des listes exposées, renommage, films et séries toujours dans des catalogues séparés.
- URL d'installation personnelle, aléatoire et régénérable ; aucun token dans l'URL.
- Catalogues en français (titres, résumés, affiches) avec repli sur la langue d'origine.
- Identifiants IMDb pour la compatibilité avec Cinemeta et les addons de sources ; repli `tmdb:` avec fiche servie par l'addon.
- Synchronisation sans serveur permanent : Vercel Cron + rattrapage + synchro à la demande, verrou par utilisateur, remplacement atomique des listes (une erreur ne vide jamais un catalogue).

## Stack
Next.js 16 (App Router) · TypeScript · Supabase PostgreSQL (driver `postgres`) · Zod · Vitest · Vercel Functions & Cron.

## Démarrage rapide
```bash
npm ci
cp .env.example .env.local      # voir docs/ENVIRONMENT.md
npm run db:migrate              # applique supabase/migrations
npm run dev                     # http://localhost:3000
```

## Scripts
| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests unitaires + intégration (Postgres requis : `TEST_DATABASE_URL`, défaut `postgres://postgres:postgres@127.0.0.1:5432/lielu_test`) |
| `npm run test:unit` | Tests unitaires seuls (sans base) |
| `npm run db:migrate` | Applique les migrations sur `DATABASE_URL` |
| `npm run gen:secret` | Génère un secret aléatoire (32 octets base64) |

## Structure
```
src/
  app/                 pages (accueil, dashboard, lists, install, settings) et routes
    api/               API privée (session) + /api/cron/sync + /api/health
    u/[token]/         addon Stremio : manifest, catalog, meta, configure
  components/          composants UI
  lib/
    auth/              flux TMDB v4, cookies, sessions
    tmdb/              client HTTP (retry, limiteur), schémas Zod, pagination, métadonnées FR
    sync/              moteur de synchronisation, cron, résolution des métadonnées
    stremio/           manifest, conversion d'ids, metas, service HTTP de l'addon
    repo/              accès base de données (toujours filtré par utilisateur)
    security/          chiffrement, hachage, limitation, contrôle d'origine
supabase/migrations/   schéma SQL (tables, index, vue catalog_items, RLS)
tests/                 unit/, integration/ (vrai Postgres + faux serveur TMDB), e2e/
docs/                  ARCHITECTURE, DEPLOYMENT, ENVIRONMENT, SECURITY
```

## Documentation
- [Architecture et analyse technique](docs/ARCHITECTURE.md)
- [Déploiement Supabase / TMDB / Vercel et vérification](docs/DEPLOYMENT.md)
- [Variables d'environnement](docs/ENVIRONMENT.md)
- [Sécurité](docs/SECURITY.md)

## Limites connues
- **Vercel Hobby** n'autorise qu'un cron quotidien : voir [DEPLOYMENT › Plan Hobby](docs/DEPLOYMENT.md#️-plan-hobby) (planificateur externe, ex. n8n).
- Les **fiches détaillées** des titres IMDb viennent de Cinemeta (anglais) : Stremio les demande au premier addon compatible. Les catalogues, eux, sont en français.
- Après l'activation d'un **nouveau** catalogue, Stremio peut mettre du temps à relire le manifest ; réinstaller l'addon force la mise à jour. Le **contenu** des catalogues se met à jour sans réinstallation.
- Les titres sans IMDb (`tmdb:`) ont une fiche mais la plupart des addons de sources ne les reconnaissent pas.

## Test de bout en bout local
`tests/e2e/fake-tmdb-server.ts` simule l'API TMDB (port 4010). Avec `TMDB_API_BASE_URL=http://127.0.0.1:4010` et une base locale, `npm run build && npm start` permet d'exercer le parcours complet (connexion, synchro, manifest, catalogues) sans compte TMDB.

---
Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
