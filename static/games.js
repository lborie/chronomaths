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
