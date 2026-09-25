# Noctra v96 — TV Safe Rollback + Mobile

- Retour du cœur de lecture TV de la v94, bit pour bit pour le direct HLS, les bridges et les résolveurs.
- Suppression des profils HLS expérimentaux de la v95 qui pouvaient casser les trois fournisseurs.
- Transport serveur LiveWatch/OHA v94 conservé ; WiTV inchangé.
- Mode Cinéma réimplémenté uniquement en CSS, sans recréer le lecteur.
- Boutons qualité `−` / `+` ajoutés comme raccourcis du sélecteur v94 déjà fonctionnel.
- Multiview réimplémenté dans une couche indépendante du lecteur principal, jusqu'à quatre flux HLS/directs.
- Sur iPhone/iPad, le Multiview privilégie HLS natif et démarre les flux muets ; le son s'active par geste utilisateur.
- Responsive Multiview 2x2 en mobile, avec mode paysage et safe areas iOS.
- Dock utilisateur desktop verrouillé : taille fixe, aucun transform/scale/transition au survol.
- Nouveau test de non-régression avec empreintes SHA-256 des quatre blocs TV critiques de la v94.
