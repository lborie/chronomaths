// ============================================================
// BATAILLE NAVALE EN LIGNE
// Le serveur fait autorité : le client envoie une case et n'affiche que le
// snapshot renvoyé. Il ne calcule jamais le résultat d'un tir.
// ============================================================

screens.battleship = document.getElementById('screen-battleship');

const BS_SIZE = 8;
const BS_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const bsEl = {
    score: document.getElementById('bs-score'),
    status: document.getElementById('bs-status'),
    grid: document.getElementById('bs-grid'),
    minimap: document.getElementById('bs-minimap'),
    minimapWrap: document.getElementById('bs-minimap-wrap'),
    aimLabel: document.getElementById('bs-aim-label'),
    fire: document.getElementById('btn-bs-fire'),
    shuffle: document.getElementById('btn-bs-shuffle'),
    ready: document.getElementById('btn-bs-ready'),
    replay: document.getElementById('btn-bs-replay'),
    replayLabel: document.getElementById('bs-replay-label'),
    rematchStatus: document.getElementById('bs-rematch-status'),
    back: document.getElementById('btn-bs-back')
};

// bsFocusCell est en portée MODULE et non locale au rendu : la grille est
// entièrement reconstruite à chaque snapshot, une capture locale perdrait donc
// la case focalisée entre deux rendus. Même raison que c4FocusCol.
let bsFocusCell = null;
// Case visée mais pas encore tirée, ou null. C'est le « viser » de
// « viser puis confirmer ».
let bsAimed = null;
// Dernier état rendu, pour pouvoir redessiner après une visée sans attendre un
// nouveau snapshot serveur.
let bsCurrentState = null;

// Le snapshot serveur est SYMÉTRIQUE : il ne dit pas quel siège je suis, parce
// que `ready`, `wins` et `winner` sont indexés par siège et identiques pour les
// deux joueuses. Deux drapeaux dérivés comblent ce manque, posés avant le rendu
// par applyBsState (tâche 4) et à la main par l'état de démonstration (tâche 3) :
//   state.iAmReady = state.ready[bsOnline.seat - 1]
//   state.iWon     = state.winner === bsOnline.seat

// bsCellLabel donne le repère humain d'une case : colonne en lettre, ligne
// en numéro 1-indexé. (1, 6) -> "G2".
function bsCellLabel(row, col) {
    return BS_COLS[col] + (row + 1);
}

// bsKeyOf sert de clé de Set/Map pour une case.
function bsKeyOf(cell) {
    return cell.row + ',' + cell.col;
}

function bsCellSet(cells) {
    return new Set((cells || []).map(bsKeyOf));
}

// renderBsSnapshot reconstruit TOUTE l'interface depuis l'état complet reçu.
// C'est ce qui permet aux trois phases de partager un seul chemin de rendu, et
// ce qui rend l'affichage auto-réparant si un snapshot est perdu.
function renderBsSnapshot(state) {
    bsCurrentState = state;
    const placement = state.phase === 'placement';
    // En placement, les deux boutons ne servent que tant que MA flotte n'est
    // pas verrouillée — d'où le drapeau dérivé iAmReady.
    const locked = state.iAmReady === true;

    bsEl.grid.innerHTML = '';
    bsEl.grid.appendChild(bsBuildGrid(state, placement));

    bsEl.minimapWrap.style.display = placement ? 'none' : 'block';
    if (!placement) {
        bsEl.minimap.innerHTML = '';
        bsEl.minimap.appendChild(bsBuildMinimap(state));
    }

    bsEl.shuffle.style.display = placement && !locked ? 'block' : 'none';
    bsEl.ready.style.display = placement && !locked ? 'block' : 'none';
    bsEl.replay.style.display = state.over ? 'block' : 'none';
    bsEl.aimLabel.textContent = bsAimed ? bsCellLabel(bsAimed.row, bsAimed.col) : '';
    bsEl.fire.style.display = state.phase === 'battle' ? 'block' : 'none';
    bsEl.fire.disabled = !(state.yourTurn && bsAimed);

    bsEl.status.textContent = bsStatusText(state);
    bsEl.score.textContent = `🚢 ${state.wins[0]} – ${state.wins[1]} 🚢`;

    bsRestoreFocus();
}

