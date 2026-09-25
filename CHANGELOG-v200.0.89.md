# Noctra 200.0.89

Correctif ciblé du chargement BowdTV.
- Compatibilité des cookies invités avec les versions de Fetch/Node qui ne proposent pas headers.getSetCookie ; séparation correcte des cookies avec une date Expires contenant une virgule.
- Le catalogue initial BowdTV ne dépend plus du téléchargement des logos et des programmes de services tiers. Le rafraîchissement explicite des logos reste disponible.

Tests : en-têtes modernes et anciens simulés, pagination/session et suite de régression passés ; catalogue réel de 991 chaînes, 95 pays et résolution TF1 en flux natif validés depuis le poste de travail.
Limite : le message précis et la version Node du serveur utilisateur ne sont pas disponibles ; la cause du problème sur ce serveur n’est pas confirmée. Aucun déploiement réalisé.
