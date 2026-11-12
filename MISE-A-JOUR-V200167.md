# Noctra 200.0.167 — nouvelles adresses des sources TV

Serveur **200.0.167**, Noctra TV **1.1.62** (Android TV **noctra.87**, LG, Samsung). Les applis iPhone (2.18.10) et Android (1.9.15) ne changent pas : les serveurs leur arrivent du serveur Noctra.

## OHA / Kool

- Nouvelles adresses, essayées dans cet ordre : **huhu.bz**, **kool.ws**, **vavoo.top**, **oha.cx** (application « #/channels »). Les adresses IP de Kool restent en dernier secours.
- **Serveurs de chaque miroir** : quand vous ouvrez une chaîne, la liste propose les serveurs de chaque miroir qui répond, par exemple « huhu.bz · HD · Serveur 1 », « vavoo.top · HD · Serveur 1 », « oha.cx · SD · Serveur 2 »…
  - Un miroir qui ne répond pas n'apparaît pas.
  - La liste des miroirs qui répondent est vérifiée au plus toutes les 5 minutes.
- **API** : chaque miroir est interrogé d'abord avec l'API MediaHubMX (Kool / Vavoo / Huhu), puis avec l'ancienne API MediaURL si la première n'existe pas sur ce miroir.
- **Lecteur officiel (secours)** : il s'ouvre sur « #/channels », puis Noctra y choisit la chaîne. Une ancienne route expirée renvoie aussi vers « #/channels ».

## Streamed et PPV

- **Streamed** : **strmfree.pk**, puis strmfree.st, streamed.pk, streamed.st, rockylive.st et tim-streams.com. L'adresse qui répond est retenue 5 minutes, pour ne pas réessayer une adresse morte à chaque rubrique.
- **PPV** : **rockylive.st**, puis **tim-streams.com**, ppv.st et ppv.to (programme `/api/streams`).
- Si aucune adresse ne publie de programme lisible par Noctra, la source propose le **site du fournisseur**, ouvert dans le lecteur web de Noctra. Un message indique quelles adresses ont été essayées.

## Limites

Je n'ai pas pu joindre ces sites depuis l'environnement de développement (réseau bloqué). Leur format a été repris des versions précédentes et testé sur des réponses simulées :
- `tests/v200167-oha-mirrors.mjs` : ordre des miroirs, API de secours, serveurs par miroir, miroir absent, choix d'un miroir précis ;
- `tests/v200164-ppv-streamed-sources.mjs` : Streamed, PPV et sites en secours.

À vérifier sur votre serveur :
- une chaîne OHA affiche bien des serveurs pour chaque miroir ;
- Streamed et PPV donnent des événements, ou à défaut le site du fournisseur.

## Mise à jour (données gardées)

1. **Serveur** : mettez `noctra-media-client-v200.0.167.zip` dans Téléchargements, puis lancez `LANCER-MISE-A-JOUR-NOCTRA-V8.cmd`.
2. **Android TV** : APK `noctra-androidtv` dans GitHub › Actions › « Noctra Android ».
3. **LG** : `com.noctra.media_1.1.62_all.ipk`. **Samsung 2014** : kit 1.1.62.
