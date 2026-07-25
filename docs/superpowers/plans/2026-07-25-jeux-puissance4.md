# Section « Jeux » + Puissance 4 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à Chronomaths une section « Jeux » et un Puissance 4 jouable à 2 sur le même appareil, en tour par tour.

**Architecture:** Jeu 100 % côté client dans deux nouveaux fichiers statiques (`static/games.js`, `static/games.css`) chargés après `app.js` / `style.css`. La logique du plateau est isolée en 4 fonctions pures sans DOM en tête de `games.js`. `main.go` n'est pas touché : `//go:embed static/*` embarque les nouveaux fichiers.

**Tech Stack:** HTML5 / CSS3 / JavaScript vanilla (scripts classiques, pas de modules ES). Aucune dépendance, aucun build. Go 1.x pour servir les fichiers. Node v22 utilisé uniquement pour un script de vérification jetable, non commité.

## Global Constraints

- **Zéro dépendance externe**, front comme back. Aucun framework de test, aucun bundler.
- **Aucune modification de `main.go`, `go.mod`, ni de route HTTP.**
- **Langue de l'UI : français** (avec accents corrects). **Langue du code : anglais** (identifiants, commentaires).
- **Jamais de `innerHTML` / `insertAdjacentHTML`** : uniquement `document.createElement` et `textContent`, comme partout dans le projet.
- **L'ordre des balises est structurant** : `games.css` après `style.css`, `games.js` après `app.js`. `games.js` résout `screens`, `showScreen` et `screenCleanups` par portée lexicale globale.
- **Mobile-first et responsive** : aucun scroll horizontal à 320 px, `@media (hover: hover) and (pointer: fine)` obligatoire pour tout `:hover`, pas de `background-attachment: fixed`.
- `style.css` contient déjà une règle globale `@media (prefers-reduced-motion: reduce)` qui force `animation-duration: 0.01ms` et `animation-iteration-count: 1` sur `*`. Ne pas la dupliquer : les animations de `games.css` en héritent automatiquement.
- Variables CSS disponibles (définies dans `style.css:7-27`) : `--primary`, `--primary-light`, `--secondary`, `--accent`, `--success`, `--success-light`, `--error`, `--purple`, `--card-bg`, `--text`, `--text-light`.
- Convention de commit du repo : `feat:` / `fix:` / `doc:` en minuscules, message court en français ou en anglais.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `static/games.js` | **Créé.** Bloc 1 : logique pure du Puissance 4 (sans DOM). Bloc 2 : état, rendu, interactions, navigation des écrans Jeux. |
| `static/games.css` | **Créé.** Styles du hub Jeux et du plateau Puissance 4. |
| `static/index.html` | **Modifié.** Bouton d'accès sur l'accueil, écrans `screen-games` et `screen-connect4`, balises `<link>` et `<script>`. |
| `static/app.js` | **Modifié.** Registre `screenCleanups`, appelé en tête de `cleanupScreen()`. |
| `static/sw.js` | **Modifié.** `CACHE_NAME` bumpé, precache des deux nouveaux fichiers. |
| `README.md`, `CLAUDE.md` | **Modifiés.** Documentation (consignes 1 et 2 de `CLAUDE.md`). |

---

### Task 1 : Logique pure du Puissance 4

Crée `games.js` avec uniquement les 4 fonctions pures, vérifiées par un script Node jetable. Aucun DOM, aucun écran : ce fichier n'est pas encore référencé par `index.html`, donc rien ne change dans l'application à ce stade.

**Files:**
- Create: `static/games.js`
- Test: `/private/tmp/claude-501/-Users-bodul-Workspace-chronomaths/425b2620-6956-485d-a8f0-bd8ff7930aa6/scratchpad/test-connect4.js` (jetable, **non commité**)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `C4_ROWS = 6`, `C4_COLS = 7` (constantes)
  - `createBoard() → number[6][7]` rempli de `0`
  - `dropDisc(board, col, player) → number` — index de ligne d'atterrissage, ou `-1` si colonne pleine / hors bornes (plateau non modifié dans ce cas)
  - `findWin(board, row, col) → Array<{row: number, col: number}> | null` — toutes les cellules alignées (≥ 4), ou `null`
  - `isDraw(board) → boolean`

- [ ] **Step 1 : écrire le test qui échoue**

Créer `/private/tmp/claude-501/-Users-bodul-Workspace-chronomaths/425b2620-6956-485d-a8f0-bd8ff7930aa6/scratchpad/test-connect4.js` :

```js
// Vérification jetable des fonctions pures de static/games.js.
// Tronque la source au début du bloc de rendu : on évalue uniquement la
// logique pure, sans jamais toucher au DOM.
const fs = require('fs');

const source = fs.readFileSync('/Users/bodul/Workspace/chronomaths/static/games.js', 'utf8');
const cut = source.indexOf('// PUISSANCE 4 — ÉTAT & RENDU');
if (cut === -1) throw new Error('Bannière "// PUISSANCE 4 — ÉTAT & RENDU" introuvable dans games.js');
eval(source.slice(0, cut));

let failures = 0;
function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  ok   ${label}`);
    } else {
        failures++;
        console.log(`  FAIL ${label}\n       attendu ${e}\n       obtenu  ${a}`);
    }
}

// Pose une suite de coups décrits par [col, player] et retourne le plateau.
function play(moves) {
    const board = createBoard();
    let last = null;
    for (const [col, player] of moves) {
        last = { row: dropDisc(board, col, player), col };
    }
    return { board, last };
}

