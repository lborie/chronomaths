package main

import (
	"encoding/json"
	"log"
)

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

// ============================================================
// PUISSANCE 4 EN LIGNE — jeu de session
// Le plateau est autoritaire côté serveur. Chaque event porte un
// snapshot complet : un delta perdu (sendEvent abandonne quand le
// canal du joueur est plein) désynchroniserait le plateau
// définitivement, alors qu'un état absolu est auto-réparant.
// ============================================================

func init() {
	gameKinds["connect4"] = connect4Game{}
}

type connect4Game struct{}

type c4Move struct {
	Row    int `json:"row"`
	Col    int `json:"col"`
	Player int `json:"player"`
}

// c4Room est l'état d'une rencontre. Invariant : Over ⇔ Result != "".
type c4Room struct {
	Board    C4Board
	Current  int // couleur qui doit jouer
	Starter  int // couleur ayant commencé la manche
	Over     bool
	Result   string // "" | "win" | "draw"
	Winner   int    // 0 | 1 | 2
	Line     []Cell // cellules gagnantes, nil sinon
	LastMove *c4Move
	Wins     [2]int  // indexé par Player.Index (0 = rouge)
	Rematch  [2]bool // indexé par Player.Index
	Round    int
}

// c4StateMsg est le snapshot envoyé au client.
type c4StateMsg struct {
	Board    C4Board `json:"board"`
	Current  int     `json:"current"`
	Starter  int     `json:"starter"`
	Over     bool    `json:"over"`
	Result   string  `json:"result"`
	Winner   int     `json:"winner"`
	Line     []Cell  `json:"line"`
	LastMove *c4Move `json:"lastMove"`
	Wins     [2]int  `json:"wins"`
	Rematch  [2]bool `json:"rematch"`
	Round    int     `json:"round"`
}

type C4StartMsg struct {
	You      string     `json:"you"`
	Opponent string     `json:"opponent"`
	Color    int        `json:"color"`
	State    c4StateMsg `json:"state"`
}

type C4StateEvent struct {
	State c4StateMsg `json:"state"`
}

// snapshot() copie c4Room champ à champ : toute nouvelle propriété de
// c4Room doit être reportée ici aussi, sinon elle n'atteint jamais le client.
func (s *c4Room) snapshot() c4StateMsg {
	return c4StateMsg{
		Board:    s.Board,
		Current:  s.Current,
		Starter:  s.Starter,
		Over:     s.Over,
		Result:   s.Result,
		Winner:   s.Winner,
		Line:     s.Line,
		LastMove: s.LastMove,
		Wins:     s.Wins,
		Rematch:  s.Rematch,
		Round:    s.Round,
	}
}

// startRound remet le plateau à zéro. starter est la couleur qui commence.
// Wins survit à l'appel ; Round est incrémenté.
func (s *c4Room) startRound(starter int) {
	s.Board = c4CreateBoard()
	s.Starter = starter
	s.Current = starter
	s.Over = false
	s.Result = ""
	s.Winner = 0
	s.Line = nil
	s.LastMove = nil
	s.Rematch = [2]bool{}
	s.Round++
}

func (connect4Game) Start(r *Room) {
	s := &c4Room{}
	s.startRound(1) // Players[0] est rouge et commence la manche 1
	r.State = s

	for _, p := range r.Players {
		sendEvent(p, "start", C4StartMsg{
			You:      p.Name,
			Opponent: r.Opponent(p).Name,
			Color:    p.Index + 1,
			State:    s.snapshot(),
		})
	}
}

func (connect4Game) Action(r *Room, p *Player, raw json.RawMessage) {
	var d struct {
		Type string `json:"type"`
		Col  int    `json:"col"`
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		log.Printf("[C4] action illisible de %s: %v", p.Name, err)
		return
	}

	s, ok := r.State.(*c4Room)
	if !ok {
		return
	}

	switch d.Type {
	case "drop":
		c4Play(r, s, p, d.Col)
	case "rematch":
		c4AskRematch(r, s, p)
	}
}

// c4Play applique un coup s'il est légal. Un coup illégal est ignoré sans
// event : le client rend depuis l'état serveur, il est déjà à jour.
func c4Play(r *Room, s *c4Room, p *Player, col int) {
	color := p.Index + 1
	if s.Over || s.Current != color {
		return
	}

	row := c4Drop(&s.Board, col, color)
	if row == -1 {
		return // hors bornes ou colonne pleine
	}
	s.LastMove = &c4Move{Row: row, Col: col, Player: color}

	if line := c4FindWin(&s.Board, row, col); line != nil {
		s.Over = true
		s.Result = "win"
		s.Winner = color
		s.Line = line
		s.Wins[p.Index]++
	} else if c4IsDraw(&s.Board) {
		s.Over = true
		s.Result = "draw"
	} else {
		s.Current = 3 - color
	}

	broadcast(r, "c4State", C4StateEvent{State: s.snapshot()})
}

// c4AskRematch enregistre l'accord d'un joueur. La manche ne repart que
// lorsque les deux ont accepté ; le joueur qui commence alterne.
func c4AskRematch(r *Room, s *c4Room, p *Player) {
	if !s.Over {
		return
	}
	s.Rematch[p.Index] = true
	if s.Rematch[0] && s.Rematch[1] {
		s.startRound(3 - s.Starter)
	}
	broadcast(r, "c4State", C4StateEvent{State: s.snapshot()})
}
