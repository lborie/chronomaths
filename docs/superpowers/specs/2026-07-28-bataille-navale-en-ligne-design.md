# Bataille navale en ligne — Design

**Date** : 2026-07-28
**Statut** : validé

## Objectif

Ajouter un **troisième jeu** à la section Jeux : une bataille navale à deux joueuses, chacune sur son écran. Comme le Puissance 4, c'est une récompense entre deux séries d'entraînement — **aucun calcul n'est demandé**.

Le jeu n'existe qu'**en ligne**. Une bataille navale repose sur de l'information cachée : deux joueuses devant le même écran verraient la flotte de l'autre, le mode local n'a donc pas de sens.

La couche de session générique (`session.go`) et les écrans « rejoindre » / « attente » livrés avec le Puissance 4 en ligne sont réutilisés tels quels. **Aucune modification de `session.go` ni de `app.js`** n'est nécessaire.

## Décisions cadrées

| Question | Décision |
|---|---|
| Place du calcul mental | **Aucune**. Jeu de détente, comme le Puissance 4. |
| Mode local | **Non**, jeu en ligne uniquement (information cachée). |
| Grille | **8×8**, repérage colonnes `A`–`H` et lignes `1`–`8`. |
| Flotte | **4 bateaux, 12 cases** : Porte-avions 4, Croiseur 3, Sous-marin 3, Torpilleur 2. |
| Bateaux adjacents | **Autorisés** (règle classique). Décision explicite, épinglée par un test. |
| Placement | **Aléatoire côté serveur**, avec un bouton « 🎲 Mélanger » à volonté puis « ✓ Je suis prête ». Pas de glisser-déposer. |
| Validité du placement | Garantie par construction : le serveur **n'accepte jamais** une flotte venue du client. |
| Règle du tour | **Touché → on rejoue.** Raté → la main passe. |
| Autorité sur la partie | **Serveur.** Le client envoie une case et n'affiche que le snapshot renvoyé. |
| Forme des events de jeu | **Snapshot complet, par joueuse**, jamais de delta. |
| Confidentialité de la flotte | **Structurelle** : le payload adverse est typé de sorte qu'une case de bateau non touchée n'y a aucune représentation possible. |
| Déclenchement du tir | **Viser puis confirmer** : on tape une case, elle se met en surbrillance, un bouton « 🎯 Feu ! » de 44 px tire. |
| Rejouer une manche | **Accord des deux joueuses**, score de manches conservé, `Starter` alterne. Même handshake que le Puissance 4. |
| Écran du plateau | **Un seul écran**, `screen-battleship`, piloté par `phase`. |
| Fichiers front | **Fichiers dédiés** `battleship.js` / `battleship.css`, pas d'ajout dans `games.js`. |

## Hors périmètre

- IA / jeu contre l'ordinateur.
- Placement manuel des bateaux (tap, pivot, glisser-déposer).
- Salons privés avec code d'invitation ; choix de son adversaire.
- Reconnexion ou reprise d'une partie après fermeture d'onglet.
- Minuteur de tour (voir « Limites assumées »).
- Spectateurs, chat, persistance du score entre sessions.
- Grille de taille ou flotte configurables.
- Toute modification du Puissance 4, de la course de fusées ou de la couche de session.

## Architecture

### Découpage des fichiers

`static/games.js` fait 509 lignes avec les deux modes du Puissance 4 ; y ajouter la bataille navale le pousserait vers 950 en mêlant deux jeux sans rapport.

| Fichier | Nature | Contenu |
|---|---|---|
| `battleship.go` | **nouveau** | Logique pure (flotte, tir, coulé) + `battleshipGame` |
| `battleship_test.go` | **nouveau** | Tests de la logique pure et du jeu en ligne |
| `static/battleship.js` | **nouveau** | Rendu par snapshot, interactions, mode en ligne |
| `static/battleship.css` | **nouveau** | Styles des deux grilles |
| `static/index.html` | modifié | Écran `screen-battleship`, 3e bouton du hub Jeux, balises `<script>`/`<link>` |
| `static/sw.js` | modifié | 2 entrées de precache + bump `CACHE_NAME` `v11` → `v12` |
| `README.md`, `CLAUDE.md` | modifiés | Documentation (consignes 1 et 2) |

`main.go`, `session.go`, `race.go`, `connect4.go`, `static/app.js`, `static/games.js`, `static/style.css` et `static/games.css` **ne sont pas touchés**.

