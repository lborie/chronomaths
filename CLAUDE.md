# CLAUDE.md

## Projet

**Chronomaths** — Application web ludique pour apprendre les 4 opérations : additions, soustractions, multiplications et divisions (CE2).
Sessions chronométrées de calcul mental avec feedback visuel immédiat.

## Stack technique

- **Backend** : Go (serveur HTTP + SSE, `embed.FS`, zéro dépendance externe)
- **Frontend** : HTML5 / CSS3 / Vanilla JS (zéro framework, zéro lib)
- **Port** : 8080

## Structure

```
chronomaths/
├── main.go           # Serveur HTTP : embed, routes, main()
├── session.go        # Session générique 2 joueurs : matchmaking, SSE, déconnexion
├── session_test.go   # Tests de la session générique
├── race.go           # Course de fusées : génération des questions + jeu
├── connect4.go       # Puissance 4 : logique pure + jeu en ligne
├── connect4_test.go  # Tests de la logique de plateau et du jeu en ligne
├── go.mod            # Module Go (aucune dépendance externe)
├── README.md         # Documentation utilisateur (FR)
├── CLAUDE.md         # Ce fichier
└── static/
    ├── index.html    # Écrans : accueil, modes, jeu, résultats, posée, multi, jeux
    ├── style.css     # Variables CSS, responsive, animations
    ├── games.css     # Styles du hub Jeux et du plateau Puissance 4
    ├── app.js        # Machine à états, génération questions (+, −, ×, ÷), timer
    ├── games.js      # Section Jeux : logique pure + rendu du Puissance 4
    ├── manifest.json # Web App Manifest (PWA)
    ├── sw.js         # Service Worker (cache offline)
    └── icon.svg      # Icône PWA
```

## Lancer le projet

```bash
go run .
# http://localhost:8080
```

⚠️ **Après toute modification de `static/`, redémarrer `go run .`** : `//go:embed` fige les fichiers à la compilation, le serveur en cours continue de servir l'ancienne version.

⚠️ En développement, le Service Worker sert en **cache-first** : purger le cache du navigateur (DevTools → Application → Storage → *Clear site data*) après un changement de `static/`, sinon l'ancien bundle reste servi même après redémarrage du serveur.

## Consignes de développement

1. **Maintenir CLAUDE.md** : Mettre à jour ce fichier dès qu'une nouvelle consigne, convention ou décision architecturale est prise.
2. **Maintenir README.md** : Mettre à jour la documentation utilisateur après chaque nouvelle fonctionnalité implémentée.
3. **Code concis** : Privilégier la clarté et la brièveté. Pas de code superflu, pas de sur-ingénierie.
4. **Refactoring systématique** : Après chaque implémentation, factoriser le code dupliqué ou les patterns répétitifs. Extraire les abstractions uniquement quand la duplication est avérée.
5. **Audit sécurité** : Réaliser un audit sécurité après chaque fonctionnalité (injection, XSS, validation des entrées, OWASP top 10).
6. **Audit responsive** : Auditer le front après chaque fonctionnalité pour garantir le responsive (breakpoints, safe-area, touch targets 44px min, `prefers-reduced-motion`, hover uniquement via `@media (hover: hover)`, pas de `background-attachment: fixed`).

## Architecture

### Flux de navigation

```
Accueil ──┬─ (+, −, × ou ÷) → Modes (Sprint/Course/Marathon/Posée/Révision/Multi) → Jeu
          └─ 🎮 Jeux → Hub Jeux ──┬─ Puissance 4 (local)
                                  └─ Puissance 4 en ligne → rejoindre → attente → plateau
```

### Opération configurable

- `config.operation` (`'multiplication'` | `'addition'` | `'subtraction'` | `'division'`) stocke le choix utilisateur
- `generateQuestions(count)` dispatche vers la bonne fonction de génération
- `updateModesScreen()` adapte les libellés dynamiquement selon l'opération
- Le serveur Go reçoit l'opération via `POST /api/join` et génère les questions en conséquence

### Session multijoueur générique (SSE + POST)

