# CLAUDE.md

## Projet

**Chronomaths** — Application web ludique pour apprendre les 4 opérations : additions, soustractions, multiplications et divisions (CM1).
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
├── battleship.go     # Bataille navale : logique pure + jeu en ligne
├── battleship_test.go # Tests du plateau, du jeu en ligne et de la confidentialité
├── go.mod            # Module Go (aucune dépendance externe)
├── README.md         # Documentation utilisateur (FR)
├── CLAUDE.md         # Ce fichier
└── static/
    ├── index.html    # Écrans : accueil, modes, jeu, résultats, posée, multi, jeux
    ├── style.css     # Variables CSS, responsive, animations
    ├── games.css     # Styles du hub Jeux et du plateau Puissance 4
    ├── app.js        # Machine à états, génération questions (+, −, ×, ÷), timer
    ├── games.js      # Section Jeux : logique pure + rendu du Puissance 4
    ├── battleship.js # Bataille navale en ligne : rendu par snapshot
    ├── battleship.css# Styles des grilles de la bataille navale
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
                                  ├─ Puissance 4 en ligne → rejoindre → attente → plateau
                                  └─ Bataille navale en ligne → rejoindre → attente → plateau
```

### Opération configurable

- `config.operation` (`'multiplication'` | `'addition'` | `'subtraction'` | `'division'`) stocke le choix utilisateur
- `generateQuestions(count)` dispatche vers la bonne fonction de génération
- `updateModesScreen()` adapte les libellés dynamiquement selon l'opération
- Le serveur Go reçoit l'opération via `POST /api/join` et génère les questions en conséquence

### Session multijoueur générique (SSE + POST)

- **Server→Client** : Server-Sent Events via `GET /api/events?playerId=XXX` (`EventSource`)
- **Client→Server** : `POST /api/join` (rejoindre) et `POST /api/action` (jouer, header `X-Player-ID`)
- `session.go` ne connaît aucune règle de jeu : il délègue à l'interface `Game` (`Start`, `Action`), implémentée par `raceGame` (`race.go`), `connect4Game` (`connect4.go`) et `battleshipGame` (`battleship.go`). Chaque jeu s'enregistre dans `gameKinds` via son `init()`.
- Files d'attente isolées par clé : `race:<operation>`, `connect4` ou `battleship`. Un jeu ou une variante inconnus sont **refusés en 400** — sans ce contrôle, une demande mal formée serait appariée dans la file d'un autre jeu.
- Un jeu à plusieurs files implémente `VariantGame.Variant()` (la course en a une par opération) ; le Puissance 4 ne l'implémente pas.
- **Discipline de verrous** : le matchmaking résout la room sous `globalMu`, relâche `globalMu`, puis appelle le jeu ; les callbacks `Game` s'exécutent sous `room.mu` seul.
- ⚠️ `sendEvent` abandonne un message quand le canal du joueur est plein. Tout jeu tour par tour doit donc diffuser un **snapshot complet** de son état, jamais un delta : un delta perdu désynchronise définitivement, un état absolu est auto-réparant.
- ⚠️ `Question.Answer` (race.go) porte `json:"-"` : la question part au client **avant** qu'il ne réponde (events `start` et `scoreUpdate`), un joueur lisant son propre flux SSE gagnerait sinon à coup sûr. Le serveur garde la réponse pour valider et ne la révèle qu'après coup via `scoreUpdate.correctAnswer`. Corollaire pour les tests : la réponse attendue se lit dans l'état serveur (`raceAnswer()` → `p.State.(*raceState)`), jamais dans le flux.
- Chaque joueur reçoit un `playerId` unique (16 hex, `crypto/rand`) au join. Keepalive SSE toutes les 30 s, timeout joueur fantôme 30 s.
- Events génériques : `waiting`, `opponentLeft`. Course : `start`, `scoreUpdate`, `opponentScore`, `win`. Puissance 4 : `start`, `c4State`. Bataille navale : `start`, `bsState`.
- ⚠️ `session.epoch` (app.js) périme un join encore en vol. `sessionJoin` attend la réponse de `POST /api/join` ; pendant cette attente l'utilisateur peut annuler (« ← Annuler ») ou relancer un join. Sans ce compteur — capturé après le `sessionClose()` d'entrée, revérifié après le `await` — la réponse tardive réinstallait un `playerId` et un flux SSE que plus aucun écran ne pilotait : le joueur restait dans la file du serveur et se retrouvait **projeté sur le plateau** depuis le hub Jeux dès qu'un adversaire rejoignait. Le joueur resté côté serveur n'a jamais ouvert son SSE : `watchGhost` le récupère au bout de 30 s, et son adversaire reçoit `opponentLeft`. Tout nouvel `await` dans `sessionJoin` doit revérifier l'époque.
- **Front** : `sessionJoin({game, operation, name, on, onLost, onError})`, `sessionSend(payload)` et `sessionClose()` vivent dans `app.js` (pas de fichier séparé : cela imposerait une entrée de plus dans le precache de `sw.js` et une contrainte d'ordre de chargement supplémentaire). `on` est une table `nom d'event → handler`.
- Les écrans `screen-multi-join` et `screen-multi-waiting` sont **partagés** par les jeux en ligne : `showJoinScreen({emojiLeft, title, emojiRight, subtitle, waitingEmoji, waitingTilt, back, onSubmit})` en fournit l'habillage et la destination de retour.
- L'écran d'attente flotte son emoji sans rotation (`.waiting-icon`) ; seule la course de fusées ajoute l'inclinaison à −45° façon vol de fusée, via la classe `.waiting-icon.waiting-rocket` posée quand `waitingTilt` est vrai. Ne jamais remonter cette rotation sur la classe de base : elle inclinerait l'emoji de tout futur jeu en ligne.
- ⚠️ **La bataille navale a de l'état caché**, contrairement au Puissance 4 dont le plateau est public. Son état de jeu part par `sendEvent(p, …)` avec une **vue par joueuse**, jamais par `broadcast`. La confidentialité est portée par le **typage** : `bsEnemyView` n'a aucun champ capable de contenir une case de bateau non touchée, donc réintroduire la fuite exigerait d'y ajouter un champ. C'est la leçon de `Question.Answer` dans `race.go`, où `json:"-"` fermait la fuite mais demandait de s'en souvenir. Un test de confidentialité audite le payload émis sur deux plans : un **balayage récursif du sous-arbre `enemy`**, qui échoue si une case non tirée y apparaît ; et un **verrouillage du jeu de clés** de la racine, de `enemy`, de `you` et de `lastShot`, qui échoue sur tout champ ajouté à l'un de ces quatre objets. Le balayage ne peut pas s'étendre à `you` ni à `lastShot` : ils portent légitimement des cases que la destinataire n'a jamais tirées (ses propres bateaux intacts, la case d'un tir adverse). Sur ces deux branches, le verrou de forme est donc le seul filet — et il n'existe que depuis qu'un contrôle négatif a montré qu'un champ portant la flotte adverse ajouté à `bsShot` ou à `bsSelfView` passait alors la suite entière au vert.

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

### Bataille navale

- `static/battleship.js` et `static/battleship.css` sont des fichiers **dédiés**, chargés après `app.js` dont ils résolvent les helpers par portée globale. Ils ajoutent deux entrées au precache de `sw.js` — c'est le coût assumé de ne pas gonfler `games.js`, qui atteignait déjà 509 lignes.
- Trois phases sur un seul écran `screen-battleship`, pilotées par `state.phase` (`placement` | `battle` | `over`). `renderBsSnapshot(state)` reconstruit tout depuis l'état complet.
- Le placement est **aléatoire côté serveur** : le serveur n'accepte jamais une flotte venue du client, ce qui supprime toute validation de placement triché.
- Les cases non jouables sont `disabled` : le verrou est porté par le DOM, sans drapeau de lock. Une case déjà tirée l'est aussi.
- `bsFocusCell` est en portée module, pour la même raison que `c4FocusCol` : la grille est entièrement reconstruite à chaque rendu. C'est une **ancre**, pas nécessairement une case focalisable — une case tirée reste `disabled` définitivement et le tour adverse désactive la grille entière. `bsRestoreFocus` se replie donc sur la **première case jouable à partir de l'ancre, dans l'ordre du DOM** : là où `Tab` aurait mené, cette grille ne s'explorant qu'à la tabulation (pas de navigation aux flèches), si bien que la case utile après un tir est la suivante de la séquence et non la voisine géométrique du dessous. Sans ce repli, l'ancre restait épinglée sur la case qu'on venait de tirer et **aucun rendu ultérieur ne pouvait plus rendre le focus**, y compris au retour de la main. Quand aucune case n'est jouable, l'ancre est **conservée** sans rien focaliser : c'est ce qui ramène le focus dans la grille au retour de la main.
- ⚠️ `.bs-cell-aimed` marque la visée par un `box-shadow` **inset**, jamais par un `outline` : `.bs-cell-target:focus-visible` porte déjà un `outline` avec une spécificité supérieure — (0,2,0) contre (0,1,0), et la spécificité l'emporte sur l'ordre source — or dans le flux clavier la **même** case est visée et focalisée. Un `outline` ici serait toujours perdu, et l'utilisatrice clavier ne pourrait pas distinguer « focalisée » de « focalisée et visée ». Le flux souris y échappait, `:focus-visible` ne s'appliquant pas après un clic.
- `#bs-status` et `#bs-rematch-status` portent `aria-live="polite"`, comme `#c4-turn` et `#c4-rematch-status` : sans cela un lecteur d'écran n'annonce ni le changement de tour ni « ☠️ Tu as coulé le Torpilleur ! ». C'est aussi le seul canal qui reste quand la grille n'a aucune case focalisable, c'est-à-dire pendant tout le tour adverse.
- Un snapshot n'est animé que si les coordonnées de `lastShot`, **ou son autrice (`by`)**, ont changé depuis le précédent rendu — deux tirs peuvent viser les mêmes coordonnées sur deux grilles différentes (la mienne et celle de l'adversaire), `by` est le seul champ qui les distingue. Ni le nom de l'event (la revanche rediffuse le même `lastShot`) ni `Round` (il s'incrémente sur le snapshot qui ne doit pas s'animer) ne sont des discriminants valides.
- **En portrait sur téléphone, les 44 px ne sont pas atteignables pour 8 colonnes** (mesuré : 28,0 px à 320 px, 34,9 px à 375 px, 36,8 px à 390 px) : assumé. **En paysage**, la largeur cesse d'être la contrainte et la grille atteint 46,5 px à 740×360, au-delà du seuil. C'est le portrait — cas d'usage dominant — qui motive la réponse retenue, **« viser puis confirmer »** — un tap sélectionne, le bouton « 🎯 Feu ! » de 44 px tire — et non un rétrécissement de la grille. Ne pas descendre le `gap` sous 3 px pour gratter ces derniers pixels. À réévaluer si le geste s'avère pénible à l'usage.
- `bsStateMsg` reflète `bsRoom` à la main : tout nouveau champ doit y être reporté, et un champ ajouté à la légère peut révéler la flotte adverse.
- ⚠️ `#bs-rematch-status` porte **deux usages** : le statut d'attente de revanche/placement (trois messages : « ⏳ En attente de X… » en placement, le même après la manche, et « 🔄 X veut rejouer » quand c'est l'adversaire qui attend) et l'annonce du bateau coulé. Le statut d'attente est **prioritaire** sur l'annonce — `bsUpdateRematch` écrit toujours ce champ en premier (message d'attente ou chaîne vide), et `bsAnnounceSunk` ne pose son annonce que si le créneau est resté vide. C'est aussi ce qui efface l'annonce au tir suivant : `bsUpdateRematch` aura déjà réinitialisé le champ avant le nouvel appel. **Un chemin atteignable perd l'annonce du bateau qui achève la manche** : le snapshot de fin est abandonné pour moi (`sendEvent` abandonne sur canal plein), l'adversaire demande la revanche, et le snapshot suivant porte à la fois le `lastShot` inchangé — que `bsShotChanged` voit neuf, donc l'animation part — et « 🔄 … veut rejouer », qui occupe déjà le créneau. Accepté : la ligne de statut annonce 🏆/😢 de son côté, et l'attente de revanche est l'information actionnable.
- Chaque grille porte **son** compteur, et les deux ne mesurent pas la même chose : `#bs-grid-title` affiche « Flotte adverse — *n* bateaux à flot » (`enemy.remaining`), `#bs-minimap-title` « Ta flotte — *n* bateaux coulés » (compté sur `you.ships[i].sunk`). De l'adversaire on ne sait rien de ses dégâts partiels, donc seul le nombre de bateaux entiers a un sens ; de son côté c'est le nombre de pertes qui compte. Les deux libellés sont posés dans `renderBsSnapshot`, pas dans `applyBsState` ni `bsUpdateRematch` : `bsAim` et le bouton « 🎯 Feu ! » appellent `renderBsSnapshot` seul, un libellé posé ailleurs se périmerait au premier rendu déclenché par une visée. `enemy.remaining` n'a que ce consommateur — **le retirer de `bsEnemyView` obligerait à toucher au verrou de forme de `enemy`** dans le test de confidentialité, or ce verrou est le seul filet des branches `you` et `lastShot`, que le balayage récursif ne peut pas couvrir. Un compteur sans lecteur valait moins que ce verrou intact.
- `#bs-score` affiche les prénoms dans l'**ordre des sièges** (`🚢 <siège 1> n – n <siège 2> 🚢`), jamais « moi d'abord » : `wins` est indexé par siège, les deux clientes rendent donc la même chaîne dans le même ordre et l'une peut lire le score sur l'écran de l'autre. Même choix que `updateC4OnlineScore`, qui indexe par couleur. C'est `bsOnline.myName`, posé au join, qui donne le prénom local.
- `.play-again-btn:disabled` vit dans **`style.css`** et non dans `battleship.css` : le bouton est partagé, et `replay.disabled` était déjà posé par les deux jeux en ligne (`updateC4OnlineRematch`, `bsUpdateRematch`) **sans aucun style associé** — le bouton gardait son dégradé animé et son curseur de main, si bien que rien ne disait que la demande de revanche était partie. La règle coupe l'animation en plus de griser : un bouton grisé qui continue de pulser se fait remarquer pour rien. `:hover` est passé en `:not(:disabled):hover` par la même occasion.
- L'annonce « je coule un bateau adverse » lit **`lastShot.sunkName`**, que le serveur calcule au moment où le tir s'applique (`bsFire` le retourne, `bsPlay` le reporte dans `bsShot`). **Aucun delta** entre deux snapshots, conformément à la règle du dépôt. `enemy.sunkShips` ne peut pas servir à retrouver ce nom : il est construit en parcourant la flotte, donc dans l'ordre de `bsFleetSpec` et jamais dans l'ordre chronologique des coulages — le comparer au snapshot précédent produisait un nom **faux**, et pas seulement une annonce avalée, dès qu'un snapshot intermédiaire était abandonné (`sendEvent` abandonne sur canal plein) : Croiseur coulé sur un snapshot perdu, puis Torpilleur coulé, et l'annonce nommait le Croiseur. `sunkName` ne révèle rien à personne — il n'est non vide que sur `result == "sunk"`, donc quand **toutes** les cases du bateau sont déjà connues des deux côtés : de la tireuse par `enemy.hits`, de la victime par `you.ships[i].sunk`. ⚠️ `bsShot` part **tel quel aux deux joueuses** : toute autre addition à ce struct doit refaire cet argument pour les deux destinataires, et se passer de `omitempty` — le test de confidentialité verrouille le jeu de clés de `lastShot`. Le sens inverse, « mon bateau coule », s'apparie par coordonnées avec `lastShot` et n'a jamais eu besoin d'historique.
- **Le coulage d'un bateau est marqué par un emoji, sur deux crans seulement** : raté comme touché gardent le seul sursaut de case d'origine, inchangé ; coulé reçoit un 💥 qui déborde franchement de sa case, plus une ☠️. Aucun emoji nouveau n'entre dans l'appli — 💥 vient de l'écran de jonction, ☠️ de l'annonce que `bsAnnounceSunk` pose au même instant, si bien que la case montre le symbole que la ligne de statut écrit.
- ⚠️ **Un troisième cran pour le simple touché a été essayé puis retiré**, et le réintroduire demande de relire le commentaire dédié dans `battleship.css`. Une étincelle de 0,8 × la case reste entièrement **dans** la case, or une case touchée porte déjà `--bs-hit` en fond — un rouge plein (#ff4757) — et le glyphe 💥 est lui-même rouge-orange : mesuré à l'écran, le résultat est une tache pâle, pas une explosion. L'agrandir à 1,18 × n'a presque rien changé et un halo blanc en deux passes n'a fait **aucune** différence visible ; aller plus loin en taille aurait effacé la distinction avec le coulé. **C'est le débordement qui rend un emoji lisible, pas sa taille** : le coulé échappe au problème parce qu'à 1,7 × la case, les pointes de l'étoile et la tête de mort atterrissent sur l'eau pâle des voisines. Le touché reste distingué du raté par la couleur de la case, comme avant.
- ⚠️ **L'emoji est dimensionné en unités de conteneur** (`container-type: size` sur la case, `font-size: …cqh` sur le pseudo-élément), **jamais en `em` ni en `rem`**. Le `font-size` d'une case ne suit pas sa largeur : mesuré, une case de la grille de tir est un `<button>` à **13,33 px** de police — les boutons n'héritent pas de celle de la page — là où une case de mini-carte est un `<div>` à **16 px**. Le même `em` donnerait donc deux tailles différentes sur les deux grilles, et aucune des deux ne bougerait entre un écran de 320 px et un desktop. Avec `cqh`, un seul nombre vaut de la case de 46,5 px du desktop à celle de **14,96 px** de la mini-carte, sans media query : mesuré 79 px de 💥 à 900 px de viewport contre 52 px à 340 px, soit 1,7 × la case dans les deux cas. `contain: size` ne clippe pas (seul `contain: paint` le ferait), donc l'emoji déborde toujours.
- ⚠️ `position: relative` sur `.bs-cell-boom` est **fonctionnel et non décoratif** : `.bs-container` porte un `backdrop-filter`, ce qui en fait le bloc conteneur des descendants absolus — sans cette ligne le pseudo-élément atterrit au centre du conteneur et non sur sa case. Le retirer « parce que ça ne sert à rien » casse tout l'effet **sans lever la moindre erreur**. `z-index` fait passer la case au-dessus de ses voisines, qui sont en `static`, et `pointer-events: none` évite que le glyphe qui déborde n'avale les taps de ces voisines, elles bien cliquables.
- ⚠️ **L'état de base de la couche emoji est `opacity: 0`, et c'est là que tient toute la sûreté du dispositif.** Une animation sans `animation-fill-mode` revient à son état de base en se terminant, or la classe **survit jusqu'au prochain snapshot** : sans base invisible, l'emoji resterait collé sur la case indéfiniment. Vérifié à la mesure, classes encore posées 1,4 s après : les deux pseudos à `opacity: 0`, case sans transformation résiduelle. Deux corollaires : toute addition à cette couche doit poser son invisibilité **dans la règle de base**, pas seulement au 100 % de son keyframe ; et `animation-fill-mode: backwards` est **proscrit** — `animation-delay` n'est pas neutralisé par le reset `prefers-reduced-motion` de `style.css` (il ne touche que `animation-duration`, `-iteration-count` et `transition-duration`), donc les cases retardées de l'onde seraient rendues à leur 0 % pendant leur délai.
- **Même ☠️, direction inversée selon le sens du coulage** : il **monte** sur la grille de tir (je viens de gagner quelque chose, c'est le « + points » d'un jeu vidéo) et **descend** sous la case sur ma mini-carte (je viens de perdre un bateau). Une seule keyframe de différence, `bsSkullSink`, posée par la classe `.bs-boom-mine`. Ne pas unifier les deux : un ☠️ qui monte en fanfare sur sa propre flotte est à contresens.
- L'onde qui court le long de la coque n'existe **que sur la mini-carte**, et c'est une conséquence du protocole, pas un oubli : sur la grille de tir le client ne connaît que la case tirée, `bsEnemyView` ne portant aucune case de bateau. Le rang de l'onde est la **distance** à l'impact et non l'index de tri, pour qu'un bateau touché en son milieu parte des deux côtés à la fois. `bsAnimateShot` reçoit donc l'**état complet** et non le seul `shot`, `state.you.ships` étant sa seule source de cases.
- `content: '💥' / ''` en **double déclaration** n'est pas une coquille : la forme à deux valeurs donne un texte alternatif vide aux lecteurs d'écran qui restituent le contenu généré (vérifié retenue, valeur calculée `"💥" / ""`), et la déclaration simple qui la précède est le repli des moteurs qui ne parsent pas la barre oblique — sans elle la déclaration invalide tomberait et il n'y aurait plus d'emoji du tout.
- `bsBlast` est en `linear` et non en `ease-out` : les pourcentages valent alors des millisecondes, et le sens est complet au pic (**280 ms**) plutôt qu'en fin de course. Ça compte parce que les deux grilles sont reconstruites à chaque snapshot : une animation trop longue est **coupée en vol**, et c'est déjà le cas d'un tir enchaîné après un touché.
- `applyBsState` replie `state.yourTurn` avec `!bsOnline.lost`, et la ligne de statut affiche `bsOnline.lost` en priorité : sans cela, un `bsState` arrivant après `opponentLeft` réactiverait la grille verrouillée et effacerait le message de déconnexion. Le Puissance 4 porte la même garde dans `applyC4State`.

## Conventions

- Langue de l'UI : français
- Langue du code : anglais
- Pas de dépendances externes (front et back)
- Mobile-first, responsive
- Animations légères adaptées aux enfants
