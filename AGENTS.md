# CheckPic — règles du dépôt

Plateforme de validation humaine des photos de poissons de River’Sense (étape 4 de la feuille
de route, 12 novembre 2026). Propriétaire débutant : expliquer simplement, en français.

## Sécurité (non négociable)

- Même projet Supabase que River’Sense (`jvqgetvuoepeucvcnwse`). Seules l’adresse et la clé
  publique (publishable) sont dans le code ; jamais de clé secrète ni de service_role.
- Connexion Supabase Auth obligatoire, puis rôle administrateur vérifié par le serveur
  (`riversense_photo_is_admin_v1`). Aucune donnée ni photo n’est demandée avant cette réponse.
- Données uniquement par les fonctions `riversense_photo_review_*_v1`, qui revérifient le rôle.
  Les tables du schéma `riversense_photos` ne sont jamais exposées.
- Photos dans le dossier privé `riversense-photos`, lues par adresses signées de 5 minutes.
  Une photo rejetée est supprimée. Aucune coordonnée GPS n’est stockée ni affichée.
- Le schéma et les fonctions SQL vivent dans le dépôt River’Sense (`supabase/migrations`).

## Interface

- Charte River’Sense : jetons de couleur oklch et polices Bricolage Grotesque / Inter Tight,
  copiés de `River-Sense/src/styles.css`. Pensée d’abord pour le téléphone.
- Une photo à la fois ; décisions : le pêcheur a raison, autre espèce, rejeter (raison),
  passer. Toute réponse du serveur est revalidée (`src/lib/review.ts`).

## Git

- Une branche par sujet, pull request vers `main`, fusion après le contrôle « application ».
- Avant chaque fusion : `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Jamais de force push, rebase ou amend sur ce qui est publié.
