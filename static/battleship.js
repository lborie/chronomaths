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
// deux joueuses. Deux drapeaux dérivés comblent ce manque, posés avant chaque
// rendu par applyBsState :
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

    // bsStatusText n'a pas de terme "lost" (elle appartient à la tâche 3, qui
    // ignore le mode en ligne) : sans ce || , un snapshot tardif après
    // showBsLost écraserait le message reçu par un texte de tour de jeu, alors
    // même que la grille reste verrouillée par le fold de yourTurn ci-dessus.
    bsEl.status.textContent = bsOnline.lost || bsStatusText(state);
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

document.getElementById('btn-battleship-online').addEventListener('click', () => {
    showJoinScreen({
        emojiLeft: '🚢',
        title: 'Bataille navale en ligne',
        emojiRight: '💥',
        subtitle: 'Trouve un adversaire !',
        waitingEmoji: '🚢',
        back: 'games',
        onSubmit: joinBattleshipOnline
    });
});

// ------------------------------------------------------------
// MODE EN LIGNE
// Le serveur fait autorité : on envoie une case, on affiche le snapshot.
// ------------------------------------------------------------
const bsOnline = {
    seat: 0,            // 1 ou 2
    myName: '',
    opponentName: '',
    state: null,        // dernier snapshot rendu
    lost: ''            // message de fin anormale, '' si tout va bien
};

function joinBattleshipOnline(name) {
    bsOnline.seat = 0;
    bsOnline.myName = name;
    bsOnline.opponentName = '';
    bsOnline.state = null;
    bsOnline.lost = '';
    bsAimed = null;
    bsFocusCell = null;

    // Affiche l'écran d'attente tout de suite, sans attendre la réponse du
    // serveur : sans cet appel, l'écran de jonction resterait affiché jusqu'à
    // l'event "start", et le waitingTilt d'une précédente course de fusées
    // pourrait rester posé sur l'emoji (voir toggle dans showWaitingScreen).
    showWaitingScreen(name);

    sessionJoin({
        game: 'battleship',
        name,
        on: {
            waiting: () => setWaitingStatus(''),
            start: (msg) => {
                bsOnline.seat = msg.seat;
                bsOnline.opponentName = msg.opponent;
                showScreen('battleship');
                applyBsState(msg.state);
            },
            bsState: (msg) => applyBsState(msg.state),
            opponentLeft: () => showBsLost('🚪 Adversaire déconnecté')
        },
        onLost: () => showBsLost('📡 Connexion perdue'),
        onError: () => setWaitingStatus('Connexion impossible')
    });
}

// applyBsState pose les deux drapeaux dérivés que le snapshot symétrique ne
// porte pas, décide s'il y a lieu d'animer, puis rend.
//
// L'animation ne se déclenche que si les COORDONNÉES de lastShot ont changé
// depuis le snapshot précédemment rendu. Deux discriminants seraient faux :
//   - le nom de l'event : une demande de revanche rediffuse le même lastShot,
//     ce qui rejouerait l'explosion du tir de la manche déjà terminée ;
//   - state.round : il s'incrémente précisément sur le seul snapshot qui ne
//     doit PAS s'animer, le début d'une manche neuve.
// C'est la leçon du commit fd3cd29 sur le Puissance 4, transposée.
function applyBsState(state) {
    state.iAmReady = state.ready[bsOnline.seat - 1] === true;
    state.iWon = state.winner === bsOnline.seat;
    // Un bsState tardif n'est pas sérialisé par le même verrou qu'un
    // opponentLeft côté serveur (handleDisconnect tient globalMu, Action tient
    // room.mu) : il peut donc arriver APRÈS que showBsLost ait déjà verrouillé
    // la partie. Ce terme unique protège cell.disabled et fire.disabled, tous
    // deux dérivés de yourTurn dans renderBsSnapshot, sans quoi un tel snapshot
    // réactiverait silencieusement la grille.
    state.yourTurn = state.yourTurn && !bsOnline.lost;

    const previous = bsOnline.state;
    const animate = bsShotChanged(previous && previous.lastShot, state.lastShot);

    bsOnline.state = state;
    renderBsSnapshot(state);
    bsUpdateRematch(state);
    if (animate) {
        bsAnnounceSunk(state);
        bsAnimateShot(state.lastShot);
    }
}

// bsShotChanged compare deux lastShot par leurs coordonnées et leur auteur.
function bsShotChanged(before, now) {
    if (!now) return false;
    if (!before) return true;
    return before.row !== now.row || before.col !== now.col || before.by !== now.by;
}

// bsAnimateShot marque brièvement la case touchée. La classe est posée sur la
// seule case du dernier tir, jamais sur toutes les cases : sinon chaque rendu
// rejouerait l'animation de l'ensemble de la grille.
function bsAnimateShot(shot) {
    const mine = shot.by === bsOnline.seat;
    const container = mine ? bsEl.grid : bsEl.minimap;
    const sel = mine
        ? `.bs-cell-target[data-row="${shot.row}"][data-col="${shot.col}"]`
        : `.bs-mini-cell:nth-child(${shot.row * BS_SIZE + shot.col + 1})`;
    const cell = container.querySelector(sel);
    if (cell) cell.classList.add('bs-cell-boom');
}

