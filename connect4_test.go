package main

import (
	"encoding/json"
	"testing"
)

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

	// Cas discriminant : un jeton par colonne remplit la ligne du bas sans
	// toucher à la ligne du haut. Une implémentation qui testerait la ligne
	// du bas au lieu de la ligne du haut passerait le test ci-dessus à
	// l'identique (les deux lignes se remplissent en même temps quand on
	// verse colonne par colonne) ; celui-ci les distingue.
	var bottomOnly C4Board
	for col := 0; col < c4Cols; col++ {
		c4Drop(&bottomOnly, col, 1)
	}
	if c4IsDraw(&bottomOnly) {
		t.Fatal("nul déclaré avec la ligne du bas pleine et la ligne du haut vide")
	}
}

// --- Puissance 4 en ligne ---

// joinC4 apparie deux joueurs sur une partie de Puissance 4 et consomme les
// events de départ. p0 est rouge (couleur 1), p1 est jaune (couleur 2).
func joinC4(t *testing.T) (*Player, *Player, *Room) {
	t.Helper()
	resetHub()
	p0, _, err := join("connect4", "", "Ludo")
	if err != nil {
		t.Fatal(err)
	}
	expectEvent(t, p0, "waiting")
	p1, r, err := join("connect4", "", "Léa")
	if err != nil {
		t.Fatal(err)
	}
	return p0, p1, r
}

// startState lit l'event "start" d'un joueur et retourne sa couleur et l'état.
func startState(t *testing.T, p *Player) (int, c4StateMsg) {
	t.Helper()
	var msg C4StartMsg
	if err := json.Unmarshal(expectEvent(t, p, "start"), &msg); err != nil {
		t.Fatal(err)
	}
	return msg.Color, msg.State
}

// nextState lit un event "c4State" et retourne le snapshot.
func nextState(t *testing.T, p *Player) c4StateMsg {
	t.Helper()
	var ev C4StateEvent
	if err := json.Unmarshal(expectEvent(t, p, "c4State"), &ev); err != nil {
		t.Fatal(err)
	}
	return ev.State
}

func TestC4OnlineAssignsColorsAndStart(t *testing.T) {
	p0, p1, _ := joinC4(t)

	c0, s0 := startState(t, p0)
	c1, s1 := startState(t, p1)

	if c0 != 1 || c1 != 2 {
		t.Fatalf("couleurs = %d et %d, attendu 1 et 2", c0, c1)
	}
	if s0.Current != 1 || s1.Current != 1 {
		t.Fatalf("rouge ne commence pas: %d / %d", s0.Current, s1.Current)
	}
	if s0.Round != 1 {
		t.Fatalf("round = %d, attendu 1", s0.Round)
	}
	if s0.Over || s0.Result != "" || s0.LastMove != nil || s0.Line != nil {
		t.Fatalf("état de départ non vierge: %+v", s0)
	}
	if s0.Wins != [2]int{0, 0} || s0.Rematch != [2]bool{false, false} {
		t.Fatalf("compteurs de départ: wins=%v rematch=%v", s0.Wins, s0.Rematch)
	}
}

func TestC4OnlineDropBroadcastsSnapshot(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	act(t, r, p0, map[string]any{"type": "drop", "col": 3})

	for _, p := range []*Player{p0, p1} {
		s := nextState(t, p)
		if s.Board[5][3] != 1 {
			t.Fatalf("jeton absent du snapshot de %s: %v", p.Name, s.Board[5])
		}
		if s.LastMove == nil || s.LastMove.Row != 5 || s.LastMove.Col != 3 || s.LastMove.Player != 1 {
			t.Fatalf("lastMove = %+v", s.LastMove)
		}
		if s.Current != 2 {
			t.Fatalf("current = %d après le coup de rouge, attendu 2", s.Current)
		}
	}
}

func TestC4OnlineRejectsMoveOutOfTurn(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	// Jaune joue alors que c'est à rouge.
	act(t, r, p1, map[string]any{"type": "drop", "col": 0})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
}

