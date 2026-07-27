# Puissance 4 en ligne + factorisation du mécanisme de session — Design

**Date** : 2026-07-27
**Statut** : validé

## Objectif

Ajouter au Puissance 4 un mode **en ligne**, chacun sur son écran, sur le modèle du « Multi Joueur » des opérations. Au passage, **factoriser le mécanisme de session** (matchmaking, SSE, déconnexion) aujourd'hui soudé à la course de fusées, pour qu'il serve les deux jeux.

Le mode local existant (2 joueurs sur le même écran) est conservé tel quel.

## Décisions cadrées

| Question | Décision |
|---|---|
| Rejouer après une manche | **Accord des deux joueurs** : le score de manches est conservé, le joueur qui commence alterne. Un handshake est nécessaire (les deux doivent cliquer). |
| Entrée dans le mode | **Deux boutons sur le hub Jeux** : `🔴 Puissance 4` (local) et `🌍 Puissance 4 en ligne`. |
| Autorité sur le plateau | **Serveur**. Le client en ligne n'appelle plus `dropDisc` : il envoie une colonne et n'affiche que ce que le serveur renvoie. |
| Forme des events de jeu | **Snapshot complet du plateau**, pas de delta. |
| Emplacement du helper de session front | **Dans `app.js`**, pas de nouveau fichier. |
| Écran du plateau | **`screen-connect4` réutilisé** avec `c4.mode = 'local' \| 'online'`. |
| Écrans « rejoindre » et « attente » | **Mutualisés** entre course de fusées et Puissance 4 en ligne (titre / emoji / sous-titre paramétrés). |
| Découpage de `main.go` | **4 fichiers** : `main.go`, `session.go`, `race.go`, `connect4.go`. |
| Tests | **`connect4_test.go`** (stdlib `testing`) sur la logique de plateau portée en Go. |

## Hors périmètre

- IA / jeu contre l'ordinateur.
- Salons privés avec code d'invitation ; choix de son adversaire.
- Reconnexion / reprise d'une partie après fermeture d'onglet.
- Minuteur de tour (voir « Limite assumée »).
- Spectateurs, chat, persistance du score entre sessions.
- Toute modification fonctionnelle de la course de fusées : son comportement observable reste identique après refactor.

## Architecture

### Découpage des fichiers

`main.go` fait 457 lignes ; la couche session générique + le jeu de plateau le pousseraient au-delà de 900.

| Fichier | Nature | Contenu |
|---|---|---|
| `main.go` | modifié | `embed`, routes HTTP, `main()` |
| `session.go` | **nouveau** | `Player`, `Room`, interface `Game`, matchmaking, pompe SSE, keepalive, déconnexion |
| `race.go` | **nouveau** | Génération des questions + `raceGame` (course de fusées) |
| `connect4.go` | **nouveau** | Logique pure du plateau + `connect4Game` |
| `connect4_test.go` | **nouveau** | Tests de la logique pure portée |
| `static/app.js` | modifié | Helper de session générique ; la course devient un consommateur |
| `static/games.js` | modifié | Mode en ligne du Puissance 4, rendu par snapshot |
| `static/index.html` | modifié | 2e bouton du hub, écrans « rejoindre »/« attente » généralisés, « ← Annuler » en attente, zone rematch |
| `static/games.css` | modifié | États `c4-col:disabled`, statut rematch |
| `static/sw.js` | modifié | Bump `CACHE_NAME` `v2` → `v3` |
| `README.md`, `CLAUDE.md` | modifiés | Documentation (consignes 1 et 2) |

Aucune dépendance ajoutée, ni côté Go ni côté front. Aucun nouveau fichier statique : l'ordre des balises `<script>` et la liste de precache de `sw.js` restent inchangés.

### Couche session générique (Go)

```go
type Game interface {
    // Start initialise l'état de la room et envoie l'event "start" aux deux joueurs.
    Start(r *Room)
    // Action traite un coup. Appelée sous r.mu, jamais sous globalMu.
    Action(r *Room, p *Player, raw json.RawMessage)
}

type Player struct {
    ID, Name     string
    Index        int          // 0 ou 1 dans la room
    events       chan []byte
    done         chan struct{}
    sseConnected bool
    State        any          // état par joueur, spécifique au jeu
}

type Room struct {
    ID, Key string
    Game    Game
    Players [2]*Player
    mu      sync.Mutex
    started bool
    State   any               // état par room, spécifique au jeu
}

var gameKinds = map[string]Game{"race": raceGame{}, "connect4": connect4Game{}}
```