// bsBuildGrid construit la grande grille : ma flotte en placement, la grille de
// tir en bataille. Les en-têtes A–H et 1–8 aident au repérage.
function bsBuildGrid(state, placement) {
    const frag = document.createDocumentFragment();

    // Coin vide, puis les lettres de colonnes.
    frag.appendChild(bsHeaderCell(''));
    for (const letter of BS_COLS) frag.appendChild(bsHeaderCell(letter));

    const myShipCells = new Map();
    for (const ship of state.you.ships || []) {
        for (const c of ship.cells) myShipCells.set(bsKeyOf(c), ship);
    }
    // Mes tirs sur l'adversaire : c'est tout ce que je sais de sa grille.
    const myHits = bsCellSet(state.enemy.hits);
    const myMisses = bsCellSet(state.enemy.misses);

    for (let row = 0; row < BS_SIZE; row++) {
        frag.appendChild(bsHeaderCell(String(row + 1)));
        for (let col = 0; col < BS_SIZE; col++) {
            const key = row + ',' + col;
            let cell;
            if (placement) {
                // Ma flotte : non cliquable, on regarde seulement.
                cell = document.createElement('div');
                cell.className = 'bs-cell';
                const ship = myShipCells.get(key);
                if (ship) cell.classList.add(ship.sunk ? 'bs-cell-sunk' : 'bs-cell-ship');
            } else {
                // Grille de tir : un bouton par case, verrouillé par le DOM.
                cell = document.createElement('button');
                cell.className = 'bs-cell bs-cell-target';
                cell.dataset.row = String(row);
                cell.dataset.col = String(col);
                cell.setAttribute('aria-label', bsCellLabel(row, col));
                if (myHits.has(key)) cell.classList.add('bs-cell-hit');
                else if (myMisses.has(key)) cell.classList.add('bs-cell-miss');
                if (bsAimed && bsAimed.row === row && bsAimed.col === col) {
                    cell.classList.add('bs-cell-aimed');
                }
                // Une case déjà tirée ou un tour qui n'est pas le mien : le
                // verrou est porté par le DOM, sans drapeau de lock.
                cell.disabled = !state.yourTurn || myHits.has(key) || myMisses.has(key);
                cell.addEventListener('click', () => bsAim(row, col));
            }
            frag.appendChild(cell);
        }
    }
    return frag;
}

function bsHeaderCell(text) {
    const el = document.createElement('span');
    el.className = 'bs-head';
    el.textContent = text;
    return el;
}

// bsBuildMinimap montre ma flotte en petit pendant la bataille : non cliquable,
// juste pour voir les dégâts reçus.
function bsBuildMinimap(state) {
    const frag = document.createDocumentFragment();
    const shipCells = new Map();
    for (const ship of state.you.ships || []) {
        for (const c of ship.cells) shipCells.set(bsKeyOf(c), ship);
    }
    const hits = bsCellSet(state.you.hits);
    const misses = bsCellSet(state.you.misses);

    for (let row = 0; row < BS_SIZE; row++) {
        for (let col = 0; col < BS_SIZE; col++) {
            const key = row + ',' + col;
            const cell = document.createElement('div');
            cell.className = 'bs-mini-cell';
            const ship = shipCells.get(key);
            if (hits.has(key)) cell.classList.add(ship && ship.sunk ? 'bs-mini-sunk' : 'bs-mini-hit');
            else if (ship) cell.classList.add('bs-mini-ship');
            else if (misses.has(key)) cell.classList.add('bs-mini-miss');
            frag.appendChild(cell);
        }
    }
    return frag;
}