- **Server→Client** : Server-Sent Events via `GET /api/events?playerId=XXX` (`EventSource`)
- **Client→Server** : `POST /api/join` (rejoindre) et `POST /api/action` (jouer, header `X-Player-ID`)
- `session.go` ne connaît aucune règle de jeu : il délègue à l'interface `Game` (`Start`, `Action`), implémentée par `raceGame` (`race.go`) et `connect4Game` (`connect4.go`). Chaque jeu s'enregistre dans `gameKinds` via son `init()`.
- Files d'attente isolées par clé : `race:<operation>` ou `connect4`. Un jeu ou une variante inconnus sont **refusés en 400** — sans ce contrôle, une demande mal formée serait appariée dans la file d'un autre jeu.
- Un jeu à plusieurs files implémente `VariantGame.Variant()` (la course en a une par opération) ; le Puissance 4 ne l'implémente pas.
- **Discipline de verrous** : le matchmaking résout la room sous `globalMu`, relâche `globalMu`, puis appelle le jeu ; les callbacks `Game` s'exécutent sous `room.mu` seul.
- ⚠️ `sendEvent` abandonne un message quand le canal du joueur est plein. Tout jeu tour par tour doit donc diffuser un **snapshot complet** de son état, jamais un delta : un delta perdu désynchronise définitivement, un état absolu est auto-réparant.
- ⚠️ `Question.Answer` (race.go) porte `json:"-"` : la question part au client **avant** qu'il ne réponde (events `start` et `scoreUpdate`), un joueur lisant son propre flux SSE gagnerait sinon à coup sûr. Le serveur garde la réponse pour valider et ne la révèle qu'après coup via `scoreUpdate.correctAnswer`. Corollaire pour les tests : la réponse attendue se lit dans l'état serveur (`raceAnswer()` → `p.State.(*raceState)`), jamais dans le flux.
- Chaque joueur reçoit un `playerId` unique (16 hex, `crypto/rand`) au join. Keepalive SSE toutes les 30 s, timeout joueur fantôme 30 s.
- Events génériques : `waiting`, `opponentLeft`. Course : `start`, `scoreUpdate`, `opponentScore`, `win`. Puissance 4 : `start`, `c4State`.
- ⚠️ `session.epoch` (app.js) périme un join encore en vol. `sessionJoin` attend la réponse de `POST /api/join` ; pendant cette attente l'utilisateur peut annuler (« ← Annuler ») ou relancer un join. Sans ce compteur — capturé après le `sessionClose()` d'entrée, revérifié après le `await` — la réponse tardive réinstallait un `playerId` et un flux SSE que plus aucun écran ne pilotait : le joueur restait dans la file du serveur et se retrouvait **projeté sur le plateau** depuis le hub Jeux dès qu'un adversaire rejoignait. Le joueur resté côté serveur n'a jamais ouvert son SSE : `watchGhost` le récupère au bout de 30 s, et son adversaire reçoit `opponentLeft`. Tout nouvel `await` dans `sessionJoin` doit revérifier l'époque.
- **Front** : `sessionJoin({game, operation, name, on, onLost, onError})`, `sessionSend(payload)` et `sessionClose()` vivent dans `app.js` (pas de fichier séparé : cela imposerait une entrée de plus dans le precache de `sw.js` et une contrainte d'ordre de chargement supplémentaire). `on` est une table `nom d'event → handler`.
- Les écrans `screen-multi-join` et `screen-multi-waiting` sont **partagés** par les jeux en ligne : `showJoinScreen({emojiLeft, title, emojiRight, subtitle, waitingEmoji, waitingTilt, back, onSubmit})` en fournit l'habillage et la destination de retour.
- L'écran d'attente flotte son emoji sans rotation (`.waiting-icon`) ; seule la course de fusées ajoute l'inclinaison à −45° façon vol de fusée, via la classe `.waiting-icon.waiting-rocket` posée quand `waitingTilt` est vrai. Ne jamais remonter cette rotation sur la classe de base : elle inclinerait l'emoji de tout futur jeu en ligne.

### Section Jeux

- `static/games.js` et `static/games.css` sont chargés **après** `app.js` et `style.css`. L'ordre est structurant : ce sont des scripts classiques (pas de modules ES), et `games.js` résout `screens`, `showScreen` et `screenCleanups` par portée lexicale globale.
- Tout nouvel écran doit s'enregistrer dans `screens` (sinon `showScreen()` lève une `TypeError`) et, s'il détient un timer ou une connexion, dans le registre `screenCleanups` de `app.js` — appelé en tête de `cleanupScreen()` sans avoir à toucher à son `switch`.
- ⚠️ Ne jamais réutiliser la classe `.operation-card` pour un bouton hors des 4 opérations : elle est bindée globalement vers `config.operation` et fait planter `updateModesScreen()` sur un `labels[op]` undefined.
- **Puissance 4** : deux modes sur le même écran `screen-connect4`, pilotés par `c4.mode` (`'local'` | `'online'`). Les fonctions pures du plateau existent en double, en JS (`games.js`, mode local) et en Go (`connect4.go`, mode en ligne) : toute correction de règle doit être portée des deux côtés.
- Le rendu passe par `renderC4Snapshot(board, {lastMove, line, playable, hint})`, qui reconstruit la grille depuis l'**état complet** du plateau. C'est ce qui permet aux deux modes de partager un seul chemin de rendu. Corollaire : l'animation de chute vit sur la classe `.c4-disc-drop`, appliquée au seul `lastMove` — la mettre sur `.c4-disc` ferait rejouer la chute de tous les jetons à chaque rendu.
- `c4FocusCol` (games.js) est en portée module, pas locale à `renderC4Snapshot` : le plateau est entièrement reconstruit à chaque rendu, et un coup enchaîne deux rendus (`renderC4Move` verrouille la chute, puis révèle l'issue) — une capture locale perdrait la colonne focus entre les deux. Ses deux points de remise à `null` (sortie du plateau, nettoyage d'écran) existent parce que l'heuristique « le focus est sur `<body>` ⇒ c'est notre reconstruction précédente qui l'y a mis » peut être fausse (chargement de page, focus perdu ailleurs) ; `btn-c4-replay`, qui relance une manche sans quitter l'écran, ne fait pas ce nettoyage.
- Les colonnes non jouables sont `disabled` : le verrouillage pendant la chute et hors de son tour est porté par le DOM, sans drapeau de lock.
- `C4_DROP_MS` (games.js) doit rester aligné sur la durée de l'animation `c4Drop` (games.css). `c4DropMs()` retourne 0 sous `prefers-reduced-motion`.
- En ligne, le client n'appelle **jamais** `dropDisc` : il envoie `{type:'drop',col}` et n'affiche que le snapshot renvoyé. La relance d'une manche demande l'accord des deux joueurs (`{type:'rematch'}`).
- Un snapshot n'est animé que si les coordonnées de `lastMove` ont changé depuis le précédent snapshot rendu (`applyC4State`). Se caler sur le nom de l'event rejouerait la chute du jeton précédent à chaque demande de revanche, puisque celle-ci rediffuse le même `lastMove` que la manche déjà terminée. `state.round` est à l'inverse un discriminant trompeur : `Round` s'incrémente précisément sur le seul snapshot qui ne doit pas s'animer (le début d'une nouvelle manche).
- `c4StateMsg` (connect4.go) reflète les champs de `c4Room` à la main dans `snapshot()` : toute nouvelle propriété de `c4Room` doit y être reportée explicitement, sinon elle n'atteint jamais le client (voir le commentaire sur `snapshot()`).
- **Cible tactile des colonnes** : les 44 px de large ne sont pas atteignables sous ~382 px de viewport — 7 colonnes à 44 px réclament 308 px, or un écran de 320 px n'offre que 288 px utiles hors safe-area. Le bloc `@media (max-width: 480px)` de `games.css` rend au plateau les pixels des paddings horizontaux (mesuré : ~35 px à 320 px, 43 px à 375 px, 45 px à 390 px). Ne pas descendre le `gap` sous 3 px pour gagner ces derniers pixels : la grille cesse de se lire comme un Puissance 4, et la colonne fait déjà 263 px de haut sans zone morte. En paysage court (`max-height: 500px`), le plateau n'est **pas** borné par la hauteur : l'y contraindre imposerait des colonnes d'environ 28 px. La page défile donc verticalement en paysage, jamais horizontalement.
- Toute modification de `static/` doit s'accompagner d'un bump de `CACHE_NAME` dans `sw.js` : le Service Worker sert en cache-first, sinon la PWA continue de livrer l'ancienne version.

## Conventions

- Langue de l'UI : français
- Langue du code : anglais
- Pas de dépendances externes (front et back)
- Mobile-first, responsive
- Animations légères adaptées aux enfants