Restent dans le générique : `waitingRooms` / `rooms` / `players`, la pompe SSE, le keepalive 30 s, le timeout du joueur fantôme (SSE jamais connecté), la déconnexion et l'event `opponentLeft`.

`Player.Index` est ajouté parce que le Puissance 4 en a besoin à chaque coup (couleur, entrée dans `Wins`, dans `Rematch`) ; aujourd'hui l'adversaire est retrouvé par comparaison d'ID.

#### Endpoints

| Endpoint | Corps | Rôle |
|---|---|---|
| `POST /api/join` | `{game, name, operation?}` | Matchmaking. Retourne `{playerId}`. |
| `POST /api/action` | brut, relayé au jeu (header `X-Player-ID`) | Un coup. Remplace `POST /api/answer`. |
| `GET /api/events?playerId=…` | — | Flux SSE. Inchangé. |

**Clé de file d'attente** : `race:<operation>` ou `connect4`.

Validation stricte, par jeu : `game` absent de `gameKinds` → **400**. `operation` n'est lu que par `race`, et une valeur hors des quatre opérations connues → **400**. C'est un changement de comportement volontaire : aujourd'hui `handleJoinHTTP` normalise toute opération inconnue en `multiplication`, si bien qu'un join Puissance 4 sans `operation` valide se retrouverait apparié dans la file des multiplications, face à un joueur qui attend des calculs.

#### Discipline de verrous

Une seule règle, tenue partout :

1. Le matchmaking résout / crée la room sous `globalMu`.
2. `globalMu` est **relâché**.
3. Les callbacks `Game` (`Start`, `Action`) s'exécutent sous `room.mu` **seul**.

Aujourd'hui `handleJoinHTTP` relâche déjà `globalMu` avant d'émettre les events de départ (`main.go:250`) alors que `handleAnswerHTTP` tient `room.mu` pendant ses envois. Sans règle explicite, l'introduction du callback `Game` créerait un risque d'inversion d'ordre de verrous qui n'existe pas actuellement.

### Course de fusées — refactor sans changement fonctionnel

- `RaceRoom{Operation string}` dans `Room.State` ; `RaceState{Score int; Question Question}` dans `Player.State`.
- `Start` : génère la première question, envoie `start`.
- `Action` : corps `{"answer": N}`. Barème inchangé (+1 / −3 plancher 0, victoire à 20). Events `scoreUpdate`, `opponentScore`, `win` inchangés, mêmes noms et mêmes champs.

### Puissance 4 en ligne

Les quatre fonctions pures de `games.js` sont portées en Go : `c4CreateBoard`, `c4Drop`, `c4FindWin`, `c4IsDraw`. `games.js` conserve les siennes pour le mode local — le mode local ne fait aucun appel réseau.

```go
type C4Room struct {
    Board    [6][7]int  // 0 vide, 1 rouge, 2 jaune ; ligne 0 = haut
    Current  int        // couleur qui doit jouer
    Starter  int        // couleur ayant commencé la manche
    Over     bool       // invariant : Over ⇔ Result != ""
    Result   string     // "" | "win" | "draw"
    Winner   int        // 0 | 1 | 2
    Line     []Cell     // cellules gagnantes, nil sinon
    LastMove *Cell      // dernier jeton posé, nil en début de manche
    Wins     [2]int     // indexé par Player.Index (0 = rouge, 1 = jaune)
    Rematch  [2]bool
    Round    int
}
```

`Players[0]` est **🔴 Rouge** et commence la manche 1 ; `Players[1]` est **🟡 Jaune**.

#### Protocole

Client → serveur (`POST /api/action`) :

| Action | Corps |
|---|---|
| Poser un jeton | `{"type":"drop","col":N}` |
| Demander une nouvelle manche | `{"type":"rematch"}` |

Serveur → client :

| Event | Charge utile |
|---|---|
| `waiting` | `{name}` — générique, inchangé |
| `start` | `{you, opponent, color, state}` — `color` vaut 1 ou 2 |
| `c4State` | `{state}` |
| `opponentLeft` | `{}` — générique |

`state` est le **snapshot complet** : `board`, `current`, `over`, `result`, `winner`, `line`, `lastMove`, `wins`, `rematch`, `round`.

Pourquoi un snapshot et pas un delta `(row, col)` : `sendEvent` abandonne silencieusement un message quand le canal du joueur est plein (`main.go:185`). Pour la course, un `scoreUpdate` perdu est cosmétique — le suivant corrige l'affichage. Pour un tour par tour, un coup perdu désynchronise le plateau **définitivement**. Un état absolu est auto-réparant : le client repart de la vérité serveur à chaque event. Le client diffe uniquement pour l'animation, via `lastMove`.

#### Validation d'un coup