// bsAim est le « viser » de « viser puis confirmer ». Les cases font ~35 px sur
// téléphone, sous le seuil tactile de 44 px : sans cette confirmation, un doigt
// qui glisse coûterait un tour.
function bsAim(row, col) {
    bsAimed = { row, col };
    bsFocusCell = { row, col };
    if (bsCurrentState) renderBsSnapshot(bsCurrentState);
}

// bsRestoreFocus rend le focus à la case mémorisée après la reconstruction de
// la grille. L'heuristique « le focus est sur <body> » peut être fausse
// (chargement de page, focus perdu ailleurs) : on ne restaure donc que si la
// case existe encore et reste utilisable.
function bsRestoreFocus() {
    if (!bsFocusCell) return;
    const sel = `.bs-cell-target[data-row="${bsFocusCell.row}"][data-col="${bsFocusCell.col}"]`;
    const cell = bsEl.grid.querySelector(sel);
    if (cell && !cell.disabled && document.activeElement === document.body) {
        cell.focus();
    }
}

function bsStatusText(state) {
    if (state.phase === 'placement') {
        if (state.iAmReady) return '⏳ En attente de ton adversaire…';
        return 'Place ta flotte, puis valide';
    }
    if (state.over) {
        return state.iWon ? '🏆 Tu gagnes !' : '😢 Ton adversaire gagne !';
    }
    return state.yourTurn ? '🎯 À toi de tirer !' : '⏳ Au tour de ton adversaire';
}

// ------------------------------------------------------------
// État de démonstration — remplacé par la session en tâche 4.
// Il existe pour valider l'affichage, le responsive et le clavier sans serveur.
// ------------------------------------------------------------
function bsDemoState(phase) {
    const ships = [
        { name: 'Porte-avions', cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }], sunk: false },
        { name: 'Croiseur', cells: [{ row: 2, col: 5 }, { row: 3, col: 5 }, { row: 4, col: 5 }], sunk: false },
        { name: 'Sous-marin', cells: [{ row: 1, col: 2 }, { row: 2, col: 2 }, { row: 3, col: 2 }], sunk: false },
        { name: 'Torpilleur', cells: [{ row: 6, col: 6 }, { row: 7, col: 6 }], sunk: true }
    ];
    return {
        phase,
        you: { ships, hits: [{ row: 6, col: 6 }, { row: 7, col: 6 }], misses: [{ row: 5, col: 1 }] },
        enemy: { hits: [{ row: 3, col: 4 }, { row: 4, col: 4 }], misses: [{ row: 1, col: 1 }, { row: 6, col: 2 }], sunkShips: [], remaining: 4 },
        yourTurn: phase === 'battle',
        ready: [false, false],
        over: phase === 'over',
        winner: 0,
        lastShot: null,
        wins: [1, 0],
        rematch: [false, false],
        round: 1,
        iAmReady: false,
        iWon: true
    };
}

document.getElementById('btn-battleship-online').addEventListener('click', () => {
    bsAimed = null;
    bsFocusCell = null;
    renderBsSnapshot(bsDemoState('placement'));
    showScreen('battleship');
});

bsEl.shuffle.addEventListener('click', () => {
    // En tâche 4 : sessionSend({type:'shuffle'}).
    renderBsSnapshot(bsDemoState('placement'));
});

bsEl.ready.addEventListener('click', () => {
    // En tâche 4 : sessionSend({type:'ready'}).
    renderBsSnapshot(bsDemoState('battle'));
});

bsEl.fire.addEventListener('click', () => {
    // En tâche 4 : sessionSend({type:'fire', row, col}).
    bsAimed = null;
    renderBsSnapshot(bsDemoState('battle'));
});

bsEl.replay.addEventListener('click', () => {
    renderBsSnapshot(bsDemoState('placement'));
});

bsEl.back.addEventListener('click', () => {
    bsAimed = null;
    bsFocusCell = null;
    showScreen('games');
});

// La tâche 4 y ajoutera sessionClose().
screenCleanups.battleship = () => {
    bsAimed = null;
    bsFocusCell = null;
    bsCurrentState = null;
};