func TestC4OnlineRejectsOutOfBoundsColumn(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	for _, col := range []int{-1, 7, 999} {
		act(t, r, p0, map[string]any{"type": "drop", "col": col})
		expectNoEvent(t, p0)
		expectNoEvent(t, p1)
	}
}

func TestC4OnlineRejectsFullColumn(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	// Six jetons dans la colonne 0, en alternance.
	turn := []*Player{p0, p1}
	for i := 0; i < 6; i++ {
		act(t, r, turn[i%2], map[string]any{"type": "drop", "col": 0})
		nextState(t, p0)
		nextState(t, p1)
	}
	// Le septième doit être refusé sans event.
	act(t, r, turn[0], map[string]any{"type": "drop", "col": 0})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
}

func TestC4OnlineWinIncrementsScoreAndLocksBoard(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	// Rouge aligne la colonne 0 ; jaune remplit la colonne 6.
	for i := 0; i < 3; i++ {
		act(t, r, p0, map[string]any{"type": "drop", "col": 0})
		nextState(t, p0)
		nextState(t, p1)
		act(t, r, p1, map[string]any{"type": "drop", "col": 6})
		nextState(t, p0)
		nextState(t, p1)
	}
	act(t, r, p0, map[string]any{"type": "drop", "col": 0})

	s := nextState(t, p0)
	nextState(t, p1)
	if !s.Over || s.Result != "win" || s.Winner != 1 {
		t.Fatalf("issue = over:%v result:%q winner:%d", s.Over, s.Result, s.Winner)
	}
	if len(s.Line) != 4 {
		t.Fatalf("ligne gagnante de %d cellules, attendu 4", len(s.Line))
	}
	if s.Wins != [2]int{1, 0} {
		t.Fatalf("wins = %v, attendu [1 0]", s.Wins)
	}

	// Plus aucun coup accepté après la fin de manche.
	act(t, r, p1, map[string]any{"type": "drop", "col": 1})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
}

func TestC4OnlineRematchNeedsBothPlayers(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	// Rematch refusé tant que la manche n'est pas terminée.
	act(t, r, p0, map[string]any{"type": "rematch"})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)

	// Victoire de rouge.
	for i := 0; i < 3; i++ {
		act(t, r, p0, map[string]any{"type": "drop", "col": 0})
		nextState(t, p0)
		nextState(t, p1)
		act(t, r, p1, map[string]any{"type": "drop", "col": 6})
		nextState(t, p0)
		nextState(t, p1)
	}
	act(t, r, p0, map[string]any{"type": "drop", "col": 0})
	nextState(t, p0)
	nextState(t, p1)

	// Un seul joueur prêt : l'état circule mais la manche ne repart pas.
	act(t, r, p0, map[string]any{"type": "rematch"})
	s := nextState(t, p0)
	nextState(t, p1)
	if s.Rematch != [2]bool{true, false} {
		t.Fatalf("rematch = %v, attendu [true false]", s.Rematch)
	}
	if !s.Over || s.Round != 1 {
		t.Fatalf("manche relancée trop tôt: over=%v round=%d", s.Over, s.Round)
	}

	// Idempotence : recliquer ne change rien d'autre que l'event diffusé.
	act(t, r, p0, map[string]any{"type": "rematch"})
	s = nextState(t, p0)
	nextState(t, p1)
	if s.Rematch != [2]bool{true, false} || s.Round != 1 {
		t.Fatalf("second clic non idempotent: rematch=%v round=%d", s.Rematch, s.Round)
	}

	// Le second joueur accepte : nouvelle manche, jaune commence, score gardé.
	act(t, r, p1, map[string]any{"type": "rematch"})
	s = nextState(t, p0)
	nextState(t, p1)
	if s.Over || s.Result != "" || s.Line != nil || s.LastMove != nil {
		t.Fatalf("nouvelle manche non vierge: %+v", s)
	}
	if s.Round != 2 {
		t.Fatalf("round = %d, attendu 2", s.Round)
	}
	if s.Starter != 2 || s.Current != 2 {
		t.Fatalf("starter/current = %d/%d, attendu 2/2", s.Starter, s.Current)
	}
	if s.Wins != [2]int{1, 0} {
		t.Fatalf("wins = %v, le score de manches doit être conservé", s.Wins)
	}
	if s.Rematch != [2]bool{false, false} {
		t.Fatalf("rematch = %v, attendu remis à zéro", s.Rematch)
	}
	if s.Board != c4CreateBoard() {
		t.Fatal("plateau non remis à zéro")
	}
}