Coût assumé du choix : deux entrées de plus dans le precache de `sw.js`, et une contrainte d'ordre de chargement supplémentaire — `battleship.js` est un script classique qui résout `screens`, `showScreen`, `screenCleanups`, `sessionJoin`, `sessionSend`, `sessionClose` et `showJoinScreen` par portée lexicale globale, il doit donc être chargé **après `app.js`**. Aucune dépendance ajoutée, ni côté Go ni côté front.

### État serveur

Une seule file d'attente, de clé `battleship` : `battleshipGame` **n'implémente pas** `VariantGame`.

```go
const bsSize = 8

// Flotte : nom + taille. 12 cases au total.
var bsFleetSpec = []struct{ Name string; Size int }{
    {"Porte-avions", 4}, {"Croiseur", 3}, {"Sous-marin", 3}, {"Torpilleur", 2},
}

type bsCell struct {
    Row int `json:"row"`
    Col int `json:"col"`
}

type bsShip struct {
    Name  string
    Cells []bsCell
    Hits  int
}

// Encodage d'une case de la grille de tirs.
const (
    bsUnknown = 0 // jamais tirée
    bsMiss    = 1 // à l'eau
    bsHit     = 2 // touche un bateau
)

// bsSide est l'état d'UNE joueuse.
type bsSide struct {
    Fleet []bsShip            // ses bateaux
    Shots [bsSize][bsSize]int // les tirs qu'ELLE a effectués sur l'adversaire
    Ready bool
}
```

Aucune donnée n'est dupliquée : ce qu'une joueuse voit de sa propre flotte se déduit de son `Fleet` et des `Shots` de l'adversaire ; ce qu'elle sait de l'adversaire est son propre `Shots`.

### Structs de transport : la confidentialité par construction

C'est le cœur du design. Le Puissance 4 diffuse le **même** snapshot aux deux joueurs (`broadcast`) parce que son plateau est entièrement public. Ici, chaque joueuse reçoit une vue **différente**, envoyée par `sendEvent(p, …)`. `broadcast` n'est jamais utilisé pour l'état de jeu.

```go
// Un de MES bateaux, tel que je le reçois.
type bsShipView struct {
    Name  string   `json:"name"`
    Cells []bsCell `json:"cells"`
    Sunk  bool     `json:"sunk"`
}

// Ma propre flotte : les positions réelles, elles sont à moi.
type bsSelfView struct {
    Ships  []bsShipView `json:"ships"`
    Hits   []bsCell     `json:"hits"`   // mes cases touchées
    Misses []bsCell     `json:"misses"` // tirs adverses tombés à l'eau
}

// L'adversaire. Aucun champ ne peut porter une cellule de bateau non touchée :
// réintroduire la fuite exigerait d'AJOUTER un champ ici, ce qui se voit en
// relecture et casse le test de confidentialité.
type bsEnemyView struct {
    Hits      []bsCell `json:"hits"`
    Misses    []bsCell `json:"misses"`
    SunkShips []string `json:"sunkShips"` // noms des bateaux coulés
    Remaining int      `json:"remaining"` // bateaux encore à flot
}
```

Les cases touchées de l'adversaire sont légitimes : la joueuse les a découvertes en tirant. Une case de bateau **non touchée** n'a aucune représentation possible dans `bsEnemyView`.

Ce choix est la leçon directe de la fuite corrigée dans `race.go`, où `Question.Answer` partait au client : là-bas `json:"-"` a fermé la fuite, mais il fallait y penser. Ici, l'oubli est impossible.

#### Snapshot complet

```go
// Le dernier tir, pour l'animation. By et Result sont publics : les deux
// joueuses savent déjà qui a tiré où, et avec quel résultat.
type bsShot struct {
    Row    int    `json:"row"`
    Col    int    `json:"col"`
    By     int    `json:"by"`     // siège de la tireuse : p.Index + 1
    Result string `json:"result"` // "miss" | "hit" | "sunk"
}

type bsStateMsg struct {
    Phase    string      `json:"phase"` // "placement" | "battle" | "over"
    You      bsSelfView  `json:"you"`
    Enemy    bsEnemyView `json:"enemy"`
    YourTurn bool        `json:"yourTurn"`
    Ready    [2]bool     `json:"ready"`
    Over     bool        `json:"over"`
    Winner   int         `json:"winner"`   // 0 aucune, sinon p.Index + 1
    LastShot *bsShot     `json:"lastShot"` // nil hors bataille
    Wins     [2]int      `json:"wins"`
    Rematch  [2]bool     `json:"rematch"`
    Round    int         `json:"round"`
}
```

