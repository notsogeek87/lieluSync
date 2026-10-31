# Déploiement

## 1. Supabase
1. Créez un projet sur <https://supabase.com/dashboard> (région conseillée : **eu-west-3 Paris**, cohérente avec la région Vercel `cdg1` de `vercel.json`). Faites-en un second pour le développement.
2. Appliquez le schéma, au choix :
   - **SQL Editor** : collez `supabase/migrations/20261031000000_init.sql` et exécutez ;
   - **Supabase CLI** : `supabase link --project-ref <ref>` puis `supabase db push` ;
   - **script du projet** : `DATABASE_URL="<chaîne directe ou session pooler>" npm run db:migrate`.
3. Récupérez la chaîne **Transaction pooler** (port 6543) dans *Connect* → ce sera `DATABASE_URL` sur Vercel.
4. Vérifiez dans *Table Editor* que les tables affichent « RLS enabled ». Aucune politique n'est nécessaire : l'application n'utilise pas la Data API.

## 2. TMDB
1. Compte sur <https://www.themoviedb.org>, puis *Paramètres › API* : demandez une clé (usage personnel/développeur).
2. Copiez **« Jeton d'accès en lecture à l'API » (API Read Access Token)** → `TMDB_API_READ_ACCESS_TOKEN`. (La « clé API » v3 n'est pas utilisée.)
3. Rien à déclarer côté TMDB pour l'URL de retour : elle est transmise dans chaque demande (`redirect_to`).
4. Mention obligatoire : le pied de page affiche déjà la notice d'attribution TMDB.

## 3. Vercel
1. *Add New › Project* → importez le dépôt GitHub. Framework : Next.js (détecté).
2. *Settings › Environment Variables* : renseignez les variables de `docs/ENVIRONMENT.md` séparément pour **Production** et **Preview/Development**.
3. Déployez. Le cron de `vercel.json` (quotidien, voir *Plan Hobby*) est créé au déploiement de production.
4. Domaine : ajoutez par ex. `lists.lielu.eu` (*Settings › Domains*) puis mettez `APP_URL` à jour et redéployez.
5. *Deployment Protection* : Stremio doit pouvoir joindre `/u/…` sans authentification. Laissez la protection désactivée sur la **production** ; pour tester une preview depuis Stremio, utilisez un *Protection Bypass* ou testez en production.
6. Recommandé : *Firewall › Rate limiting* sur `/u/` et `/api/` en complément de la limitation applicative.

### ⚠️ Plan Hobby (configuration actuelle)
Vercel **refuse le déploiement** d'un cron plus fréquent qu'une fois par jour sur le plan Hobby. Le dépôt est donc configuré ainsi :

- `vercel.json` : cron **quotidien** `0 5 * * *` (filet de sécurité ; Hobby le déclenche entre 5 h 00 et 5 h 59 UTC) ;
- **n8n** (auto.lielu.eu), workflow « Lielu Lists - Synchro toutes les 15 min » : *Schedule Trigger* toutes les 15 min → `GET <APP_URL>/api/cron/sync` avec l'en-tête `Authorization: Bearer <CRON_SECRET>` (identifiant n8n « Lielu Lists - CRON_SECRET », type *Custom Auth* avec le modèle `{"headers":{"Authorization":"Bearer {{api_key}}"}}`) → alerte Telegram uniquement en cas de panne, de rétablissement, puis rappel toutes les 4 h si la panne dure.

Pour activer le workflow après le premier déploiement : renseigner l'URL dans le nœud « Lancer la synchronisation », créer l'identifiant avec la valeur de `CRON_SECRET`, tester avec « Tester maintenant », puis publier.

En passant au plan **Pro**, remettre `"*/15 * * * *"` dans `vercel.json` et dépublier le workflow n8n.

Dans tous les cas, la synchronisation **à la demande** (catalogue consulté avec des données de plus de 30 min) maintient les listes à jour même si le planificateur est en retard ou en panne.

## 4. Vérification après déploiement
```bash
# 1. Santé (base joignable)
curl https://<APP_URL>/api/health
# 2. Le cron refuse sans secret, accepte avec
curl -i https://<APP_URL>/api/cron/sync                       # 401
curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/sync   # {"ok":true,…}
```
3. Ouvrez `https://<APP_URL>`, **Se connecter avec TMDB**, approuvez : retour sur le tableau de bord, première synchro en cours.
4. *Mes listes* : vos watchlists et listes apparaissent avec leurs compteurs.
5. *Installation* : copiez l'URL et vérifiez le manifest :
   ```bash
   curl -s https://<APP_URL>/u/<id>/manifest.json | jq '.catalogs[] | {type,name}'
   curl -s https://<APP_URL>/u/<id>/catalog/movie/<catalog-id>.json | jq '.metas | length'
   ```
6. Installez dans Stremio (bouton ou collage de l'URL dans *Addons*) : les catalogues apparaissent sur l'accueil et dans *Découvrir*. Ouvrez un titre : les sources de vos autres addons doivent s'afficher (preuve que les ids IMDb sont bons).
7. Ajoutez un film à votre watchlist sur TMDB, cliquez *Synchroniser maintenant* : il apparaît dans Stremio (rafraîchissez la page d'accueil de Stremio ; cache client ≤ 5 min).
8. Retirez-le sur TMDB, resynchronisez : il disparaît.
9. Vercel › *Logs* : vérifiez les lignes `cron.tick` toutes les 15 min (appels n8n) et l'absence de token dans les logs.

## 5. Développement local
```bash
npm ci
cp .env.example .env.local          # remplir (APP_URL=http://localhost:3000)
npm run db:migrate                  # sur la base de dev
npm run dev
# tests : nécessitent un Postgres local (par défaut postgres://postgres:postgres@127.0.0.1:5432/lielu_test)
TEST_DATABASE_URL=postgres://… npm test
npm run build
```
Le cron ne tourne pas en local : appelez `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync`.

Pour tester depuis un téléphone ou Stremio Web, servez l'application en HTTPS (preview Vercel ou tunnel HTTPS) : une URL `http://localhost` n'est joignable que depuis la machine locale.

## 6. Rotation des secrets
- `TOKEN_ENCRYPTION_KEY` : placez l'ancienne valeur dans `TOKEN_ENCRYPTION_KEY_PREVIOUS`, la nouvelle dans `TOKEN_ENCRYPTION_KEY`, redéployez ; les tokens sont ré-chiffrés à leur prochaine utilisation. Retirez l'ancienne clé après quelques jours.
- `CRON_SECRET` : changez-le dans Vercel (et dans le planificateur externe éventuel), redéployez.
- `HASH_SECRET` : le changer déconnecte tous les utilisateurs et invalide toutes les URLs Stremio.
