package main

import (
	crand "crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

//go:embed static/*
var staticFiles embed.FS

// --- Types ---

type Question struct {
	A      int `json:"a"`
	B      int `json:"b"`
	Answer int `json:"answer"`
}

type Player struct {
	ID           string
	Name         string
	Score        int
	events       chan []byte
	done         chan struct{}
	sseConnected bool
	question     Question
}

type Room struct {
	ID        string
	Operation string
	Players   [2]*Player
	mu        sync.Mutex
	started   bool
}

type JoinData struct {
	Name      string `json:"name"`
	Operation string `json:"operation"`
}

type AnswerData struct {
	Answer int `json:"answer"`
}

// Outgoing messages (type is conveyed via SSE event name, not in JSON)

type WaitingMsg struct {
	Name string `json:"name"`
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

// --- Globals ---

var (
	waitingRooms = make(map[string]*Room) // operation -> waiting room
	rooms        = make(map[string]*Room)
	players      = make(map[string]*Player)
	globalMu     sync.Mutex
)

const winScore = 20
const penaltyPoints = 3

// --- Player ID ---

func generatePlayerID() string {
	b := make([]byte, 8)
	crand.Read(b)
	return hex.EncodeToString(b)
}

// --- Question generation ---

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

// --- SSE helpers ---

func sendEvent(p *Player, eventType string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		log.Println("marshal error:", err)
		return
	}
	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, payload)
	select {
	case p.events <- []byte(msg):
	case <-p.done:
	default:
		log.Printf("[SSE] dropping message for %s, channel full", p.Name)
	}
}

// --- HTTP Handlers ---

func handleJoinHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var joinData JoinData
	if err := json.NewDecoder(r.Body).Decode(&joinData); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if joinData.Name == "" {
		joinData.Name = "Joueur"
	}
	if len(joinData.Name) > 15 {
		joinData.Name = joinData.Name[:15]
	}

	playerID := generatePlayerID()
	player := &Player{
		ID:     playerID,
		Name:   joinData.Name,
		Score:  0,
		events: make(chan []byte, 16),
		done:   make(chan struct{}),
	}

	operation := joinData.Operation
	if operation != "addition" && operation != "subtraction" && operation != "division" {
		operation = "multiplication"
	}

	globalMu.Lock()
	players[playerID] = player

	if waitingRooms[operation] == nil {
		waitingRooms[operation] = &Room{
			ID:        fmt.Sprintf("room-%d", rand.Intn(100000)),
			Operation: operation,
		}
		waitingRooms[operation].Players[0] = player
		rooms[playerID] = waitingRooms[operation]
		globalMu.Unlock()

		sendEvent(player, "waiting", WaitingMsg{Name: player.Name})
		log.Printf("[JOIN] %s creates room (%s)", player.Name, operation)
	} else {
		room := waitingRooms[operation]
		room.Players[1] = player
		rooms[playerID] = room
		delete(waitingRooms, operation)

		firstQuestion := generateQuestion(room.Operation)
		room.started = true

		p0 := room.Players[0]
		p1 := room.Players[1]
		p0.question = firstQuestion
		p1.question = firstQuestion
		globalMu.Unlock()

		sendEvent(p0, "start", StartMsg{
			You: p0.Name, Opponent: p1.Name, Question: firstQuestion,
		})
		sendEvent(p1, "start", StartMsg{
			You: p1.Name, Opponent: p0.Name, Question: firstQuestion,
		})
		log.Printf("[JOIN] %s joins %s's room", p1.Name, p0.Name)
	}

	// Timeout: cleanup ghost player if SSE never connects
	go func() {
		time.Sleep(30 * time.Second)
		globalMu.Lock()
		p, ok := players[playerID]
		if ok && !p.sseConnected {
			globalMu.Unlock()
			handleDisconnect(playerID)
			return
		}
		globalMu.Unlock()
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"playerId": playerID})
}

func handleAnswerHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	playerID := r.Header.Get("X-Player-ID")
	if playerID == "" {
		http.Error(w, "missing player id", http.StatusBadRequest)
		return
	}

	var answerData AnswerData
	if err := json.NewDecoder(r.Body).Decode(&answerData); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	globalMu.Lock()
	room, ok := rooms[playerID]
	player := players[playerID]
	globalMu.Unlock()

	if !ok || player == nil || room == nil || !room.started {
		http.Error(w, "not in game", http.StatusBadRequest)
		return
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	correct := answerData.Answer == player.question.Answer
	correctAnswer := player.question.Answer

	if correct {
		player.Score++
	} else {
		player.Score -= penaltyPoints
		if player.Score < 0 {
			player.Score = 0
		}
	}

	var opponent *Player
	if room.Players[0].ID == playerID {
		opponent = room.Players[1]
	} else {
		opponent = room.Players[0]
	}

	newQuestion := generateQuestion(room.Operation)
	player.question = newQuestion

	sendEvent(player, "scoreUpdate", ScoreUpdateMsg{
		YourScore:     player.Score,
		OpponentScore: opponent.Score,
		Correct:       correct,
		CorrectAnswer: correctAnswer,
		Question:      newQuestion,
	})

	sendEvent(opponent, "opponentScore", OpponentScoreMsg{
		OpponentScore: player.Score,
	})

	if player.Score >= winScore {
		room.started = false
		sendEvent(player, "win", WinMsg{Winner: player.Name})
		sendEvent(opponent, "win", WinMsg{Winner: player.Name})
	}

	w.Header().Set("Content-Type", "application/json")
	io.WriteString(w, `{"ok":true}`)
}

func handleEventsSSE(w http.ResponseWriter, r *http.Request) {
	playerID := r.URL.Query().Get("playerId")
	if playerID == "" {
		http.Error(w, "missing playerId", http.StatusBadRequest)
		return
	}

	globalMu.Lock()
	player, ok := players[playerID]
	if ok {
		player.sseConnected = true
	}
	globalMu.Unlock()

	if !ok || player == nil {
		http.Error(w, "unknown player", http.StatusNotFound)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	ctx := r.Context()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			handleDisconnect(playerID)
			return
		case msg, ok := <-player.events:
			if !ok {
				return
			}
			w.Write(msg)
			flusher.Flush()
		case <-ticker.C:
			w.Write([]byte(": keepalive\n\n"))
			flusher.Flush()
		}
	}
}

func handleDisconnect(playerID string) {
	globalMu.Lock()
	defer globalMu.Unlock()

	player := players[playerID]
	name := "unknown"
	if player != nil {
		name = player.Name
		select {
		case <-player.done:
		default:
			close(player.done)
		}
	}
	log.Printf("[DISCONNECT] %s disconnected", name)

	room, ok := rooms[playerID]
	delete(rooms, playerID)
	delete(players, playerID)

	if !ok || room == nil {
		return
	}

	if waitingRooms[room.Operation] == room {
		delete(waitingRooms, room.Operation)
		return
	}

	for _, p := range room.Players {
		if p != nil && p.ID != playerID {
			sendEvent(p, "opponentLeft", struct{}{})
			delete(rooms, p.ID)
		}
	}
}

func main() {
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/api/join", handleJoinHTTP)
	http.HandleFunc("/api/answer", handleAnswerHTTP)
	http.HandleFunc("/api/events", handleEventsSSE)
	http.Handle("/", http.FileServer(http.FS(staticFS)))

	port := "8080"
	fmt.Printf("🧮 Chronomaths démarre sur http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
