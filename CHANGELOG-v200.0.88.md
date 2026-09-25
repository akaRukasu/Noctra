# Noctra 200.0.88

BowdTV devient une source native : session invitée du fournisseur, catalogue France paginé, catégories par pays, variantes de lecture et renouvellement du serveur sélectionné. Les identifiants de session restent en mémoire côté serveur. Les flux directs publiés sont prioritaires et validés jusqu’aux données vidéo avant d’être proposés automatiquement.

BrigitteTV : suivi borné des pages intermédiaires avec leur référent, lecture des adresses HLS publiées sans exécuter les scripts, validation des segments et renouvellement à expiration. Cartel est prioritaire. Les serveurs sans flux direct reconnu gardent le lecteur web existant.

Multiview : languettes intégrées au bord extérieur des cases ; côté recalculé à l’ouverture, au redimensionnement, à la mise en avant et après suppression. Placement explicite pour résister aux anciennes règles CSS.

Vérifications réelles : 991 chaînes France et 95 pays BowdTV récupérés ; TF1 résolue en flux natif avec segments vidéo vérifiés. Multiplex BrigitteTV Cartel résolu en flux natif et segments vérifiés. Interface Multiview et changement de côté après mise en avant contrôlés dans le navigateur local.

Limites : aucune validation sur iPhone physique ni test exhaustif des 991 chaînes ou de tous les serveurs BrigitteTV. Les lecteurs web de secours restent dépendants des restrictions du fournisseur. Aucun déploiement sur le serveur utilisateur.