console.log('createBoard');
const empty = createBoard();
check('6 lignes', empty.length, 6);
check('7 colonnes', empty[0].length, 7);
check('tout à zéro', empty.flat().filter(v => v !== 0).length, 0);

console.log('dropDisc');
const b1 = createBoard();
check('premier jeton en bas', dropDisc(b1, 3, 1), 5);
check('deuxième jeton empilé', dropDisc(b1, 3, 2), 4);
check('colonne hors bornes (-1)', dropDisc(b1, 7, 1), -1);
check('colonne hors bornes (négative)', dropDisc(b1, -1, 1), -1);
const bFull = createBoard();
for (let i = 0; i < 6; i++) dropDisc(bFull, 0, 1);
check('colonne pleine', dropDisc(bFull, 0, 2), -1);
check('plateau inchangé si colonne pleine', bFull.map(r => r[0]), [1, 1, 1, 1, 1, 1]);

console.log('findWin — 4 directions');
const horiz = play([[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2], [3, 1]]);
check('horizontale détectée', findWin(horiz.board, horiz.last.row, horiz.last.col).length, 4);
const vert = play([[0, 1], [1, 2], [0, 1], [1, 2], [0, 1], [1, 2], [0, 1]]);
check('verticale détectée', findWin(vert.board, vert.last.row, vert.last.col).length, 4);
// Diagonale montante vers la droite
const diagUp = play([
    [0, 1],
    [1, 2], [1, 1],
    [2, 2], [2, 2], [2, 1],
    [3, 2], [3, 2], [3, 2], [3, 1]
]);
check('diagonale montante détectée', findWin(diagUp.board, diagUp.last.row, diagUp.last.col).length, 4);
// Diagonale descendante vers la droite (miroir de la précédente)
const diagDown = play([
    [6, 1],
    [5, 2], [5, 1],
    [4, 2], [4, 2], [4, 1],
    [3, 2], [3, 2], [3, 2], [3, 1]
]);
check('diagonale descendante détectée', findWin(diagDown.board, diagDown.last.row, diagDown.last.col).length, 4);

console.log('findWin — cas négatifs et alignement long');
const three = play([[0, 1], [1, 1], [2, 1]]);
check('3 alignés ne gagnent pas', findWin(three.board, three.last.row, three.last.col), null);
const mixed = play([[0, 1], [1, 1], [2, 2], [3, 1]]);
check('série coupée par l’adversaire', findWin(mixed.board, mixed.last.row, mixed.last.col), null);
const five = play([[0, 1], [1, 1], [2, 1], [4, 1], [3, 1]]);
check('5 alignés renvoient 5 cellules', findWin(five.board, five.last.row, five.last.col).length, 5);
check('case vide renvoie null', findWin(createBoard(), 0, 0), null);

console.log('isDraw');
check('plateau vide non nul', isDraw(createBoard()), false);
// isDraw ne regarde que la ligne du haut : le contenu exact importe peu.
const drawBoard = createBoard();
for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
        drawBoard[row][col] = ((row + col) % 2) + 1;
    }
}
check('plateau plein = nul', isDraw(drawBoard), true);
const almost = createBoard();
for (let row = 0; row < 6; row++) for (let col = 1; col < 7; col++) almost[row][col] = 1;
check('une colonne libre ≠ nul', isDraw(almost), false);

