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
    mode: 'local',   // 'local' | 'online'
    board: null,
    current: 1,      // joueur dont c'est le tour (mode local)
    starter: 1,      // joueur ayant commencé la manche (mode local)
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
    sessionClose();
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
    sessionClose();
    showScreen('games');
});

document.getElementById('btn-c4-replay').addEventListener('click', () => {
    c4.starter = c4.starter === 1 ? 2 : 1;
    startC4Round();
});

// Nouvelle rencontre : remet le score de manches à zéro.
function startC4Match() {
    c4.mode = 'local';
    c4.wins = { 1: 0, 2: 0 };
    c4.starter = 1;
    startC4Round();
}

// Nouvelle manche : plateau vierge, score de manches conservé.
function startC4Round() {
    cancelC4Drop();
    c4.board = createBoard();
    c4.current = c4.starter;
    c4.over = false;
    renderC4Snapshot(c4.board, {
        lastMove: null,
        line: null,
        playable: true,
        hint: c4.current
    });
    updateC4Turn();
    updateC4Score();
}

// ============================================================
// RENDU
// ============================================================

// Durée de la chute, alignée sur l'animation c4Drop de games.css.
const C4_DROP_MS = 350;

// prefers-reduced-motion neutralise l'animation : ne pas faire attendre.
function c4DropMs() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : C4_DROP_MS;
}

// Rendu du plateau depuis son état complet, partagé par les deux modes.
//   lastMove : {row, col} du dernier jeton posé (animé), ou null
//   line     : cellules gagnantes à mettre en valeur, ou null
//   playable : colonnes cliquables
//   hint     : couleur de l'indice de survol (1 ou 2), 0 pour aucun
function renderC4Snapshot(board, { lastMove, line, playable, hint }) {
    // La grille est reconstruite entièrement : mémoriser la colonne au clavier
    // pour la rendre, sinon chaque coup éjecterait le focus vers <body>.
    const focused = document.activeElement;
    const focusCol = focused && focused.classList.contains('c4-col')
        ? focused.dataset.col
        : null;

    c4El.board.textContent = '';
    c4El.board.className = hint ? `c4-board c4-hint-p${hint}` : 'c4-board';

    for (let col = 0; col < C4_COLS; col++) {
        const colEl = document.createElement('button');
        colEl.type = 'button';
        colEl.className = 'c4-col';
        colEl.dataset.col = col;
        colEl.disabled = !playable;
        colEl.setAttribute('aria-label', `Colonne ${col + 1}`);

        for (let row = 0; row < C4_ROWS; row++) {
            const cell = document.createElement('div');
            cell.className = 'c4-cell';

            const player = board[row][col];
            if (player !== 0) {
                const disc = document.createElement('div');
                disc.className = `c4-disc c4-p${player}`;
                if (lastMove && lastMove.row === row && lastMove.col === col) {
                    disc.classList.add('c4-disc-drop');
                    // Hauteur de chute : cases parcourues depuis le haut.
                    disc.style.setProperty('--c4-fall', row + 1);
                }
                if (line && line.some(c => c.row === row && c.col === col)) {
                    disc.classList.add('c4-disc-win');
                }
                cell.appendChild(disc);
            }
            colEl.appendChild(cell);
        }

        colEl.addEventListener('click', () => playC4Column(col));
        c4El.board.appendChild(colEl);
    }

    if (focusCol !== null) {
        const target = c4El.board.querySelector(`.c4-col[data-col="${focusCol}"]:not(:disabled)`);
        if (target) target.focus();
    }
}

// Affiche la chute du dernier jeton, puis révèle l'issue de la manche.
// Les colonnes restent verrouillées pendant l'animation, ce qui interdit
// tout second coup sans drapeau supplémentaire.
function renderC4Move(board, opts, onSettled) {
    renderC4Snapshot(board, { ...opts, line: null, playable: false });
    cancelC4Drop();
    c4.dropTimer = setTimeout(() => {
        c4.dropTimer = null;
        renderC4Snapshot(board, { ...opts, lastMove: null });
        if (onSettled) onSettled();
    }, opts.lastMove ? c4DropMs() : 0);
}

function updateC4Turn() {
    const p = C4_PLAYERS[c4.current];
    c4El.turn.textContent = `${p.emoji} À ${p.name} de jouer`;
    c4El.turn.className = `c4-turn c4-turn-p${c4.current}`;
}

function updateC4Score() {
    c4El.score.textContent = `🔴 Rouge ${c4.wins[1]} – ${c4.wins[2]} Jaune 🟡`;
}

// ============================================================
// COUPS
// ============================================================

// Point d'entrée du clic sur une colonne, quel que soit le mode.
function playC4Column(col) {
    if (c4.mode === 'online') {
        sessionSend({ type: 'drop', col });
        return;
    }
    playC4LocalMove(col);
}

function playC4LocalMove(col) {
    if (c4.over) return;

    const player = c4.current;
    const row = dropDisc(c4.board, col, player);
    if (row === -1) return; // colonne pleine : coup ignoré, le tour ne change pas

    const line = findWin(c4.board, row, col);
    const draw = !line && isDraw(c4.board);

    if (line) {
        c4.over = true;
        c4.wins[player]++;
    } else if (draw) {
        c4.over = true;
    } else {
        c4.current = player === 1 ? 2 : 1;
    }

    renderC4Move(c4.board, {
        lastMove: { row, col },
        line,
        playable: !c4.over,
        hint: c4.over ? 0 : c4.current
    }, () => {
        if (line) {
            const p = C4_PLAYERS[player];
            showC4End(`🏆 ${p.emoji} ${p.name} gagne !`);
        } else if (draw) {
            showC4End('🤝 Match nul !');
        } else {
            updateC4Turn();
        }
        updateC4Score();
    });
}

function showC4End(text) {
    c4El.turn.textContent = text;
    c4El.turn.className = 'c4-turn c4-turn-over';
}
