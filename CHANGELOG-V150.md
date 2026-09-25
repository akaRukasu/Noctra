# Noctra v150

- FSTV : le lecteur n'injecte plus la page distante complète dans le DOM Noctra. Le serveur cherche d'abord le lecteur public réellement présent dans la page de la chaîne (iframe ou média public). S'il n'est pas exposé dans le HTML initial, Noctra conserve la page FSTV officielle intacte et l'affiche en mode focus afin d'éviter l'erreur DLE « Publications at this address ... » provoquée par la réécriture v149.
- FSTV : lorsqu'un média public explicite est présent dans la page, il est relayé par le lecteur Noctra avec le referer FSTV afin d'améliorer la compatibilité plein écran/mobile sans extraire de jeton privé.
- StreamSports99 : découverte refaite autour des miroirs publics actuels. Le miroir `streamsports99.is` est sondé en priorité, puis `.su`, `.tv` et `.ch` en secours.
- StreamSports99 : ajout des rubriques Soccer, Football, Basketball, Baseball, Hockey, MMA, Fight, Motorsport, Tennis, Boxing, Cricket, Rugby, Volleyball, Golf et Live TV.
- StreamSports99 : les URLs `/player/...` sont détectées même lorsqu'elles sont hydratées dans du JSON/JavaScript et ne sont pas encore présentes sous forme de balise `<a>`.
- StreamSports99 : enrichissement des noms d'événements génériques depuis les pages publiques de player, avec cache court.
- Le faux canal générique « StreamSports99 · Sports » n'est plus utilisé quand aucune diffusion n'est trouvée : Noctra affiche un état vide explicite pour distinguer une vraie absence de diffusion d'un bug de catalogue.
- Client, serveur et cache PWA alignés sur v150.
