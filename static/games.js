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
