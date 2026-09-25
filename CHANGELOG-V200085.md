# Noctra 200.0.85

- BowdTV ajouté dans Chaînes : guide officiel avec paramètre `country=France`. Le catalogue exige une connexion BowdTV (API publique testée : HTTP 401 sans session). L’intégration est un portail, pas un catalogue natif Noctra.
- FCTV33 : Canal FR essayé en priorité lorsqu’il existe. Si sa validation échoue, les autres serveurs sont essayés. Conservation de l’URL finale et du cookie obtenus lors de la validation du flux pour la lecture relayée.
- Suppression de la dernière source : prise en charge des anciennes sources sans identifiant sauvegardé. Xtemus intégré peut désormais être retiré de Mes sources ; sa suppression est persistante. Retour à Mes sources après suppression, sans réouvrir l’ancien fournisseur mémorisé.
- iOS : accès direct au lecteur d’origine via « Ouvrir dans Safari » lorsque la session ne fonctionne pas en iframe. Mise en page mobile des pages web et choix de serveurs améliorée. Ce lien ouvre le navigateur disponible ; il ne force pas une application spécifique.
- Multiview : boutons plus compacts et curseur de volume masqué pour les lecteurs externes inaccessibles. Le contrôle sonore interdomaines reste une restriction du navigateur et du fournisseur.
- Téléchargements : cinq actions alignées de hauteur identique sur PC ; deux rangées régulières sur mobile.
- OHA/Kool : les chaînes sont explicitement marquées comme TV en direct. Le moteur natif et ses mécanismes de reprise sont conservés. Aucune équivalence de fonctionnement avec VYPN n’a été démontrée.

## Vérifications et limites

Tests `npm run test:v200085` : suppression runtime et intégrée, préférence Canal FR et secours, régressions multiview, lecteurs et permissions. Vérification locale des téléchargements en 1440 × 900 et 390 × 844 : boutons de 44 px, rangées alignées.

Le lecteur officiel FCTV33 reste non validé. La lecture des fournisseurs externes sur un véritable appareil iOS n’a pas été testée. Xtemus renvoie une page de 11 octets sans lecteur et Rebrand une réponse 403 depuis cet environnement : ces deux sources ne sont pas déclarées réparées. BowdTV nécessite la session de son fournisseur.

## Installation

Remplacer les fichiers en conservant la configuration et les données locales, puis redémarrer Noctra. Cache navigateur renouvelé. Aucun déploiement effectué.
