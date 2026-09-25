# Noctra V144

## TV desktop

- Transfère dans le lecteur direct Noctra les médias résolus par LiveWatch, NorthTV et FrameTV sur ordinateur.
- Conserve sans changement les chemins iPhone, iPad et mobile déjà stables.
- Active une durée HLS infinie afin que le navigateur traite le média comme un direct et non comme une vidéo à la demande.
- Réduit le tampon fort débit de 90 à 45 secondes pour les flux à gros segments, avec le profil conservateur maintenu sur connexion faible.
- Rapproche progressivement la lecture du direct et reprend les événements `waiting` et `stalled` pendant toute la session.

## Interface

- Ajoute une commande `Direct` sur ordinateur pour rejoindre immédiatement la tête du flux après une pause ou un ralentissement.
- Masque cette commande sur mobile et conserve des dimensions stables dans la barre du lecteur.

## Validation

- Ajoute des contrôles dédiés au handoff desktop, au profil HLS live, à la reprise persistante et au responsive de la commande.
