package main

// ============================================================
// PUISSANCE 4 — LOGIQUE PURE
// Portage de static/games.js : board[row][col], ligne 0 = haut,
// 0 = vide, 1 = rouge, 2 = jaune.
// ============================================================

const (
	c4Rows = 6
	c4Cols = 7
)

// Cell désigne une case du plateau. Sérialisée telle quelle vers le client.
type Cell struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

// C4Board est une grille 6×7. Le zéro-value est un plateau vide.
type C4Board [c4Rows][c4Cols]int

func c4CreateBoard() C4Board {
	return C4Board{}
}

// c4Drop pose un jeton dans la case libre la plus basse de la colonne.
// Retourne la ligne atteinte, ou -1 si la colonne est hors bornes ou pleine.
func c4Drop(b *C4Board, col, player int) int {
	if col < 0 || col >= c4Cols {
		return -1
	}
	for row := c4Rows - 1; row >= 0; row-- {
		if b[row][col] == 0 {
			b[row][col] = player
			return row
		}
	}
	return -1
}

// c4FindWin cherche un alignement passant par le jeton (row, col).
// Retourne toutes les cellules alignées (4 ou plus), ou nil.
func c4FindWin(b *C4Board, row, col int) []Cell {
	player := b[row][col]
	if player == 0 {
		return nil
	}

	for _, d := range [4][2]int{{0, 1}, {1, 0}, {1, 1}, {1, -1}} {
		line := []Cell{{Row: row, Col: col}}
		for _, sign := range [2]int{1, -1} {
			r, c := row+d[0]*sign, col+d[1]*sign
			for r >= 0 && r < c4Rows && c >= 0 && c < c4Cols && b[r][c] == player {
				line = append(line, Cell{Row: r, Col: c})
				r += d[0] * sign
				c += d[1] * sign
			}
		}
		if len(line) >= 4 {
			return line
		}
	}
	return nil
}

// c4IsDraw : plus aucune case libre sur la ligne du haut.
func c4IsDraw(b *C4Board) bool {
	for col := 0; col < c4Cols; col++ {
		if b[0][col] == 0 {
			return false
		}
	}
	return true
}
