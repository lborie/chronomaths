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
    score: document.getElementById('c4-score'),
    replay: document.getElementById('btn-c4-replay'),
    replayLabel: document.getElementById('c4-replay-label'),
    rematchStatus: document.getElementById('c4-rematch-status')
};

// État du mode en ligne. Le plateau fait autorité côté serveur : on ne garde
// ici que l'identité des joueurs et le dernier snapshot reçu.
const c4Online = {
    color: 0,            // 1 = rouge, 2 = jaune
    myName: '',
    opponentName: '',
    state: null,
    lost: ''             // message de fin anormale, '' si tout va bien
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
    c4FocusCol = null; // on quitte le plateau : à la prochaine entrée, aucune colonne ne doit resurgir (btn-c4-replay reste sur place et ne fait pas ce nettoyage)
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

document.getElementById('btn-connect4-online').addEventListener('click', () => {
    showJoinScreen({
        emojiLeft: '🌍',
        title: 'Puissance 4 en ligne',
        emojiRight: '🔴',
        subtitle: 'Trouve un adversaire !',
        waitingEmoji: '🔴',
        back: 'games',
        onSubmit: joinConnect4Online
    });
});

document.getElementById('btn-c4-back').addEventListener('click', () => {
    cancelC4Drop();
    sessionClose();
    c4FocusCol = null; // on quitte le plateau : à la prochaine entrée, aucune colonne ne doit resurgir (btn-c4-replay reste sur place et ne fait pas ce nettoyage)
    showScreen('games');
});

document.getElementById('btn-c4-replay').addEventListener('click', () => {
    if (c4.mode === 'online') {
        sessionSend({ type: 'rematch' });
        return;
    }
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
    c4El.replay.style.display = '';
    c4El.replay.disabled = false;
    c4El.replayLabel.textContent = 'Nouvelle partie';
    c4El.rematchStatus.textContent = '';
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

// Colonne à reconcentrer après un rendu, en dehors de la fonction : un coup
// enchaîne deux rendus (renderC4Move verrouille la chute, puis révèle l'issue
// une fois l'animation terminée) et le premier désactive toutes les colonnes,
// donc la case ciblée n'y est jamais focusable — capturer localement à chaque
// appel perdrait la colonne avant le second rendu, qui la restituerait. En la
// gardant au niveau du module, elle survit à la reconstruction intermédiaire.
let c4FocusCol = null;

// Rendu du plateau depuis son état complet, partagé par les deux modes.
//   lastMove : {row, col} du dernier jeton posé (animé), ou null
//   line     : cellules gagnantes à mettre en valeur, ou null
//   playable : colonnes cliquables
//   hint     : couleur de l'indice de survol (1 ou 2), 0 pour aucun
function renderC4Snapshot(board, { lastMove, line, playable, hint }) {
    // La grille est reconstruite entièrement, ce qui éjecte le focus vers
    // <body>. Mémoriser la colonne au clavier pour la restituer plus bas :
    // - si le focus est sur une colonne, on retient sa position ;
    // - si le focus est déjà sur <body>, on suppose que c'est notre propre
    //   reconstruction précédente qui vient de l'y envoyer, et on garde la
    //   colonne mémorisée — hypothèse qui peut être fausse (chargement de la
    //   page, perte de focus ailleurs dans l'appli, clic qui ne focus pas le
    //   bouton selon le navigateur) ; c'est pourquoi les points de sortie du
    //   plateau (bouton « ← Retour », nettoyage d'écran) remettent
    //   explicitement c4FocusCol à null, pour ne jamais s'appuyer dessus au
    //   retour sur une manche neuve ;
    // - sinon, le focus a été déplacé délibérément ailleurs (ex. bouton
    //   « Nouvelle partie ») : on ne le ramène pas de force dans la grille.
    const focused = document.activeElement;
    if (focused && focused.classList.contains('c4-col')) {
        c4FocusCol = focused.dataset.col;
    } else if (focused !== document.body) {
        c4FocusCol = null;
    }

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

    if (c4FocusCol !== null) {
        const target = c4El.board.querySelector(`.c4-col[data-col="${c4FocusCol}"]:not(:disabled)`);
        if (target) target.focus();
    }
}

// Affiche la chute du dernier jeton, puis révèle l'issue de la manche.
// Les colonnes restent verrouillées pendant l'animation, ce qui interdit
// tout second coup sans drapeau supplémentaire.
function renderC4Move(board, opts, onSettled) {
    renderC4Snapshot(board, { ...opts, line: null, playable: false });
    // Deux snapshots serveur peuvent s'enchaîner avant l'échéance : le
    // second appel annule le premier, dont l'onSettled ne sera jamais
    // rappelé. C'est volontaire — un snapshot plus récent rend obsolète la
    // mise à jour que portait l'appel abandonné, l'état qui arrive fait
    // autorité.
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

// ============================================================
// PUISSANCE 4 EN LIGNE
// Le serveur fait autorité : chaque event porte un snapshot complet
// du plateau, le client n'appelle jamais dropDisc.
// ============================================================

function joinConnect4Online(name) {
    c4.mode = 'online';
    c4Online.color = 0;
    c4Online.myName = name;
    c4Online.opponentName = '';
    c4Online.state = null;
    c4Online.lost = '';

    showWaitingScreen(name);

    sessionJoin({
        game: 'connect4',
        name,
        on: {
            waiting: () => {
                setWaitingStatus('');
            },
            start: (msg) => {
                c4Online.color = msg.color;
                c4Online.opponentName = msg.opponent;
                showScreen('connect4');
                applyC4State(msg.state, false);
            },
            c4State: (msg) => applyC4State(msg.state, true),
            opponentLeft: () => showC4Lost('🚪 Adversaire déconnecté')
        },
        onLost: () => showC4Lost('⚠️ Connexion perdue'),
        onError: () => setWaitingStatus('Erreur de connexion')
    });
}

// Applique un snapshot serveur. animate est faux pour l'état initial d'une
// manche (aucun jeton à faire tomber).
function applyC4State(state, animate) {
    // Garde bornée : un snapshot mal formé (réseau) ne doit pas planter le
    // rendu, qui indexe board[row][col] sans vérification de forme.
    if (!state || !Array.isArray(state.board) || state.board.length !== C4_ROWS) {
        console.error('applyC4State: snapshot invalide, ignoré', state);
        return;
    }

    // Une case ne peut jamais être rejouée : deux coups réels ont donc
    // toujours des coordonnées distinctes. Une demande de revanche (accord
    // d'un seul joueur) rediffuse en revanche exactement le même lastMove
    // que la manche déjà terminée, sans qu'aucun jeton n'ait bougé — on ne
    // rejoue l'animation que si ces coordonnées ont changé depuis le
    // dernier snapshot rendu, capturé ici avant d'être écrasé.
    const prevMove = c4Online.state && c4Online.state.lastMove;
    const isNewMove = !!(state.lastMove && (
        !prevMove || prevMove.row !== state.lastMove.row || prevMove.col !== state.lastMove.col
    ));

    c4Online.state = state;

    const myTurn = !state.over && !c4Online.lost && state.current === c4Online.color;
    const opts = {
        lastMove: state.lastMove,
        line: state.line,
        playable: myTurn,
        hint: state.over || c4Online.lost ? 0 : state.current
    };

    if (animate && isNewMove) {
        renderC4Move(state.board, opts, () => updateC4Online(state));
    } else {
        // Rendu immédiat : cancelC4Drop() coupe une chute encore en cours si
        // ce snapshot ne correspond à aucun nouveau coup (état initial,
        // revanche demandée/acceptée, fin anormale de partie).
        cancelC4Drop();
        renderC4Snapshot(state.board, { ...opts, lastMove: null });
        updateC4Online(state);
    }
}

function updateC4Online(state) {
    updateC4OnlineTurn(state);
    updateC4OnlineScore(state);
    updateC4OnlineRematch(state);
}

function updateC4OnlineTurn(state) {
    if (c4Online.lost) {
        c4El.turn.textContent = c4Online.lost;
        c4El.turn.className = 'c4-turn c4-turn-over';
        return;
    }

    if (state.over) {
        if (state.result === 'draw') {
            c4El.turn.textContent = '🤝 Match nul !';
        } else if (state.winner === c4Online.color) {
            c4El.turn.textContent = '🏆 Tu gagnes !';
        } else {
            c4El.turn.textContent = `😢 ${c4Online.opponentName} gagne !`;
        }
        c4El.turn.className = 'c4-turn c4-turn-over';
        return;
    }

    const color = state.current;
    const emoji = C4_PLAYERS[color].emoji;
    c4El.turn.textContent = color === c4Online.color
        ? `${emoji} À toi de jouer`
        : `${emoji} Au tour de ${c4Online.opponentName}`;
    c4El.turn.className = `c4-turn c4-turn-p${color}`;
}

// Rouge (index 0) reste toujours à gauche, quel que soit le joueur devant
// l'écran : les deux clients affichent le même score dans le même ordre.
function updateC4OnlineScore(state) {
    const redName = c4Online.color === 1 ? c4Online.myName : c4Online.opponentName;
    const yellowName = c4Online.color === 2 ? c4Online.myName : c4Online.opponentName;
    c4El.score.textContent = `🔴 ${redName} ${state.wins[0]} – ${state.wins[1]} ${yellowName} 🟡`;
}

function updateC4OnlineRematch(state) {
    c4El.replayLabel.textContent = 'Nouvelle manche';

    if (c4Online.lost) {
        c4El.replay.style.display = 'none';
        c4El.rematchStatus.textContent = '';
        return;
    }

    c4El.replay.style.display = state.over ? '' : 'none';

    const meAsked = state.rematch[c4Online.color - 1];
    const themAsked = state.rematch[2 - c4Online.color];
    c4El.replay.disabled = meAsked;

    if (meAsked && !themAsked) {
        c4El.rematchStatus.textContent = `⏳ En attente de ${c4Online.opponentName}…`;
    } else if (themAsked && !meAsked) {
        c4El.rematchStatus.textContent = `🔄 ${c4Online.opponentName} veut rejouer`;
    } else {
        c4El.rematchStatus.textContent = '';
    }
}

// Fin anormale : adversaire parti ou flux perdu. Le plateau reste affiché,
// verrouillé, avec pour seule issue le bouton Retour.
function showC4Lost(message) {
    sessionClose();

    if (getActiveScreen() !== 'connect4' || !c4Online.state) {
        setWaitingStatus(message);
        return;
    }

    c4Online.lost = message;
    applyC4State(c4Online.state, false);
}