Les sièges suivent la convention du Puissance 4 : `p.Index + 1`, soit 1 ou 2. `Ready`, `Wins` et `Rematch` sont indexés par `p.Index` (0 ou 1) et sont identiques pour les deux joueuses — ils ne révèlent rien de caché.

⚠️ `sendEvent` abandonne un message quand le canal de la joueuse est plein : le snapshot doit donc rester un **état absolu**, jamais un delta. Un delta perdu désynchronise définitivement ; un état absolu est auto-réparant.

Comme `c4StateMsg`, `bsStateMsg` reflète l'état de la room **à la main** : toute nouvelle propriété doit y être reportée explicitement, sinon elle n'atteint jamais le client. Ici s'ajoute le risque inverse, plus grave : un champ ajouté à la légère peut révéler la flotte adverse.

### Protocole

**Client → serveur** (`POST /api/action`, header `X-Player-ID`) :

| Action | Phase requise | Effet |
|---|---|---|
| `{type:"shuffle"}` | `placement`, avant `ready` | Le serveur retire une flotte aléatoire |
| `{type:"ready"}` | `placement` | Verrouille la flotte. Irréversible. |
| `{type:"fire",row,col}` | `battle`, à son tour | Tire sur la case |
| `{type:"rematch"}` | `over` | Enregistre l'accord de cette joueuse |

**Serveur → client** : `start` (attribution du siège et premier snapshot), puis `bsState` à chaque changement d'état. Events génériques inchangés : `waiting`, `opponentLeft`.

### Déroulé d'une partie

**1. `placement`** — à `Start`, le serveur tire une flotte valide pour chaque joueuse et la lui envoie. Chacune peut `shuffle` à volonté, puis `ready`, qui verrouille. Le snapshot porte `ready[2]`, ce qui permet d'afficher « ⏳ En attente d'Omar… » — le motif déjà éprouvé sur la revanche du Puissance 4. Quand les deux sont prêtes, la phase passe à `battle`.

**2. `battle`** — le siège `Starter` ouvre.

| Résultat du tir | Effet | Main |
|---|---|---|
| 🌊 à l'eau | case marquée | passe à l'adversaire |
| 💥 touché | case marquée, `Hits++` du bateau | **reste** |
| ☠️ coulé | idem, nom du bateau révélé à la tireuse | **reste** |

Quand les 4 bateaux d'un camp sont coulés : `over`, `Wins[gagnante]++`.

**3. `over`** — voir « Fin de manche ».

#### Validation d'un tir

Le siège est dérivé de `p.Index` côté serveur, **jamais** lu dans la requête — même discipline que `c4Play`. Un tir est refusé, sans effet et sans réponse d'erreur, si :

- la phase n'est pas `battle` ;
- ce n'est pas le tour de cette joueuse ;
- les coordonnées sortent de la grille ;
- la case a déjà été tirée.

Le front interdit déjà ces cas (cases `disabled`), mais le serveur ne s'y fie pas : un client modifié ne peut ni tirer hors de son tour, ni tirer deux fois, ni jouer à la place de l'autre.

#### Fin de manche et handshake de revanche

`rematch` n'enregistre que `Rematch[p.Index]`. La manche ne repart que lorsque les **deux** ont accepté : nouvelles flottes aléatoires, retour en phase `placement`, `Starter` alterne, `Wins` survit et `Round` s'incrémente.

#### Perte de l'adversaire ou de la connexion

`handleDisconnect` émet `opponentLeft`, déjà générique. Le front verrouille la grille, masque le bouton de revanche et laisse « ← Retour » pour seule issue. Comportement repris tel quel du Puissance 4.

### Front

#### Écrans mutualisés

`showJoinScreen({emojiLeft:'🚢', title:'Bataille navale en ligne', emojiRight:'💥', subtitle:'Trouve un adversaire !', waitingEmoji:'🚢', back:'games', onSubmit:…})`.

