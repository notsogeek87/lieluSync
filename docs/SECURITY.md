# Sécurité

| Exigence | Mise en œuvre |
|---|---|
| Tokens TMDB chiffrés | AES-256-GCM (IV aléatoire, tag d'authentification, AAD par usage), clé `TOKEN_ENCRYPTION_KEY`, rotation via `TOKEN_ENCRYPTION_KEY_PREVIOUS` (ré-chiffrement automatique à la lecture). |
| Jamais de token dans le navigateur, les URLs ou les logs | Les tokens ne quittent jamais le serveur ; l'URL Stremio contient un identifiant aléatoire sans lien avec TMDB ; logger JSON avec rédaction (clés sensibles, JWT, `Bearer`, chemins `/u/…`, chaînes longues). |
| Authentification | Connexion via TMDB, sessions serveur 30 j glissantes, cookie `__Host-lielu_session` HttpOnly/Secure/SameSite=Lax, token stocké haché. |
| Login CSRF | `state` aléatoire lié au navigateur par cookie HttpOnly, comparaison à temps constant, usage unique, expiration 15 min. |
| CSRF sur l'API | Mutations : vérification `Origin` (ou `Sec-Fetch-Site`) = origine de l'app + SameSite=Lax. |
| L'identifiant Stremio n'est pas un login | Les routes `/api/*` exigent la session ; l'identifiant de configuration ne donne accès qu'aux catalogues en lecture. |
| Isolation entre utilisateurs | Toutes les requêtes filtrent par `user_id` (catalogues, métadonnées, modifications) ; tests d'intégration dédiés. RLS bloque la Data API Supabase. |
| Validation | Zod pour l'environnement, les corps JSON (taille max 16 Ko) et les réponses TMDB ; ids de catalogue/TMDB analysés strictement. |
| Anti-abus | Limitation en base (fenêtres fixes, clés hachées) : 20 connexions/10 min/IP, 300 req/min/IP sur l'addon, synchro manuelle 1/min. Fail-open si la base est indisponible. Complément recommandé : règle *Rate limiting* du Vercel Firewall sur `/u/` et `/api/`. |
| Route cron | `Authorization: Bearer $CRON_SECRET` comparé à temps constant. |
| En-têtes | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` (UI) ; CORS `*` uniquement sur les routes Stremio. |
| Suppression de compte | Révocation du token sur TMDB puis `DELETE FROM users` → cascade sur toutes les tables personnelles. Le cache `tmdb_media` ne contient aucune donnée personnelle. |
| Secrets | Uniquement en variables d'environnement ; `.env*` ignorés par Git (sauf `.env.example`). |

## Limites connues
- La CSP autorise `'unsafe-inline'` pour les scripts (scripts d'hydratation Next.js). Une CSP à nonce est possible via un `proxy.ts` si nécessaire.
- Les réponses de catalogue sont mises en cache 5 min par le CDN : après une régénération d'URL, l'ancienne peut encore répondre depuis le cache pendant ce délai.
- Toute personne qui obtient l'URL Stremio voit les catalogues (c'est le modèle des addons Stremio) : la régénérer en cas de fuite.