console.log(failures === 0 ? '\n✅ Tous les tests passent' : `\n❌ ${failures} test(s) en échec`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

```bash
cd /Users/bodul/Workspace/chronomaths && node "/private/tmp/claude-501/-Users-bodul-Workspace-chronomaths/425b2620-6956-485d-a8f0-bd8ff7930aa6/scratchpad/test-connect4.js"
```

Attendu : `Error: ENOENT: no such file or directory, open '/Users/bodul/Workspace/chronomaths/static/games.js'` — le fichier n'existe pas encore.

- [ ] **Step 3 : écrire l'implémentation minimale**

Créer `static/games.js` :

```js
// ============================================================
// PUISSANCE 4 — LOGIQUE PURE (sans DOM, portable côté serveur)
// ============================================================
const C4_ROWS = 6;
const C4_COLS = 7;

// Grille 6×7 : board[row][col], row 0 = haut. 0 = vide, 1 = rouge, 2 = jaune.
function createBoard() {
    return Array.from({ length: C4_ROWS }, () => new Array(C4_COLS).fill(0));
}

// Pose un jeton dans la case libre la plus basse. Retourne sa ligne, ou -1.
function dropDisc(board, col, player) {
    if (col < 0 || col >= C4_COLS) return -1;
    for (let row = C4_ROWS - 1; row >= 0; row--) {
        if (board[row][col] === 0) {
            board[row][col] = player;
            return row;
        }
    }
    return -1;
}

// Cherche un alignement passant par le dernier jeton posé.
// Retourne toutes les cellules alignées (4 ou plus), ou null.
function findWin(board, row, col) {
    const player = board[row][col];
    if (player === 0) return null;

    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of directions) {
        const line = [{ row, col }];
        for (const sign of [1, -1]) {
            let r = row + dr * sign;
            let c = col + dc * sign;
            while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r][c] === player) {
                line.push({ row: r, col: c });
                r += dr * sign;
                c += dc * sign;
            }
        }
        if (line.length >= 4) return line;
    }
    return null;
}

// Match nul : plus aucune case libre sur la ligne du haut.
function isDraw(board) {
    return board[0].every(cell => cell !== 0);
}

// ============================================================
// PUISSANCE 4 — ÉTAT & RENDU
// ============================================================
```

La bannière finale est indispensable : le script de vérification tronque la source à cet endroit. Elle sera suivie du code de rendu en Task 3.

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

```bash
cd /Users/bodul/Workspace/chronomaths && node "/private/tmp/claude-501/-Users-bodul-Workspace-chronomaths/425b2620-6956-485d-a8f0-bd8ff7930aa6/scratchpad/test-connect4.js"
```

Attendu : chaque ligne préfixée par `ok`, puis `✅ Tous les tests passent`, code de sortie 0.

- [ ] **Step 5 : commit**

```bash
cd /Users/bodul/Workspace/chronomaths
git add static/games.js
git commit -m "feat: logique pure du Puissance 4"
```

Le script de test reste dans le scratchpad et n'est **pas** ajouté au commit.

---

### Task 2 : Écrans Jeux et navigation

Ajoute le bouton d'accès sur l'accueil, les deux écrans, le registre de cleanup dans `app.js`, et le câblage de navigation. À la fin de cette tâche, on navigue Accueil → Jeux → Puissance 4 et retour, avec un plateau encore vide (styles minimaux).

**Files:**
- Modify: `static/index.html` (accueil, 2 écrans, `<link>` et `<script>`)
- Modify: `static/app.js:292-307` (`cleanupScreen`) et `static/app.js:33-46` (déclaration du registre)
- Modify: `static/games.js` (enregistrement des écrans et handlers de navigation)
- Create: `static/games.css`

**Interfaces:**
- Consumes de Task 1 : rien directement (les fonctions pures ne sont utilisées qu'en Task 3).
- Consumes d'`app.js` : `screens` (objet), `showScreen(name, pushToHistory = true)`, `screenCleanups` (créé dans cette tâche).
- Produces : `screens.games`, `screens.connect4`, l'objet `c4El` (références DOM), et `screenCleanups.connect4`.

- [ ] **Step 1 : ajouter le registre de cleanup dans `app.js`**

Dans `static/app.js`, juste après la fermeture de l'objet `screens` (ligne 46, `};`), insérer :

```js
// Registre de nettoyage extensible : les écrans définis hors de ce fichier
// (jeux) y enregistrent leur propre fonction de nettoyage.
const screenCleanups = {};
```

Puis modifier `cleanupScreen` (ligne 292). Remplacer :

```js
function cleanupScreen(screenName) {
    switch (screenName) {
```

par :

```js
function cleanupScreen(screenName) {
    if (screenCleanups[screenName]) screenCleanups[screenName]();
    switch (screenName) {
```

Le reste du `switch` est inchangé.

- [ ] **Step 2 : ajouter le bouton « Jeux » sur l'accueil**

Dans `static/index.html`, à l'intérieur de `<div class="mode-selection">` de `#screen-home`, après la fermeture de `</div>` de `.operation-choice` (ligne 50), insérer :

```html
                <div class="multi-separator">
                    <span>ou</span>
                </div>

                <button id="btn-games" class="multi-btn games-entry-btn">
                    <span class="multi-icon">🎮</span>
                    <span class="multi-text">
                        <span class="multi-title">Jeux</span>
                        <span class="multi-details">Une pause détente entre deux séries de calculs</span>
                    </span>
                    <span class="multi-arrow">→</span>
                </button>
```

⚠️ Ne **pas** utiliser la classe `.operation-card` : `app.js:594` binde toutes ces cartes vers `config.operation = card.dataset.operation` puis `updateModesScreen()`, où `labels[op]` serait `undefined` et lèverait une `TypeError`.

- [ ] **Step 3 : ajouter les deux écrans**

Dans `static/index.html`, juste avant `</div>` fermant `.container` (ligne 438, après `#screen-results`), insérer :

```html
        <!-- Écran hub Jeux -->
        <div id="screen-games" class="screen">
            <h1 class="title">
                <span class="emoji">🎮</span>
                Jeux
                <span class="emoji">🕹️</span>
            </h1>
            <p class="subtitle">Choisis ton jeu !</p>

            <div class="mode-selection">
                <button id="btn-connect4" class="multi-btn c4-entry-btn">
                    <span class="multi-icon">🔴</span>
                    <span class="multi-text">
                        <span class="multi-title">Puissance 4</span>
                        <span class="multi-details">2 joueurs, chacun son tour, sur le même écran</span>
                    </span>
                    <span class="multi-arrow">→</span>
                </button>

                <button id="btn-games-back" class="back-btn" style="margin-top:1rem;">← Retour</button>
            </div>
        </div>

        <!-- Écran Puissance 4 -->
        <div id="screen-connect4" class="screen">
            <div class="c4-container">
                <div class="c4-header">
                    <h2 class="c4-title">🔴 Puissance 4 🟡</h2>
                    <p id="c4-score" class="c4-score">Rouge 0 – 0 Jaune</p>
                </div>

                <p id="c4-turn" class="c4-turn" aria-live="polite">🔴 À Rouge de jouer</p>

                <div id="c4-board" class="c4-board"></div>

                <div class="c4-actions">
                    <button id="btn-c4-replay" class="play-again-btn">
                        <span>🔄</span> Nouvelle partie
                    </button>
                    <button id="btn-c4-back" class="back-btn">← Retour</button>
                </div>
            </div>
        </div>
```

- [ ] **Step 4 : référencer `games.css` et `games.js`**

Dans `static/index.html`, après la ligne 15 (`<link rel="stylesheet" href="style.css">`), ajouter :

```html
    <link rel="stylesheet" href="games.css">
```

Et après la ligne `<script src="app.js"></script>` (ligne 440), ajouter :

```html
    <script src="games.js"></script>
```

L'ordre est structurant : `games.js` doit venir **après** `app.js` pour résoudre `screens`, `showScreen` et `screenCleanups`.

- [ ] **Step 5 : créer `static/games.css` avec les styles du hub**

Créer `static/games.css` :

```css
/* ============================================================
   JEUX — variables communes
   ============================================================ */
:root {
    --c4-red: #ff4757;
    --c4-red-dark: #c0392b;
    --c4-yellow: #ffc93c;
    --c4-yellow-dark: #a67c00;
    --c4-board: #4a69dd;
    --c4-board-dark: #3b53b0;
    --c4-hole: #eef2ff;
}

/* ============================================================
   HUB JEUX — boutons d'entrée
   ============================================================ */
.games-entry-btn,
.c4-entry-btn {
    border-color: var(--purple);
    background: linear-gradient(135deg, #f8f4ff, #f1e9ff);
}
```

- [ ] **Step 6 : câbler la navigation dans `games.js`**

À la fin de `static/games.js`, après la bannière `// PUISSANCE 4 — ÉTAT & RENDU`, ajouter :

```js
const C4_PLAYERS = {
    1: { name: 'Rouge', emoji: '🔴' },
    2: { name: 'Jaune', emoji: '🟡' }
};

const c4 = {
    board: null,
    current: 1,      // joueur dont c'est le tour
    starter: 1,      // joueur ayant commencé la manche en cours
    locked: false,   // true pendant la chute d'un jeton et après la fin de partie
    over: false,
    wins: { 1: 0, 2: 0 },
    dropTimer: null
};

// Enregistrement des écrans auprès de la machine à états d'app.js.
screens.games = document.getElementById('screen-games');
screens.connect4 = document.getElementById('screen-connect4');

const c4El = {
    board: document.getElementById('c4-board'),
    turn: document.getElementById('c4-turn'),
    score: document.getElementById('c4-score')
};

function cancelC4Drop() {
    if (c4.dropTimer) {
        clearTimeout(c4.dropTimer);
        c4.dropTimer = null;
    }
}

// Nettoyage déclenché par la navigation arrière du navigateur.
screenCleanups.connect4 = () => {
    cancelC4Drop();
    c4.locked = false;
};

// ============================================================
// NAVIGATION
// ============================================================

document.getElementById('btn-games').addEventListener('click', () => {
    showScreen('games');
});

document.getElementById('btn-games-back').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('btn-connect4').addEventListener('click', () => {
    startC4Match();
    showScreen('connect4');
});

document.getElementById('btn-c4-back').addEventListener('click', () => {
    cancelC4Drop();
    showScreen('games');
});

document.getElementById('btn-c4-replay').addEventListener('click', () => {
    c4.starter = c4.starter === 1 ? 2 : 1;
    startC4Round();
});

// Nouvelle rencontre : remet le score de manches à zéro.
function startC4Match() {
    c4.wins = { 1: 0, 2: 0 };
    c4.starter = 1;
    startC4Round();
}

// Nouvelle manche : plateau vierge, score de manches conservé.
function startC4Round() {
    cancelC4Drop();
    c4.board = createBoard();
    c4.current = c4.starter;
    c4.locked = false;
    c4.over = false;
    renderC4Board();
    updateC4Turn();
    updateC4Score();
}

// Rendu et interactions : implémentés en Task 3.
function renderC4Board() {}
function updateC4Turn() {}
function updateC4Score() {}
```

- [ ] **Step 7 : vérifier la navigation dans le navigateur**

```bash
cd /Users/bodul/Workspace/chronomaths && go run main.go
```

Ouvrir `http://localhost:8080`, puis vérifier dans la console (aucune erreur JS attendue) :

1. L'accueil affiche les 4 opérations **puis** un séparateur `ou` et le bouton `🎮 Jeux`.
2. Clic sur `🎮 Jeux` → écran hub avec `Puissance 4`.
3. Clic sur `Puissance 4` → écran Puissance 4 (plateau vide, bandeau `🔴 À Rouge de jouer`, score `Rouge 0 – 0 Jaune`).
4. `← Retour` depuis Puissance 4 → hub. `← Retour` depuis le hub → accueil.
5. Bouton **Précédent du navigateur** depuis chaque écran : revient à l'écran précédent sans erreur.
6. Clic sur une carte d'opération (ex. `×`) : l'écran modes s'affiche toujours correctement — non régressé par l'ajout du bouton Jeux.

Arrêter le serveur (`Ctrl+C`).

- [ ] **Step 8 : commit**

```bash
cd /Users/bodul/Workspace/chronomaths
git add static/index.html static/app.js static/games.js static/games.css
git commit -m "feat: écrans Jeux et navigation vers le Puissance 4"
```

---

### Task 3 : Plateau, pose des jetons et alternance des tours

Rend le plateau 6×7, permet de poser un jeton avec animation de chute, et fait alterner les joueurs. La victoire n'est pas encore détectée : la partie se poursuit jusqu'à remplissage.

**Files:**
- Modify: `static/games.js` (remplacer les trois fonctions stub par leur implémentation, ajouter `playC4Move` et `placeC4Disc`)
- Modify: `static/games.css` (styles du plateau)

**Interfaces:**
- Consumes de Task 1 : `C4_ROWS`, `C4_COLS`, `createBoard()`, `dropDisc(board, col, player)`.
- Consumes de Task 2 : `c4`, `c4El`, `C4_PLAYERS`, `cancelC4Drop()`, `startC4Round()`.
- Produces : `C4_DROP_MS` (durée en ms, alignée sur l'animation CSS), `renderC4Board()`, `updateC4Turn()`, `updateC4Score()`, `placeC4Disc(row, col, player)`, `playC4Move(col)`.

- [ ] **Step 1 : ajouter les styles du plateau**

Ajouter à la fin de `static/games.css` :

```css
/* ============================================================
   PUISSANCE 4 — plateau
   ============================================================ */
.c4-container {
    background: var(--card-bg);
    border-radius: 1.5rem;
    padding: clamp(0.75rem, 3vw, 1.5rem);
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.15),
        0 0 0 1px rgba(255, 255, 255, 0.5) inset;
    backdrop-filter: blur(10px);
}

.c4-header {
    text-align: center;
    margin-bottom: 0.75rem;
}

.c4-title {
    color: var(--text);
    font-size: clamp(1.2rem, 5vw, 1.6rem);
}

.c4-score {
    margin-top: 0.25rem;
    color: var(--text-light);
    font-size: 0.95rem;
    font-weight: 600;
}

.c4-turn {
    text-align: center;
    font-size: clamp(1rem, 4.5vw, 1.25rem);
    font-weight: 700;
    padding: 0.6rem;
    border-radius: 0.75rem;
    margin-bottom: 0.75rem;
    background: var(--primary-light);
    color: var(--text);
    transition: background 0.25s;
}

.c4-turn-p1 { background: #ffe0e3; color: var(--c4-red-dark); }
.c4-turn-p2 { background: #fff5d6; color: var(--c4-yellow-dark); }
.c4-turn-over { background: var(--success-light); color: #14713a; }

.c4-board {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: clamp(3px, 1.2vw, 8px);
    padding: clamp(4px, 1.5vw, 10px);
    max-width: 420px;
    margin: 0 auto;
    background: linear-gradient(160deg, var(--c4-board), var(--c4-board-dark));
    border-radius: 0.9rem;
    box-shadow: 0 10px 24px rgba(59, 83, 176, 0.35);
}

.c4-col {
    display: grid;
    grid-template-rows: repeat(6, 1fr);
    gap: clamp(3px, 1.2vw, 8px);
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 0.5rem;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;
}

.c4-col:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 2px;
}

.c4-cell {
    aspect-ratio: 1;
    background: var(--c4-hole);
    border-radius: 50%;
    box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.22);
}

.c4-disc {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    box-shadow:
        inset 0 -3px 6px rgba(0, 0, 0, 0.25),
        0 2px 4px rgba(0, 0, 0, 0.2);
    animation: c4Drop 0.35s cubic-bezier(0.5, 0, 0.75, 0.4);
}

.c4-p1 { background: radial-gradient(circle at 35% 30%, #ff8a93, var(--c4-red)); }
.c4-p2 { background: radial-gradient(circle at 35% 30%, #ffe6a1, var(--c4-yellow)); }

@keyframes c4Drop {
    from { transform: translateY(calc(var(--c4-fall, 1) * -115%)); }
    to   { transform: translateY(0); }
}

.c4-actions {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
}

.c4-actions .back-btn {
    min-height: 44px;
}

/* ============================================================
   HOVER — pointeur fin uniquement (jamais sur tactile)
   ============================================================ */
@media (hover: hover) and (pointer: fine) {
    .games-entry-btn:hover,
    .c4-entry-btn:hover {
        border-color: var(--purple);
        transform: translateX(5px) scale(1.02);
        box-shadow: 0 8px 25px rgba(165, 94, 234, 0.35);
    }

    .c4-hint-p1 .c4-col:hover { background: rgba(255, 71, 87, 0.30); }
    .c4-hint-p2 .c4-col:hover { background: rgba(255, 201, 60, 0.35); }
}
```

`style.css` contient déjà la règle globale `@media (prefers-reduced-motion: reduce)` qui neutralise `c4Drop` : ne pas la redéfinir ici.

- [ ] **Step 2 : implémenter le rendu et la pose des jetons**

Dans `static/games.js`, remplacer les trois stubs :

```js
// Rendu et interactions : implémentés en Task 3.
function renderC4Board() {}
function updateC4Turn() {}
function updateC4Score() {}
```

par :

```js
// ============================================================
// RENDU
// ============================================================

// Durée de la chute, alignée sur l'animation c4Drop de games.css.
const C4_DROP_MS = 350;

function renderC4Board() {
    c4El.board.textContent = '';
    for (let col = 0; col < C4_COLS; col++) {
        const colEl = document.createElement('button');
        colEl.type = 'button';
        colEl.className = 'c4-col';
        colEl.dataset.col = col;
        colEl.setAttribute('aria-label', `Colonne ${col + 1}`);

        for (let row = 0; row < C4_ROWS; row++) {
            const cell = document.createElement('div');
            cell.className = 'c4-cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            colEl.appendChild(cell);
        }

        colEl.addEventListener('click', () => playC4Move(col));
        c4El.board.appendChild(colEl);
    }
}

function updateC4Turn() {
    const p = C4_PLAYERS[c4.current];
    c4El.turn.textContent = `${p.emoji} À ${p.name} de jouer`;
    c4El.turn.className = `c4-turn c4-turn-p${c4.current}`;
    c4El.board.className = `c4-board c4-hint-p${c4.current}`;
}

function updateC4Score() {
    c4El.score.textContent = `🔴 Rouge ${c4.wins[1]} – ${c4.wins[2]} Jaune 🟡`;
}

function placeC4Disc(row, col, player) {
    const cell = c4El.board.querySelector(`.c4-cell[data-row="${row}"][data-col="${col}"]`);
    if (!cell) return;
    const disc = document.createElement('div');
    disc.className = `c4-disc c4-p${player}`;
    // Hauteur de chute : nombre de cases parcourues depuis le haut du plateau.
    disc.style.setProperty('--c4-fall', row + 1);
    cell.appendChild(disc);
}

// ============================================================
// COUPS
// ============================================================

function playC4Move(col) {
    if (c4.locked || c4.over) return;

    const row = dropDisc(c4.board, col, c4.current);
    if (row === -1) return; // colonne pleine : coup ignoré, le tour ne change pas

    const player = c4.current;
    c4.locked = true;
    placeC4Disc(row, col, player);

    c4.dropTimer = setTimeout(() => {
        c4.dropTimer = null;
        c4.current = player === 1 ? 2 : 1;
        c4.locked = false;
        updateC4Turn();
    }, C4_DROP_MS);
}
```

- [ ] **Step 3 : vérifier dans le navigateur**

```bash
cd /Users/bodul/Workspace/chronomaths && go run main.go
```

Sur `http://localhost:8080` → Jeux → Puissance 4, vérifier :

1. Le plateau affiche 7 colonnes × 6 trous.
2. Un clic sur une colonne pose un jeton rouge **en bas**, avec une chute animée.
3. Le bandeau passe à `🟡 À Jaune de jouer` et change de couleur de fond.
4. Les jetons s'empilent correctement colonne par colonne.
5. Remplir une colonne (6 clics alternés dessus), puis cliquer encore : rien ne se passe, le tour ne change pas.
6. Cliquer très vite deux fois : le second clic est ignoré pendant l'animation (un seul jeton posé).
7. Console navigateur : aucune erreur.
8. `Nouvelle partie` vide le plateau et le bandeau repart sur `🟡 À Jaune de jouer` (le starter a basculé).

Arrêter le serveur.

- [ ] **Step 4 : commit**

```bash
cd /Users/bodul/Workspace/chronomaths
git add static/games.js static/games.css
git commit -m "feat: plateau Puissance 4 et alternance des tours"
```

---

### Task 4 : Victoire, match nul et score de manches

Branche `findWin` et `isDraw` sur la boucle de jeu, met en évidence l'alignement gagnant et tient le score de manches.

**Files:**
- Modify: `static/games.js` (`playC4Move`, ajout de `highlightC4Win` et `showC4End`)
- Modify: `static/games.css` (mise en évidence des jetons gagnants)

**Interfaces:**
- Consumes de Task 1 : `findWin(board, row, col)`, `isDraw(board)`.
- Consumes de Task 3 : `placeC4Disc`, `updateC4Turn`, `updateC4Score`, `C4_DROP_MS`.
- Produces : `highlightC4Win(cells)`, `showC4End(text)`.

- [ ] **Step 1 : ajouter le style de mise en évidence**

Dans `static/games.css`, insérer juste après le bloc `@keyframes c4Drop { … }` :

```css
.c4-disc-win {
    animation: c4Pulse 0.9s ease-in-out infinite;
    box-shadow:
        0 0 0 3px #fff,
        0 0 16px 4px rgba(255, 255, 255, 0.9);
}

@keyframes c4Pulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.12); }
}
```

Sous `prefers-reduced-motion: reduce`, la règle globale de `style.css` arrête la pulsation ; le contour blanc statique du `box-shadow` reste et suffit à identifier l'alignement.

- [ ] **Step 2 : brancher la détection de fin de partie**

Dans `static/games.js`, remplacer le corps de `playC4Move` par :

```js
function playC4Move(col) {
    if (c4.locked || c4.over) return;

    const row = dropDisc(c4.board, col, c4.current);
    if (row === -1) return; // colonne pleine : coup ignoré, le tour ne change pas

    const player = c4.current;
    c4.locked = true;
    placeC4Disc(row, col, player);

    const win = findWin(c4.board, row, col);
    const draw = !win && isDraw(c4.board);

    c4.dropTimer = setTimeout(() => {
        c4.dropTimer = null;

        if (win) {
            c4.over = true;
            c4.wins[player]++;
            highlightC4Win(win);
            const p = C4_PLAYERS[player];
            showC4End(`🏆 ${p.emoji} ${p.name} gagne !`);
        } else if (draw) {
            c4.over = true;
            showC4End('🤝 Match nul !');
        } else {
            c4.current = player === 1 ? 2 : 1;
            c4.locked = false;
            updateC4Turn();
        }
    }, C4_DROP_MS);
}
```

Et ajouter, juste après `playC4Move` :

```js
function highlightC4Win(cells) {
    cells.forEach(({ row, col }) => {
        const disc = c4El.board.querySelector(
            `.c4-cell[data-row="${row}"][data-col="${col}"] .c4-disc`
        );
        if (disc) disc.classList.add('c4-disc-win');
    });
}

function showC4End(text) {
    c4El.turn.textContent = text;
    c4El.turn.className = 'c4-turn c4-turn-over';
    c4El.board.className = 'c4-board'; // retire la teinte de survol
    updateC4Score();
}
```

- [ ] **Step 3 : vérifier dans le navigateur**

```bash
cd /Users/bodul/Workspace/chronomaths && go run main.go
```

Sur `http://localhost:8080` → Jeux → Puissance 4, vérifier :

1. **Victoire horizontale** : colonnes `0,0,1,1,2,2,3` → Rouge aligne 4 en bas. Bandeau `🏆 🔴 Rouge gagne !` sur fond vert, les 4 jetons rouges pulsent, score `🔴 Rouge 1 – 0 Jaune 🟡`.
2. Après la victoire, cliquer sur une colonne libre : aucun jeton n'est posé.
3. `Nouvelle partie` : plateau vidé, score conservé à `1 – 0`, c'est **Jaune** qui commence.
4. **Victoire verticale** : 4 clics sur la même colonne pour un joueur, entrecoupés de coups de l'adversaire ailleurs.
5. **Victoire en diagonale** : vérifier qu'elle est détectée et mise en évidence.
6. **Match nul** : remplir le plateau sans alignement → bandeau `🤝 Match nul !`, score inchangé.
7. `← Retour` puis re-entrée via le hub : le score repart à `0 – 0` et Rouge commence.
8. Console navigateur : aucune erreur.

Arrêter le serveur.

- [ ] **Step 4 : commit**

```bash
cd /Users/bodul/Workspace/chronomaths
git add static/games.js static/games.css
git commit -m "feat: victoire, match nul et score de manches au Puissance 4"
```

---

### Task 5 : Service Worker, documentation et audits

Rend la PWA cohérente avec les nouveaux fichiers, met à jour la documentation, et réalise les audits sécurité et responsive imposés par les consignes 5 et 6 de `CLAUDE.md`.

**Files:**
- Modify: `static/sw.js:1-9`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes : les fichiers `static/games.js` et `static/games.css` livrés par les tâches précédentes.
- Produces : rien de programmatique.

- [ ] **Step 1 : mettre à jour le Service Worker**

`sw.js` sert en cache-first (`cached || fetchPromise`) : sans bump du cache, un utilisateur ayant déjà installé la PWA continuerait à recevoir l'ancien `index.html` sans les balises `games.js` / `games.css`.

Dans `static/sw.js`, remplacer les lignes 1 à 9 par :

```js
const CACHE_NAME = 'chronomaths-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/games.css',
  '/app.js',
  '/games.js',
  '/icon.svg',
  '/manifest.json'
];
```

Le handler `activate` existant purge automatiquement `chronomaths-v1`.

- [ ] **Step 2 : vérifier la mise à jour du cache**

```bash
cd /Users/bodul/Workspace/chronomaths && go run main.go
```

Dans Chrome, sur `http://localhost:8080` : DevTools → Application → Cache Storage. Vérifier qu'un cache `chronomaths-v2` contient bien `/games.js` et `/games.css`, et que `chronomaths-v1` a disparu (recharger une fois si le nouveau SW est en `waiting`).

Arrêter le serveur.

- [ ] **Step 3 : audit sécurité (consigne 5)**

Exécuter les vérifications et consigner le résultat dans la réponse finale :

```bash
cd /Users/bodul/Workspace/chronomaths
grep -rn "innerHTML\|insertAdjacentHTML\|outerHTML\|document.write\|eval(\|new Function" static/
git diff --stat main.go go.mod
```

Attendu :
- Première commande : **aucun résultat**. Tout le rendu passe par `createElement` / `textContent`.
- Seconde commande : **aucune sortie** — `main.go` et `go.mod` sont intacts, aucune route ni surface réseau ajoutée.

Points à confirmer par relecture de `static/games.js` :
- Aucune entrée utilisateur libre (les seules interactions sont des clics sur 7 boutons à `col` fixé à la construction) → aucun vecteur d'injection.
- Les sélecteurs `querySelector` sont construits à partir de `row` / `col` numériques issus de boucles bornées, jamais d'une saisie.
- Aucun `localStorage`, cookie, ni requête réseau : rien à exfiltrer, rien à empoisonner.
- Aucune donnée n'est envoyée au serveur Go : le mode multijoueur existant et ses routes ne sont pas touchés.

- [ ] **Step 4 : audit responsive (consigne 6)**

```bash
cd /Users/bodul/Workspace/chronomaths && go run main.go
```

Dans Chrome DevTools, mode responsive, vérifier sur l'écran Puissance 4 :

| Vérification | Attendu |
|---|---|
| 320 × 568 (iPhone SE 1) | Plateau entier visible, **aucun scroll horizontal** |
| 375 × 667 | Idem, jetons confortables |
| 768 × 1024 (tablette) | Plateau plafonné à 420 px, centré |
| Desktop 1440 px | Conteneur plafonné à 500 px (`.container`), plateau centré |
| Cible tactile | Une colonne mesure ≥ 44 px sur l'axe vertical à toutes les largeurs (elle fait 6 cases de haut) |
| Émulation tactile activée | Aucun effet `:hover` (teinte de colonne absente) |
| `prefers-reduced-motion: reduce` (DevTools → Rendering) | Le jeton apparaît sans chute ; les jetons gagnants ne pulsent pas mais gardent leur contour blanc |
| Navigation clavier | `Tab` parcourt les colonnes, `Entrée` / `Espace` pose un jeton, l'anneau de focus est visible |
| `background-attachment` | `grep -n "background-attachment" static/games.css` → aucun résultat |

Arrêter le serveur.

- [ ] **Step 5 : mettre à jour `README.md`**

Ajouter une section « 🎮 Jeux » après la description des modes existants :

```markdown
## 🎮 Jeux

Une section détente, accessible depuis l'accueil via le bouton **🎮 Jeux**.

### Puissance 4

Deux joueurs s'affrontent **sur le même appareil**, chacun son tour.

- 🔴 **Rouge** commence la première partie, 🟡 **Jaune** joue en second.
- On clique (ou on touche) une colonne pour y laisser tomber son jeton.
- Le premier à aligner **4 jetons** — horizontalement, verticalement ou en diagonale — gagne : l'alignement gagnant se met à clignoter.
- Si le plateau se remplit sans alignement, c'est **match nul**.
- Le **score des manches** est conservé tant qu'on reste sur l'écran, et le joueur qui commence alterne à chaque nouvelle partie.

Aucun calcul n'est demandé : c'est une récompense entre deux séries d'entraînement.
```

- [ ] **Step 6 : mettre à jour `CLAUDE.md`**

Trois modifications dans `/Users/bodul/Workspace/chronomaths/CLAUDE.md`.

1. Dans le bloc `Structure`, ajouter sous `static/` :

```
    ├── games.js      # Section Jeux : logique pure + rendu du Puissance 4
    ├── games.css     # Styles du hub Jeux et du plateau Puissance 4
```

2. Dans `## Architecture`, remplacer le bloc « Flux de navigation » par :

````markdown
### Flux de navigation

```
Accueil ──┬─ (+, −, × ou ÷) → Modes (Sprint/Course/Marathon/Posée/Révision/Multi) → Jeu
          └─ 🎮 Jeux → Hub Jeux → Puissance 4
```
````

3. Ajouter une sous-section à la fin de `## Architecture` :

````markdown
### Section Jeux

- `static/games.js` et `static/games.css` sont chargés **après** `app.js` et `style.css`. L'ordre est structurant : ce sont des scripts classiques (pas de modules ES), et `games.js` résout `screens`, `showScreen` et `screenCleanups` par portée lexicale globale.
- Tout nouvel écran doit s'enregistrer dans `screens` (sinon `showScreen()` lève une `TypeError`) et, s'il détient un timer ou une connexion, dans le registre `screenCleanups` de `app.js` — qui est appelé en tête de `cleanupScreen()` sans avoir à toucher à son `switch`.
- ⚠️ Ne jamais réutiliser la classe `.operation-card` pour un bouton hors des 4 opérations : elle est bindée globalement vers `config.operation` et fait planter `updateModesScreen()`.
- **Puissance 4** : local, 2 joueurs sur le même écran, aucun calcul. La logique du plateau (`createBoard`, `dropDisc`, `findWin`, `isDraw`) est écrite en fonctions pures sans DOM, dans le premier bloc de `games.js`, pour rester portable côté Go si un mode en ligne est ajouté un jour.
- Toute modification de `static/` doit s'accompagner d'un bump de `CACHE_NAME` dans `sw.js` (cache-first : sinon la PWA sert l'ancienne version).
````

- [ ] **Step 7 : relancer la vérification des fonctions pures**

Le refactoring des tâches 2 à 4 a inséré du code après la bannière ; confirmer que la troncature fonctionne toujours et que la logique n'a pas régressé :

```bash
cd /Users/bodul/Workspace/chronomaths && node "/private/tmp/claude-501/-Users-bodul-Workspace-chronomaths/425b2620-6956-485d-a8f0-bd8ff7930aa6/scratchpad/test-connect4.js"
```

Attendu : `✅ Tous les tests passent`, code de sortie 0.

- [ ] **Step 8 : vérifier la compilation Go**

```bash
cd /Users/bodul/Workspace/chronomaths && go vet ./... && go build -o /dev/null .
```

Attendu : aucune sortie, code de sortie 0. Confirme que `//go:embed static/*` accepte les nouveaux fichiers.

- [ ] **Step 9 : commit**

```bash
cd /Users/bodul/Workspace/chronomaths
git add static/sw.js README.md CLAUDE.md
git commit -m "doc: section Jeux dans README et CLAUDE, bump du cache PWA"
```

---

## Récapitulatif des commits attendus

| # | Message | Fichiers |
|---|---|---|
| 1 | `feat: logique pure du Puissance 4` | `static/games.js` |
| 2 | `feat: écrans Jeux et navigation vers le Puissance 4` | `index.html`, `app.js`, `games.js`, `games.css` |
| 3 | `feat: plateau Puissance 4 et alternance des tours` | `games.js`, `games.css` |
| 4 | `feat: victoire, match nul et score de manches au Puissance 4` | `games.js`, `games.css` |
| 5 | `doc: section Jeux dans README et CLAUDE, bump du cache PWA` | `sw.js`, `README.md`, `CLAUDE.md` |
