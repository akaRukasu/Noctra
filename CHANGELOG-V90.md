# Noctra Media Client v90 — Discovery / Demandes / performances

## Objectif

Cette version part de la v89 et cible deux sujets : rendre le moteur **Demandes / À découvrir** nettement plus profond, puis réduire les temps d'attente et les micro-ralentissements observés surtout sur PC. La partie TV n'est pas refondue dans cette release.

## TMDB direct, installé côté serveur

- La release personnelle contient une clé TMDB v3 destinée uniquement à l'installation serveur.
- `ultra/update-noctra.sh` la fusionne dans `TMDB_API_KEY` du `.env` existant puis supprime immédiatement le fichier d'installation avant le démarrage du service.
- La clé n'est jamais copiée dans `public/`, le shell, le manifest ou le Service Worker.
- Un `TMDB_BEARER_TOKEN` déjà configuré reste prioritaire.

## Discovery plus poussée

- Trois profils de recommandation : **Très fidèle à mes goûts**, **Équilibrée**, **Plus de découvertes**.
- Nouvelle catégorie **Pépites** : films et séries très bien notés avec un volume de votes suffisant.
- Les recommandations proches exploitent simultanément les endpoints TMDB `recommendations` et `similar` des meilleurs contenus du profil Jellyfin.
- Les tendances Seerr quotidiennes et hebdomadaires restent croisées avec les signaux TMDB.
- Le scoring distingue davantage : affinité genres, titres proches, format film/série, retours `Plus comme ça / Pas pour moi`, diversité, qualité et nouveauté volontaire.
- Chaque carte peut ouvrir **Pourquoi cette suggestion ?** pour afficher la contribution des principaux signaux au score.
- Les rails intelligents restent séparés : choix Noctra, goûts proches, tendances, cinéma, streaming, séries, pépites et exploration.

## Chargement Demandes accéléré

- La page Demandes n'attend plus l'historique Seerr avant d'afficher les suggestions.
- L'historique et le quota chargent en parallèle et mettent ensuite l'interface à jour sans bloquer la découverte.
- Les statuts Seerr (`présent`, `en attente`, `demandable`…) et les plateformes légales ne sont plus calculés pour toutes les cartes avant le rendu.
- Ils sont enrichis **paresseusement uniquement lorsque les cartes approchent du viewport**, par lots de 10 maximum.
- La nouvelle route `POST /api/discovery/enrich` réalise cet enrichissement avec une concurrence serveur bornée.
- Les contrôles de présence Prowlarr sont limités à **2 vérifications simultanées** pour éviter une rafale de requêtes lors de l'ouverture d'une longue liste.
- Les métadonnées détaillées de l'historique sont enrichies en parallèle uniquement pour les 30 demandes les plus récentes ; les anciennes restent immédiatement gérables.

## Caches et parallélisation

- Profil Jellyfin : cache 30 minutes + déduplication des chargements simultanés.
- Recommandations/similarités des seeds : cache 6 heures.
- Catalogue brut de Discovery : cache 5 minutes, indépendant du mode de personnalisation.
- Tendances Seerr : cache 5 minutes.
- Plateformes légales : cache existant conservé, désormais consommé à la demande.
- Statuts Seerr des cartes : cache court de 2 minutes.
- Les différentes vagues réseau du mode intelligent sont lancées en parallèle : catalogue, profil Jellyfin, recommandations proches et tendances.
- Les recommandations des meilleurs seeds et les découvertes par genres sont également parallélisées au lieu de s'enchaîner.

## Navigation / fluidité PC

- Le `MutationObserver` global ne surveille plus chaque changement de l'attribut `disabled` dans toute l'application.
- Les rafales de mutations Jellyfin sont regroupées avant une synchronisation de route.
- Les scans de grilles et réparations de layout ne s'exécutent plus sur toutes les pages : uniquement sur l'accueil et les routes médiathèque concernées.
- La synchronisation du drawer mobile n'est plus exécutée sur PC.
- Cela réduit les recalculs de style/layout pendant les transitions entre certaines pages Jellyfin.

## Vérifications

- `npm run check`
- suite complète `npm test`
- test dédié Discovery / performances v90
- absence de la clé TMDB dans tous les assets publics
- syntaxe de l'updater Ultra.cc
- archive finale extraite puis retestée dans un dossier vierge
- smoke test `/health` et `/api/config` en `90.0.0`
