package main

import "testing"

// fill applique une suite de coups (colonne, joueur) sur un plateau neuf.
func fill(t *testing.T, moves ...[2]int) C4Board {
	t.Helper()
	b := c4CreateBoard()
	for i, m := range moves {
		if row := c4Drop(&b, m[0], m[1]); row == -1 {
			t.Fatalf("coup %d (col=%d joueur=%d) refusé", i, m[0], m[1])
		}
	}
	return b
}

func TestC4CreateBoardIsEmpty(t *testing.T) {
	b := c4CreateBoard()
	for row := 0; row < c4Rows; row++ {
		for col := 0; col < c4Cols; col++ {
			if b[row][col] != 0 {
				t.Fatalf("case (%d,%d) = %d, attendu 0", row, col, b[row][col])
			}
		}
	}
}

func TestC4DropStacksFromBottom(t *testing.T) {
	b := c4CreateBoard()
	if row := c4Drop(&b, 3, 1); row != 5 {
		t.Fatalf("premier jeton en ligne %d, attendu 5", row)
	}
	if row := c4Drop(&b, 3, 2); row != 4 {
		t.Fatalf("deuxième jeton en ligne %d, attendu 4", row)
	}
	if b[5][3] != 1 || b[4][3] != 2 {
		t.Fatalf("empilement incorrect: b[5][3]=%d b[4][3]=%d", b[5][3], b[4][3])
	}
}

func TestC4DropRejectsFullColumn(t *testing.T) {
	b := c4CreateBoard()
	for i := 0; i < c4Rows; i++ {
		if c4Drop(&b, 0, 1) == -1 {
			t.Fatalf("jeton %d refusé alors que la colonne a de la place", i)
		}
	}
	if row := c4Drop(&b, 0, 1); row != -1 {
		t.Fatalf("colonne pleine acceptée, ligne %d", row)
	}
}

func TestC4DropRejectsOutOfBounds(t *testing.T) {
	b := c4CreateBoard()
	for _, col := range []int{-1, c4Cols, 99} {
		if row := c4Drop(&b, col, 1); row != -1 {
			t.Fatalf("colonne %d acceptée, ligne %d", col, row)
		}
	}
}

func TestC4FindWinHorizontal(t *testing.T) {
	b := fill(t, [2]int{0, 1}, [2]int{1, 1}, [2]int{2, 1})
	row := c4Drop(&b, 3, 1)
	line := c4FindWin(&b, row, 3)
	if len(line) != 4 {
		t.Fatalf("alignement horizontal: %d cellules, attendu 4", len(line))
	}
}

func TestC4FindWinVertical(t *testing.T) {
	b := fill(t, [2]int{2, 2}, [2]int{2, 2}, [2]int{2, 2})
	row := c4Drop(&b, 2, 2)
	line := c4FindWin(&b, row, 2)
	if len(line) != 4 {
		t.Fatalf("alignement vertical: %d cellules, attendu 4", len(line))
	}
}

func TestC4FindWinDiagonalUp(t *testing.T) {
	// Diagonale montante vers la droite : (5,0) (4,1) (3,2) (2,3)
	b := fill(t,
		[2]int{0, 1},
		[2]int{1, 2}, [2]int{1, 1},
		[2]int{2, 2}, [2]int{2, 2}, [2]int{2, 1},
		[2]int{3, 2}, [2]int{3, 2}, [2]int{3, 2},
	)
	row := c4Drop(&b, 3, 1)
	line := c4FindWin(&b, row, 3)
	if len(line) != 4 {
		t.Fatalf("diagonale montante: %d cellules, attendu 4", len(line))
	}
}

func TestC4FindWinDiagonalDown(t *testing.T) {
	// Diagonale descendante vers la droite : (2,0) (3,1) (4,2) (5,3)
	b := fill(t,
		[2]int{0, 2}, [2]int{0, 2}, [2]int{0, 2}, [2]int{0, 1},
		[2]int{1, 2}, [2]int{1, 2}, [2]int{1, 1},
		[2]int{2, 2}, [2]int{2, 1},
		[2]int{3, 1},
	)
	line := c4FindWin(&b, 2, 0)
	if len(line) != 4 {
		t.Fatalf("diagonale descendante: %d cellules, attendu 4", len(line))
	}
}

func TestC4FindWinFiveInARow(t *testing.T) {
	b := fill(t, [2]int{0, 1}, [2]int{1, 1}, [2]int{3, 1}, [2]int{4, 1})
	row := c4Drop(&b, 2, 1)
	line := c4FindWin(&b, row, 2)
	if len(line) != 5 {
		t.Fatalf("alignement de 5: %d cellules, attendu 5", len(line))
	}
}

func TestC4FindWinNoFalsePositive(t *testing.T) {
	b := fill(t, [2]int{0, 1}, [2]int{1, 1}, [2]int{2, 1}, [2]int{3, 2})
	if line := c4FindWin(&b, 5, 3); line != nil {
		t.Fatalf("faux positif sur 3 alignés + 1 adverse: %v", line)
	}
	if line := c4FindWin(&b, 5, 2); line != nil {
		t.Fatalf("faux positif sur 3 alignés: %v", line)
	}
}

func TestC4FindWinIgnoresEmptyCell(t *testing.T) {
	b := c4CreateBoard()
	if line := c4FindWin(&b, 0, 0); line != nil {
		t.Fatalf("case vide considérée comme gagnante: %v", line)
	}
}

func TestC4IsDrawOnlyWhenTopRowFull(t *testing.T) {
	b := c4CreateBoard()
	if c4IsDraw(&b) {
		t.Fatal("plateau vide déclaré nul")
	}
	for col := 0; col < c4Cols; col++ {
		for row := 0; row < c4Rows; row++ {
			c4Drop(&b, col, 1+(row+col)%2)
		}
		if col < c4Cols-1 && c4IsDraw(&b) {
			t.Fatalf("nul déclaré après %d colonnes remplies", col+1)
		}
	}
	if !c4IsDraw(&b) {
		t.Fatal("plateau plein non déclaré nul")
	}
}