Un `drop` est appliqué si et seulement si : la room est démarrée, `Over` est faux, `Current` correspond à la couleur du joueur, `0 ≤ col < 7`, la colonne n'est pas pleine. Sinon le coup est **ignoré sans effet ni event** — le client est déjà dans l'état correct, puisqu'il rend depuis le serveur.

#### Fin de manche et handshake de rematch

À la pose d'un jeton :

- alignement → `Over = true`, `Result = "win"`, `Winner`, `Line`, `Wins[gagnant]++` ;
- sinon plateau plein → `Over = true`, `Result = "draw"` ;
- sinon `Current` passe à l'autre couleur.

Puis diffusion du snapshot aux deux joueurs.

Le handshake :

1. `{"type":"rematch"}` reçu alors que `Over` est faux → ignoré.
2. `Rematch[p.Index] = true`. Idempotent : recliquer ne change rien.
3. Un seul des deux est prêt → diffusion du snapshot. Le demandeur voit « ⏳ En attente de Léa… » (bouton désactivé), l'autre voit « 🔄 Léa veut rejouer ».
4. Les deux sont prêts → nouvelle manche : `Board` vierge, `Starter` alterne, `Current = Starter`, `Over = false`, `Result = ""`, `Line = nil`, `LastMove = nil`, `Round++`, `Rematch = [false,false]`. `Wins` est conservé. Diffusion.

#### Perte de l'adversaire ou de la connexion

En ligne, `opponentLeft` et `onLost` sont traités **sur l'écran du plateau**, sans écran supplémentaire : la zone de tour affiche un message persistant (`🚪 Adversaire déconnecté` / `⚠️ Connexion perdue`), les colonnes sont désactivées, et la zone d'actions ne propose plus que « ← Retour » (le bouton de nouvelle manche est masqué). Le plateau reste visible : la partie interrompue est lisible plutôt qu'escamotée.

### Front — factorisation de la session

Le helper vit **dans `app.js`**. Un fichier séparé imposerait une entrée de plus dans le precache de `sw.js` et une contrainte d'ordre de chargement supplémentaire, alors que `games.js` dépend déjà de l'ordre pour résoudre `screens` / `showScreen` / `screenCleanups`.

```js
// POST /api/join → EventSource → câblage des handlers
sessionJoin({ game, operation, name, on, onLost })
sessionSend(payload)   // POST /api/action + header X-Player-ID
sessionClose()
```

- `on` est une table `nom d'event SSE → handler`. La couche session n'interprète aucune charge utile : elle parse le JSON et délègue.
- `onLost` est appelé quand l'`EventSource` passe en `CLOSED` de façon inattendue. La course y branche son écran « adversaire déconnecté », le Puissance 4 son retour au hub.
- Les cas `multiWaiting` / `multiRace` / `multiWin` **sortent du `switch` de `cleanupScreen`** et deviennent des entrées de `screenCleanups` appelant `sessionClose()`. C'est la part front de la factorisation demandée : `cleanupScreen` ne connaît plus aucun jeu, seul `game` (le timer solo) reste dans son `switch`.
- `screenCleanups.connect4` ferme la session **en plus** d'annuler le timer de chute, quel que soit le mode.

#### Écrans mutualisés

`screen-multi-join` et `screen-multi-waiting` servent les deux jeux. Leur titre, emoji et sous-titre sont paramétrés à l'ouverture :

| | Course de fusées | Puissance 4 en ligne |
|---|---|---|
| Titre | `🎮 Multi Joueur 🚀` | `🌍 Puissance 4 en ligne 🔴` |
| Sous-titre | `Course de fusées !` | `Trouve un adversaire !` |
| Emoji d'attente | `🚀` | `🔴` |

Le bouton « Retour » de l'écran « rejoindre » revient à l'écran d'où l'on vient (Modes pour la course, hub Jeux pour le Puissance 4) : la destination est fournie à l'ouverture.

L'écran d'attente gagne un bouton **« ← Annuler »** (qui appelle `sessionClose()` puis revient à cette même destination). Il n'en a aucun aujourd'hui : le manifeste déclare `display: standalone`, donc en PWA installée un joueur en attente d'adversaire est dans un cul-de-sac, sans barre de navigation pour revenir. Le correctif profite aux deux jeux, d'où sa place dans cette factorisation.

#### Plateau : un seul écran, un seul rendu

`screen-connect4` est réutilisé, piloté par `c4.mode` (`'local'` ou `'online'`).

Le rendu devient **un rendu par snapshot** pour les deux modes :

```js
renderC4Snapshot(board, { lastMove, line, playable })
```

