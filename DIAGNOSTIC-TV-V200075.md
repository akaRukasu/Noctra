# Diagnostic Noctra 200.0.75 — 8 septembre 2026

Mesures depuis Chrome connecté au serveur existant, avant toute modification des réglages de réception. Échantillonnage d’une chaîne par fournisseur, et non validation de toutes les chaînes du catalogue. Aucun test d’endurance ni test sur iPhone physique. Une image disponible à un instant ne garantit pas l’absence de coupure ultérieure.

| Source Chaînes | Essai | Observation |
|---|---|---|
| LiveWatch | CANAL+ FOOT | Diagnostic intégré : premier démarrage 26,124 s ; première tranche 11,58 s reçue à 12,392 s ; réserve au départ 22,85 s. Remise en mémoire de 9 s après environ 3 min. Une seule qualité 720p. |
| FSTV | BFMTV | Lecture effective, position 141,45 s, réserve 27,52 s, readyState 4. |
| OHA / Kool | 6TER .b | Aucun HLS vérifiable annoncé ; aucun média prêt. Lecteur officiel proposé manuellement. |
| NorthTV | 2STV (SN) | Bascule vers lecteur officiel externe ; aucune lecture directe mesurable. |
| WiTV | 6ter | Aucun lecteur propre disponible ; secours manuels proposés. |
| FrameTV | 6TER | Pas de vidéo directe prête ; lecteur officiel et secours proposés. |
| StreamSports99 TV | ABC | Lecture effective, position 95,27 s, réserve 44,88 s, readyState 4. |
| RénéVéo | Arte | Message « Lecteur RénéVéo indisponible », aucune donnée vidéo. |
| Movix Vavoo | 6TER .c | Direct restant en chargement, readyState 0, aucun tampon lors du relevé. |
| Northlive | 20 MINUTES TV | Lecture effective, position 102,80 s, réserve 23,18 s, readyState 4. |

Les sources qui ne fournissent pas de média ne peuvent pas être réparées en augmentant le tampon. Les lecteurs externes gèrent eux-mêmes leur débit et leurs restrictions.

Movix IPTV VIP : 6ter lu, position 102,67 s, réserve 17,43 s, readyState 4.

Sources Sports inspectées individuellement :
- Sports : catalogue 451 événements ; les premiers événements sont programmés ultérieurement. Pas de mesure d’endurance.
- Football Live : 18 entrées, horaires futurs affichés (18:45 et 21:00). Pas de validation de lecture en direct.
- BossTV : catalogue vide, aucun contenu exploitable.
- JackTV : aucun match propre publié ; secours Football Live affiché explicitement.
- Matchs du jour : bandeau propre vide ; secours Sports/Football Live affiché explicitement.

Décision : conserver les réglages de réception de la version 200.0.74. Les observations ne justifient pas une modification globale du tampon. Le démarrage LiveWatch attend deux segments longs ; réduire arbitrairement cette réserve risquerait d’aggraver les interruptions déjà observées. Le plafond automatique 720p reste disponible quand le flux propose plusieurs qualités.
- DLStreams : catalogue 384 entrées ; #Vamos ES ouvre le lecteur web et ses commandes « en direct ». Tampon interne non mesuré ; stabilité non certifiée.
- Streamed : catalogue 541 entrées ; événements futurs affichés. Lecture sportive en cours non validée.

L’audit de disponibilité couvre les 11 fournisseurs Chaînes et les 8 Sports. Il ne constitue pas une validation exhaustive des flux Sports : les événements sans direct testable nécessitent une nouvelle mesure pendant leur diffusion.
- Volkamax : catalogue 629 entrées ; essai Arte, page du lecteur tiers inaccessible. Le message Noctra « Lecteur web chargé » confirme seulement le chargement de l’iframe, pas la lecture. Aucune stabilité validée.