⚠️ **Pas de `waitingTilt`** : l'inclinaison à −45° de l'emoji d'attente est propre à la course de fusées. Elle ne doit jamais remonter sur `.waiting-icon`, sous peine d'incliner l'emoji de tout futur jeu en ligne.

#### Un seul écran, un seul rendu

`renderBsSnapshot(state)` reconstruit toute l'interface depuis l'**état complet**, comme `renderC4Snapshot`. La phase pilote la disposition :

- **placement** : la grande grille montre **ma** flotte, libellée « Ta flotte » ; boutons « 🎲 Mélanger » et « ✓ Je suis prête ».
- **bataille** : la grande grille devient la grille de tir ; ma flotte passe en **mini-carte** sous elle, non cliquable. **Chaque grille porte son compteur**, et les deux ne mesurent pas la même chose : « Flotte adverse — *n* bateaux à flot » au-dessus de la grille de tir, « Ta flotte — *n* bateaux coulés » au-dessus de la mini-carte. De l'adversaire je ne sais rien de ses dégâts partiels, donc seul le nombre de bateaux encore entiers a un sens ; de mon côté c'est le nombre de pertes qui inquiète.
- **fin** : grille verrouillée, bouton « Nouvelle manche » et statut de la revanche.

Les cases non jouables sont `disabled` : le verrouillage hors de son tour et pendant l'animation est porté par le **DOM**, sans drapeau de lock — même choix que les colonnes du Puissance 4.

#### Viser puis confirmer

Un tap sur une case la met en surbrillance et affiche ses coordonnées (« B7 ») ; le bouton « 🎯 Feu ! », de 44 px de haut, déclenche le tir.

Motif : à 375 px de large, une case mesure `(343 − 16 − 8 − 21) / 8 ≈ 37 px`, sous le seuil de 44 px — et **sans compensation**, une case étant carrée là où une colonne de Puissance 4 faisait 263 px de haut. La confirmation rend un tap raté rattrapable au lieu de coûter un tour, et ajoute un temps de suspense qui sert le jeu.

#### Focus clavier

La grille étant entièrement reconstruite à chaque rendu, `bsFocusCell` vit en **portée module** — pas en variable locale du rendu — avec remise à `null` à la sortie du plateau et au nettoyage d'écran. Mêmes raisons que `c4FocusCol`, dont l'histoire de ce dépôt montre qu'elles ne sont pas théoriques.

#### Animation

`lastShot` porte `{row, col, by, result}`. Un snapshot n'est animé que si les **coordonnées de `lastShot` ont changé** depuis le snapshot précédemment rendu. Se caler sur le nom de l'event rejouerait l'explosion du tir précédent à chaque demande de revanche, puisque celle-ci rediffuse le même `lastShot` ; et `Round` est un discriminant trompeur, puisqu'il s'incrémente précisément sur le snapshot qui ne doit pas s'animer.

#### Hub Jeux

Troisième bouton, après les deux du Puissance 4 :

```html
<button id="btn-battleship-online" class="multi-btn bs-entry-btn">
    <span class="multi-icon">🚢</span>
    <span class="multi-text">
        <span class="multi-title">Bataille navale en ligne</span>
        <span class="multi-details">2 joueurs, chacun son écran</span>
    </span>
    <span class="multi-arrow">→</span>
</button>
```

⚠️ La classe `.operation-card` est interdite ici : elle est bindée vers `config.operation` et fait planter `updateModesScreen()`.

## Nouveaux écrans et enregistrements

`battleship.js` s'enregistre lui-même, comme `games.js` le fait déjà :

```js
screens.battleship = document.getElementById('screen-battleship');
screenCleanups.battleship = () => { /* annule l'animation, sessionClose(), bsFocusCell = null */ };
```

Un écran absent de `screens` fait lever une `TypeError` à `showScreen()` ; un écran qui détient une connexion et n'est pas dans `screenCleanups` fuit sa session.

## Tests

`battleship_test.go`, stdlib `testing`, sans dépendance.

**Logique pure** : une flotte tirée au hasard a les bonnes tailles, tient dans la grille et ne se chevauche pas (vérifié sur un grand nombre de tirages) ; les bateaux adjacents sont acceptés ; un tir hors bornes est refusé ; touché / à l'eau / coulé sont correctement classés ; la partie est finie quand les 4 bateaux sont coulés, pas avant.