Il reconstruit la grille (42 cellules), place tous les jetons, n'applique l'animation de chute (`--c4-fall`) qu'à `lastMove`, la classe gagnante qu'aux cellules de `line`, et désactive les colonnes si `playable` est faux. Le mode local l'appelle après chaque coup avec son plateau local ; le mode en ligne l'appelle à chaque `c4State`. L'incrémental `placeC4Disc` disparaît : rendre depuis l'état absolu est la seule façon d'afficher correctement un snapshot serveur, et unifier les deux modes évite deux chemins de rendu à maintenir.

Différences entre les modes, et elles seules :

| | Local | En ligne |
|---|---|---|
| Clic colonne | `dropDisc` local puis rendu | `sessionSend({type:'drop',col})` |
| Colonnes actives | toujours (hors animation) | seulement à ton tour |
| Libellé du tour | `🔴 À Rouge de jouer` | `🔴 À toi de jouer` / `🟡 Au tour de Léa` |
| Score | `🔴 Rouge 2 – 1 Jaune 🟡` | `🔴 Ludo 2 – 1 Léa 🟡` |
| Fin de manche | `🏆 🔴 Rouge gagne !` | `🏆 Tu gagnes !` / `😢 Léa gagne !` / `🤝 Match nul !` |
| Bouton rejouer | reset immédiat | `sessionSend({type:'rematch'})` + statut d'attente |

En ligne, aucun rendu optimiste : le jeton n'apparaît qu'au retour du serveur. L'aller-retour est local ou en LAN ; l'alternative (rendu optimiste + rollback) coûterait un chemin de code supplémentaire pour un gain invisible.

#### Hub Jeux

Deux boutons `.multi-btn` : `🔴 Puissance 4` (2 joueurs, même écran) et `🌍 Puissance 4 en ligne` (chacun son écran).

⚠️ La classe `.operation-card` est interdite ici : elle est bindée globalement vers `config.operation` et ferait planter `updateModesScreen()` sur un `labels[op]` indéfini (contrainte déjà documentée dans `CLAUDE.md`).

## Nouveaux écrans et enregistrements

Aucun nouvel écran n'est créé : les écrans « rejoindre », « attente » et « plateau » sont réutilisés. Rien à ajouter à `screens`. `screenCleanups` gagne `multiWaiting`, `multiRace`, `multiWin` (déplacés depuis le `switch`) et `connect4` est étendu pour fermer la session.

## Tests

`connect4_test.go`, stdlib `testing`, sur la logique portée — le seul endroit où une régression serait silencieuse :

- alignements dans les 4 directions (horizontal, vertical, deux diagonales), y compris un alignement de 5 ;
- absence de faux positif sur un alignement de 3 ;
- `c4Drop` empile bien vers le bas, et retourne −1 sur colonne pleine et sur colonne hors bornes ;
- `c4IsDraw` seulement quand la ligne du haut est complète ;
- alternance du `Starter` sur plusieurs manches et conservation de `Wins`.

## Audit sécurité (à réaliser après implémentation, consigne 5)

Points connus à couvrir :

- **`/api/action` mute un état partagé**, contrairement à `/api/answer` qui ne touchait que le score de l'appelant : validation du tour et des bornes de colonne côté serveur, pas de coup à la place de l'adversaire.
- **Troncature du nom** : `joinData.Name[:15]` coupe sur les octets et peut produire de l'UTF-8 invalide sur un prénom accentué. À passer en runes pendant le refactor de `join`.
- **XSS** : tous les noms de joueurs affichés le sont via `textContent`, jamais `innerHTML`. À vérifier dans le nouveau code (libellés de tour, de score, statut de rematch).
- Validation stricte de `game` / `operation` (400 au lieu d'un défaut silencieux), bornes de `col`, corps JSON malformé.
- Pas de fuite d'ID : un joueur ne reçoit jamais le `playerId` de son adversaire.

## Audit responsive (à réaliser après implémentation, consigne 6)

Cibles ≥ 44 px sur les colonnes du plateau y compris désactivées, indice de survol uniquement sous `@media (hover: hover)`, `prefers-reduced-motion` sur l'animation de chute et sur le statut de rematch, safe-area sur les écrans réutilisés, pas de débordement horizontal du plateau en paysage sur mobile.

## Limite assumée

Un joueur qui s'éloigne **sans fermer l'onglet** bloque la partie : son adversaire attend un coup qui n'arrive jamais. Le timeout de 30 s ne couvre que le cas du SSE jamais connecté, et le flux SSE reste ouvert tant que l'onglet vit. Pas de minuteur de tour dans ce périmètre — la contrainte est documentée plutôt que contournée.
