# Noctra v75 — correctif TV de stabilisation

Cette version part de la v74 et cible uniquement les régressions de lecture constatées sur LiveWatch, OHA et WiTV. L’objectif est de conserver les chemins qui fonctionnent et de corriger les défauts déterministes trouvés dans les ponts TV, sans refaire une nouvelle architecture complète.

## LiveWatch VIP

- Correction de la cause exacte de `Invalid API key` vue dans le lecteur v74 : la clé publique Supabase embarquée avait un payload JWT altéré sans nouvelle signature. La dernière clé publique connue valide est restaurée.
- Noctra peut maintenant redécouvrir la configuration publique Supabase utilisée par le frontend LiveWatch (URL de projet + clé anon/publishable) et retenter automatiquement après une erreur `Invalid API key`.
- Les clés `sb_publishable_*` découvertes sont associées en priorité au projet Supabase découvert dans le même frontend et non à un ancien projet de secours.
- Le lecteur VIP reste serveur-first : le vrai access token et le refresh token restent sur Noctra et ne sont jamais sérialisés dans l’iframe.
- Un refresh Supabase déclenché par le lecteur reçoit une nouvelle session virtuelle Noctra au lieu de pouvoir renvoyer les vrais tokens au navigateur.
- Le pont LiveWatch répond désormais correctement aux preflights CORS provenant de l’iframe sandboxée.
- Correction des URLs construites à partir de `location.origin` dans un sandbox opaque (`null/...`) : elles sont remappées vers l’origine LiveWatch réelle avant le proxy.
- En cas d’échec du pont VIP, l’interface essaie le HLS VIP de compatibilité, puis seulement en dernier recours le lecteur public.
- Une erreur du pont n’est plus affichée comme du JSON brut dans la zone vidéo : elle est remontée au client pour déclencher le repli prévu.

## OHA

- Correction d’un défaut important du proxy officiel : OHA/MediaURL utilise aussi le header `Mediaurl-Signature`. Les v74 et précédentes ne relayaient que `mediahubmx-signature`, ce qui pouvait faire échouer `/mediaurl-resolve.json` alors que le JavaScript officiel avait bien généré sa signature.
- `Mediaurl-Signature` et `mediahubmx-signature` sont maintenant relayées sur les deux chemins OHA (`site` et `http`).
- Les signatures sont conservées lors d’une redirection canonique strictement OHA → OHA (`oha.to`, `www.oha.to`, `oha.cx`, `www.oha.cx`), mais supprimées avant toute redirection vers un CDN tiers.
- Correction des URLs `null/...` produites lorsqu’un script OHA lit `location.origin` depuis l’iframe sandboxée.
- Le pont OHA corrigé redevient le premier choix. Si aucun média ne démarre, Noctra bascule vers la page OHA officielle. Les essais de serveurs natifs restent disponibles manuellement sans fabriquer de signature.
- Les playlists/médias externes restent relayés en lecture seule et les credentials/signatures fournisseur ne sont jamais envoyés aux CDN tiers.

## WiTV

- Le chemin qui fonctionne réellement dans le lecteur web WiTV est conservé en priorité.
- Le HLS extrait reste disponible en second choix via le proxy Noctra avec le bon `Referer`, sans dépendre du CORS navigateur.
- Le lecteur web envoie maintenant un état `playing/error/stalled` à Noctra ; en cas de panne du player web, le HLS de secours est essayé automatiquement.
- Aucun changement de catalogue ou de présentation susceptible de casser le chemin WiTV fonctionnel montré en v74.

## Tests v75

- `npm run check` : OK.
- Suite complète `npm test` : OK.
- Régression explicite de la clé LiveWatch v74 (`iss=supabase`, rôle `anon`, bon project ref) : OK.
- Test de redécouverte/association d’une clé LiveWatch `sb_publishable_*` avec un nouveau projet : OK.
- Test du chemin VIP/HLS, cookies et suppression des credentials vers CDN tiers : OK.
- Test des redirections OHA : signatures conservées OHA→OHA, supprimées vers CDN tiers : OK.
- Test du relayage des deux headers OHA `Mediaurl-Signature` et `mediahubmx-signature` : OK.
- Test du bridge sandbox `null/origin` pour LiveWatch et OHA : OK.
- Test WiTV player web + HLS proxifié : OK.
- Smoke test avec `BASE_URL=/noctra` : `/noctra/health` retourne `75.0.0`.

Le test final d’un flux vidéo réel dépend toujours des fournisseurs amont et doit être effectué depuis l’instance Ultra.cc, l’environnement de construction n’ayant pas de résolution DNS sortante vers ces services.