**Jeu en ligne** : attribution des sièges ; `shuffle` et `ready` refusés hors `placement` ; `shuffle` refusé après `ready` ; la bataille ne commence que quand les deux sont prêtes ; tir refusé hors tour, hors phase, hors bornes et sur une case déjà tirée ; un touché **garde** la main, un raté la **passe** ; victoire aux 12 cases ; revanche refusée tant que les deux n'ont pas accepté ; `Starter` alterne ; `Wins` survit à la manche.

**Test de confidentialité — le plus important.** Sérialiser le payload réellement envoyé à chaque joueuse, le décoder en structure générique (`map[string]any`), la parcourir **entièrement et récursivement**, et échouer si une seule cellule non touchée de la flotte adverse y apparaît, à n'importe quelle profondeur.

Ce test porte sur la **propriété** — rien de caché ne franchit le fil — et non sur la forme des structs. Il verrait donc aussi une fuite réintroduite plus tard par un champ ajouté, un type de transport différent, ou un `broadcast` employé par erreur à la place de `sendEvent`. C'est la transposition de ce qui a été écrit pour `race.go`, en plus fort : là-bas le test cherche l'absence d'une clé connue, ici il compare le fil à l'état réel du serveur.

Le front n'a pas de framework de test (zéro dépendance) : sa vérification est le **scénario navigateur à deux onglets**, cache purgé, console et réseau inspectés.

## Audit sécurité (à réaliser après implémentation, consigne 5)

- Confidentialité de la flotte : inspecter l'EventStream des deux onglets et confirmer qu'aucune case de bateau non touchée n'y figure.
- Validation serveur : depuis la console, émettre `sessionSend({type:'fire',…})` hors de son tour, sur une case déjà tirée, hors bornes et en phase `placement` ; l'état ne doit pas bouger.
- `shuffle` et `ready` après verrouillage, et `rematch` avant la fin : sans effet.
- Injection : tout affichage passe par `textContent`, aucun `innerHTML`.
- Sondes HTTP : coup sans identité, identité inventée, corps illisible, corps géant, SSE d'un joueur inconnu.

## Audit responsive (à réaliser après implémentation, consigne 6)

- 320 px, 390 px et paysage 740×360 : pas de débordement horizontal ; mesurer les cases au `getBoundingClientRect()` et **consigner les valeurs réelles**.
- Boutons « 🎯 Feu ! », « 🎲 Mélanger », « ✓ Je suis prête », « Nouvelle manche », « ← Retour » : au moins 44 px de haut.
- Survol : tout `:hover` sous `@media (hover: hover) and (pointer: fine)`, jamais au toucher, et jamais sur une case `disabled`.
- `prefers-reduced-motion` : ni explosion, ni clignotement.
- Focus clavier : survit à son propre tir et au tir adverse, et revient sur la grille quand la main revient.
- Safe-area respectée en bas d'écran ; pas de `background-attachment: fixed`.

## Limites assumées

**Une série peut monopoliser la partie.** La règle « touché → on rejoue » permet de couler les 12 cases d'affilée ; l'adversaire reste alors spectatrice plusieurs minutes sans rien à faire. Retenu en connaissance de cause, pour le plaisir de l'enchaînement.

**« Viser puis confirmer » est à réévaluer après usage.** Le geste ajoute un tap par tir. S'il s'avère pénible à l'usage, l'alternative est le tir direct au tap — au prix d'un tour perdu à chaque tremblement de doigt sur des cases de 37 px.

**Pas de minuteur de tour.** Une joueuse qui laisse son onglet ouvert sans jouer bloque la partie indéfiniment. Seule sortie : l'autre quitte, ou ferme son onglet — `watchGhost` ne récupère que les joueuses qui n'ont jamais ouvert leur flux SSE.

**Cases de 37 px sur téléphone.** Les 44 px sont hors d'atteinte pour 8 colonnes sur un téléphone, et l'écart est plus large que pour le Puissance 4 — 8 colonnes au lieu de 7. Le budget complet est de 8 × 44 = 352 px de cases, plus 21 px de gaps et 24 px de paddings, soit **397 px de largeur utile**, donc un écran d'au moins **429 px** hors safe-area : au-delà de presque tous les téléphones. Réduire les gaps ne suffirait pas et rendrait la grille illisible. La confirmation avant tir est la réponse retenue, plutôt qu'un rétrécissement de la grille ou un débordement du padding du `body` — lequel casserait l'exigence de safe-area.