// bsAnnounceSunk annonce, dans le créneau de #bs-rematch-status, le nom du
// bateau qui vient d'être coulé — dans les deux sens. bsUpdateRematch (appelé
// juste avant) écrit TOUJOURS ce champ avant que cette fonction ne s'exécute —
// un message d'attente s'il y a lieu, sinon la chaîne vide : on n'annonce donc
// que si le créneau est resté vide, ce qui laisse la priorité à un message
// d'attente de revanche/placement. C'est aussi ce qui efface l'annonce au tir
// suivant : bsUpdateRematch l'aura déjà réinitialisée avant le nouvel appel.
function bsAnnounceSunk(state) {
    if (bsEl.rematchStatus.textContent !== '') return;
    const shot = state.lastShot;
    if (!shot || shot.result !== 'sunk') return;

    if (shot.by === bsOnline.seat) {
        // Le bateau adverse coulé : le nom vient du SERVEUR, qui l'a calculé en
        // appliquant le tir. AUCUN delta entre deux snapshots ici.
        //
        // enemy.sunkShips ne peut pas servir à le retrouver : ce tableau suit
        // l'ordre de la flotte (bsFleetSpec), pas l'ordre chronologique des
        // coulages. Le comparer au snapshot précédent annonçait donc un nom
        // FAUX — et non une annonce simplement avalée — dès qu'un snapshot
        // intermédiaire était abandonné, ce que sendEvent fait sur canal plein :
        // je coule le Croiseur (snapshot perdu) puis le Torpilleur, et le nom
        // « nouvellement apparu » remonte le Croiseur.
        //
        // shot.sunkName ne révèle rien : voir le commentaire de bsShot dans
        // battleship.go.
        if (shot.sunkName) bsEl.rematchStatus.textContent = `☠️ Tu as coulé le ${shot.sunkName} !`;
        return;
    }

    // Mon bateau coulé : déterministe et déjà sans delta, laissé inchangé — on
    // cherche celui dont les cases couvrent les coordonnées du dernier tir.
    const ship = (state.you.ships || []).find(
        (s) => s.sunk && s.cells.some((c) => c.row === shot.row && c.col === shot.col)
    );
    if (ship) bsEl.rematchStatus.textContent = `☠️ Ton ${ship.name} est coulé !`;
}

// bsUpdateRematch affiche l'attente, en placement comme après la manche. Le
// snapshot porte ready[] et rematch[] pour les deux sièges : on peut donc dire
// précisément qui l'on attend.
function bsUpdateRematch(state) {
    const meIdx = bsOnline.seat - 1;
    const otherIdx = 1 - meIdx;
    const other = bsOnline.opponentName || 'ton adversaire';

    if (bsOnline.lost) {
        bsEl.replay.style.display = 'none';
        bsEl.rematchStatus.textContent = '';
        return;
    }

    if (state.phase === 'placement' && state.ready[meIdx] && !state.ready[otherIdx]) {
        bsEl.rematchStatus.textContent = `⏳ En attente de ${other}…`;
        return;
    }
    if (state.over && state.rematch[meIdx] && !state.rematch[otherIdx]) {
        bsEl.rematchStatus.textContent = `⏳ En attente de ${other}…`;
        return;
    }
    bsEl.rematchStatus.textContent = '';
}

// showBsLost verrouille la partie sur une fin anormale. Il affiche le MESSAGE
// REÇU et non un texte en dur : une déconnexion d'adversaire et une perte de
// connexion ne se disent pas de la même façon.
function showBsLost(message) {
    sessionClose();

    if (getActiveScreen() !== 'battleship' || !bsOnline.state) {
        setWaitingStatus(message);
        return;
    }

    bsOnline.lost = message;
    bsEl.status.textContent = message;
    bsEl.replay.style.display = 'none';
    bsEl.shuffle.style.display = 'none';
    bsEl.ready.style.display = 'none';
    bsEl.fire.style.display = 'none';
    bsEl.rematchStatus.textContent = '';
    // Le verrou reste porté par le DOM : on désactive toutes les cases.
    bsEl.grid.querySelectorAll('.bs-cell-target').forEach((c) => { c.disabled = true; });
}

bsEl.shuffle.addEventListener('click', () => sessionSend({ type: 'shuffle' }));
bsEl.ready.addEventListener('click', () => sessionSend({ type: 'ready' }));
bsEl.replay.addEventListener('click', () => sessionSend({ type: 'rematch' }));

bsEl.fire.addEventListener('click', () => {
    if (!bsAimed) return;
    const { row, col } = bsAimed;
    // On efface la visée tout de suite : le bouton se désactive tant que la
    // visée reste vide. Ça n'interdit pas tout double envoi : si l'utilisatrice
    // vise une AUTRE case pendant l'aller-retour, bsAim relit l'état pré-tir
    // (yourTurn encore vrai) et réactive le bouton — un second tir peut alors
    // partir avant la réponse au premier. Sans conséquence : le serveur valide
    // chaque tir indépendamment, sans drapeau de lock côté client.
    bsAimed = null;
    if (bsOnline.state) renderBsSnapshot(bsOnline.state);
    sessionSend({ type: 'fire', row, col });
});

bsEl.back.addEventListener('click', () => {
    sessionClose();
    bsAimed = null;
    bsFocusCell = null;
    showScreen('games');
});

// Nettoyage déclenché aussi par la navigation arrière du navigateur.
screenCleanups.battleship = () => {
    sessionClose();
    bsAimed = null;
    bsFocusCell = null;
    bsCurrentState = null;
    bsOnline.state = null;
};
