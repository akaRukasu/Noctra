# Noctra 200.0.68

- Suppression des réserves de bas de page cumulées sur les conteneurs de l’accueil. Une seule réserve couvre le dock, la zone de sécurité du téléphone et 8 px de respiration.
- Suppression de la réserve du body dans les menus : elle pouvait découvrir un fond distinct sous la page.
- Fond du dock plus transparent, limité à sa capsule arrondie ; aucun pseudo-élément ou fond de rail opaque. L’état actif et les noms accessibles des boutons sont conservés.
- Ajustements limités aux écrans jusqu’à 760 px ; les zones de sécurité restent dynamiques. Lecture et carrousels inchangés.

Vérifications : syntaxe et tests de régression de la version précédente. Pas de validation sur iPhone physique dans cette livraison. Installer l’archive complète puis fermer et rouvrir Noctra ; version attendue 200.0.68.
