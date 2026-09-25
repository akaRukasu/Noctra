# Noctra 200.0.82

- Multiview : plein écran collectif utilisant l’API du navigateur, bouton plein écran par case pour vidéos et lecteurs externes, et bouton étoile pour mettre une case en avant sans recharger les lecteurs. Retour à la grille par un second clic. Sur mobile, la case choisie passe en premier. Un affichage occupant la fenêtre reste disponible lorsque le navigateur refuse le plein écran natif.
- Sports : correction de l’attribut sandbox sur les documents externes des fournisseurs DLStreams, DaddyLive, BrigitteTV, Streamed et Volkamax. Les documents servis sur le domaine Noctra restent isolés.
- FCTV33 : ajouté dans Sports avec 15 catégories via le catalogue public Movix, qui référence les événements FCTV33. Les noms des serveurs sont chargés pour chaque événement. Résolution des adresses à la sélection avec la session fournie par FCTV33, contrôle de la playlist et de fragments récents avant lecture native. Lecteur officiel proposé si aucun flux natif vérifié n’est disponible ; choix de serveurs conservés.
- RénéVéo : reconnaissance de la configuration publique avec guillemets simples ou doubles, normalisation des types de sources, renouvellement du serveur effectivement sélectionné et validation des fragments vidéo. Les sources non vérifiées ne défilent plus automatiquement.
- FCTV33 rejoint les fournisseurs dont les liens peuvent être renouvelés par le lecteur en cas de coupure. Réserves de lecture de la v81 conservées.

## Vérification du 8 septembre 2026

- Tests automatisés : `npm run test:v200082`, comprenant les suites de reprise, d’isolation des fournisseurs, de permissions et de syntaxe des versions précédentes.
- Interface locale utilisant les fonctions et styles de production : plein écran natif confirmé, agrandissement du lecteur externe sans remplacement de l’iframe, retour au plein écran collectif et contrôle mobile à 390 × 844.
- RénéVéo : catalogue réel de 36 chaînes au moment du contrôle ; TF1 et beIN Sports 1 ont passé la validation réelle de playlist et de fragment vidéo, avec trois sources chacune.
- FCTV33 : catalogue réel de 48 événements et serveurs nommés. Les flux directs du match testé répondaient sans fournir de fragments utilisables ; le secours vers le lecteur officiel a été vérifié. La lecture vidéo dans ce lecteur officiel n’a pas été confirmée. L’intégration dépend du catalogue public Movix et du service FCTV33.

Ces contrôles ne garantissent pas la disponibilité permanente de tous les serveurs externes. Aucun déploiement effectué.

## Installation

Remplacer les fichiers de l’application en conservant la configuration et les données locales, puis redémarrer Noctra. Le cache navigateur porte la nouvelle version.