// c4MaxFillNodes borne la recherche de c4FillNoWin : sans elle, une
// régression de c4FindWin transformerait ce test en attente jusqu'au
// timeout de 10 minutes du paquet, au lieu d'un échec lisible.
const c4MaxFillNodes = 100000

// c4FillNoWin construit un plateau plein sans aucun alignement, par recherche
// avec retour arrière. Les plateaux nuls existent en 6×7, la recherche aboutit
// donc toujours, et elle est déterministe : le même plateau à chaque exécution.
// Le remplissage se fait par lignes du bas vers le haut pour respecter la
// gravité, et chaque pose est validée par c4FindWin — un nouvel alignement
// passe forcément par la case posée.
func c4FillNoWin(t *testing.T) C4Board {
	t.Helper()
	var b C4Board
	cells := make([]Cell, 0, c4Rows*c4Cols)
	for row := c4Rows - 1; row >= 0; row-- {
		for col := 0; col < c4Cols; col++ {
			cells = append(cells, Cell{Row: row, Col: col})
		}
	}

	nodes := 0
	var fill func(i int) bool
	fill = func(i int) bool {
		nodes++
		if nodes > c4MaxFillNodes {
			t.Fatalf("c4FillNoWin: recherche non convergente après %d nœuds, arrêtée à la case %d/%d", nodes, i, len(cells))
		}
		if i == len(cells) {
			return true
		}
		c := cells[i]
		for _, color := range [2]int{1, 2} {
			b[c.Row][c.Col] = color
			if c4FindWin(&b, c.Row, c.Col) == nil && fill(i+1) {
				return true
			}
			b[c.Row][c.Col] = 0
		}
		return false
	}
	if !fill(0) {
		t.Fatal("aucun plateau nul trouvé")
	}
	return b
}

func TestC4OnlineDrawEndsRound(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	// Plateau nul complet, dont on retire la dernière case : le coup qui la
	// remplit doit produire un match nul, sans alignement ni point marqué.
	full := c4FillNoWin(t)
	lastColor := full[0][c4Cols-1]
	mover := p0
	if lastColor == 2 {
		mover = p1
	}

	r.mu.Lock()
	s := r.State.(*c4Room)
	s.Board = full
	s.Board[0][c4Cols-1] = 0
	s.Current = lastColor
	r.mu.Unlock()

	act(t, r, mover, map[string]any{"type": "drop", "col": c4Cols - 1})

	st := nextState(t, p0)
	nextState(t, p1)
	if !st.Over || st.Result != "draw" {
		t.Fatalf("issue = over:%v result:%q, attendu un match nul", st.Over, st.Result)
	}
	if st.Line != nil {
		t.Fatalf("ligne gagnante sur un match nul: %v", st.Line)
	}
	if st.Wins != [2]int{0, 0} {
		t.Fatalf("wins = %v, un match nul ne marque aucun point", st.Wins)
	}
	if !c4IsDraw(&st.Board) {
		t.Fatal("nul annoncé sur un plateau non plein")
	}
}

func TestC4OnlineIgnoresUnknownAction(t *testing.T) {
	p0, p1, r := joinC4(t)
	startState(t, p0)
	startState(t, p1)

	act(t, r, p0, map[string]any{"type": "surrender"})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
}
