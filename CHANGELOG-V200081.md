# Noctra 200.0.81

- Médiathèques : retour aux cartes paysage, contenu légèrement agrandi sur PC. Sur mobile, quatre cartes en deux colonnes et espace réservé au dock.
- Mes sources : bouton « Supprimer la source » dans la navigation pour la source personnelle sélectionnée, réservé aux administrateurs. Disponible indépendamment du chargement du catalogue. La confirmation existante reste active.
- Multiview : avec trois lecteurs sur PC, le troisième est centré sous les deux autres et conserve leur taille.
- BrigitteTV : conservation de la page d’intégration publiée pour chaque serveur. La v80 extrayait le lecteur final, qui pouvait refuser le domaine Noctra. Suppression des deux requêtes intermédiaires du résolveur ; tous les choix publiés restent affichés.
- OHA/Kool : regroupement des suffixes numérotés .a à .d (par exemple beIN Sports 1.b) parmi les serveurs de la même chaîne. Les numéros de chaînes distincts restent séparés. Une recherche automatique sans candidat se termine immédiatement en erreur.
- Conservation des réserves de lecture et du premier serveur vérifié de la v80 pour éviter une régression de stabilité.

## Vérifications

`npm run test:v200081` : réussi, y compris reprises de lecture, sélection concurrente, renouvellement des liens, isolation des fournisseurs, permissions et syntaxe.

Prévisualisation locale avec les styles de production : cartes contrôlées en 1440 × 900 et 390 × 844 ; dernier rang mobile au-dessus du dock. Multiview en 1440 × 900 : trois lecteurs de largeur identique, dernier centré.

Les tests de résolveurs utilisent des fixtures et simulations. Ils ne démontrent pas une lecture continue de tous les serveurs BrigitteTV/OHA/Kool depuis le serveur de production. Les restrictions et indisponibilités du fournisseur restent applicables. Aucun déploiement effectué.

## Installation

Remplacer les fichiers de l’application par ceux de l’archive, conserver la configuration et les données locales, puis redémarrer Noctra. La version du cache navigateur est renouvelée.
