package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
)

// ============================================================
// COURSE DE FUSÉES — jeu de calcul mental à 2 joueurs
// ============================================================

func init() {
	gameKinds["race"] = raceGame{}
}

const winScore = 20
const penaltyPoints = 3

var validOperations = map[string]bool{
	"multiplication": true,
	"addition":       true,
	"subtraction":    true,
	"division":       true,
}

type raceGame struct{}

// Variant : une file d'attente par opération.
func (raceGame) Variant(op string) (string, error) {
	if !validOperations[op] {
		return "", fmt.Errorf("unknown operation %q", op)
	}
	return op, nil
}

// raceState est l'état par joueur.
type raceState struct {
	Score    int
	Question Question
}

type Question struct {
	A      int `json:"a"`
	B      int `json:"b"`
	Answer int `json:"answer"`
}

type StartMsg struct {
	You      string   `json:"you"`
	Opponent string   `json:"opponent"`
	Question Question `json:"question"`
}

type ScoreUpdateMsg struct {
	YourScore     int      `json:"yourScore"`
	OpponentScore int      `json:"opponentScore"`
	Correct       bool     `json:"correct"`
	CorrectAnswer int      `json:"correctAnswer"`
	Question      Question `json:"question"`
}

type OpponentScoreMsg struct {
	OpponentScore int `json:"opponentScore"`
}

type WinMsg struct {
	Winner string `json:"winner"`
}

func (raceGame) Start(r *Room) {
	q := generateQuestion(r.Variant)
	for _, p := range r.Players {
		p.State = &raceState{Question: q}
	}
	for _, p := range r.Players {
		sendEvent(p, "start", StartMsg{
			You:      p.Name,
			Opponent: r.Opponent(p).Name,
			Question: q,
		})
	}
}

func (raceGame) Action(r *Room, p *Player, raw json.RawMessage) {
	var d struct {
		Answer int `json:"answer"`
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		log.Printf("[RACE] action illisible de %s: %v", p.Name, err)
		return
	}

	me := p.State.(*raceState)
	opponent := r.Opponent(p)
	them := opponent.State.(*raceState)

	correct := d.Answer == me.Question.Answer
	correctAnswer := me.Question.Answer

	if correct {
		me.Score++
	} else {
		me.Score -= penaltyPoints
		if me.Score < 0 {
			me.Score = 0
		}
	}

	next := generateQuestion(r.Variant)
	me.Question = next

	sendEvent(p, "scoreUpdate", ScoreUpdateMsg{
		YourScore:     me.Score,
		OpponentScore: them.Score,
		Correct:       correct,
		CorrectAnswer: correctAnswer,
		Question:      next,
	})
	sendEvent(opponent, "opponentScore", OpponentScoreMsg{OpponentScore: me.Score})

	if me.Score >= winScore {
		r.started = false
		broadcast(r, "win", WinMsg{Winner: p.Name})
	}
}

// ============================================================
// GÉNÉRATION DES QUESTIONS
// ============================================================

func generateQuestion(operation string) Question {
	switch operation {
	case "addition":
		return generateAdditionQuestion()
	case "subtraction":
		return generateSubtractionQuestion()
	case "division":
		return generateDivisionQuestion()
	default:
		return generateMultiplicationQuestion()
	}
}

func generateMultiplicationQuestion() Question {
	tables := []int{2, 3, 4, 5, 6, 7, 8, 9, 10}
	a := tables[rand.Intn(len(tables))]
	b := tables[rand.Intn(len(tables))]
	return Question{A: a, B: b, Answer: a * b}
}

func generateAdditionQuestion() Question {
	r := rand.Intn(100)
	var a, b int
	switch {
	case r < 20:
		a = rand.Intn(19) + 2
		b = rand.Intn(19) + 2
	case r < 70:
		a = rand.Intn(90) + 10
		b = rand.Intn(49) + 2
	default:
		a = rand.Intn(50) + 50
		b = rand.Intn(50) + 50
	}
	return Question{A: a, B: b, Answer: a + b}
}

func generateSubtractionQuestion() Question {
	r := rand.Intn(100)
	var a, b int
	switch {
	case r < 20:
		b = rand.Intn(9) + 2
		result := rand.Intn(10) + 1
		a = result + b
	case r < 70:
		a = rand.Intn(80) + 20
		maxB := a - 1
		if maxB > 50 {
			maxB = 50
		}
		b = rand.Intn(maxB-1) + 2
	default:
		a = rand.Intn(50) + 50
		b = rand.Intn(a-20) + 20
	}
	return Question{A: a, B: b, Answer: a - b}
}

func generateDivisionQuestion() Question {
	tables := []int{2, 3, 4, 5, 6, 7, 8, 9, 10}
	divisor := tables[rand.Intn(len(tables))]
	quotient := tables[rand.Intn(len(tables))]
	return Question{A: divisor * quotient, B: divisor, Answer: quotient}
}
