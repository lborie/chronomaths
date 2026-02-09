package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math/rand"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
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
	Name  string `json:"name"`
	Score int    `json:"score"`
	conn  *websocket.Conn
	writeMu sync.Mutex
}

type Room struct {
	ID       string
	Players  [2]*Player
	mu       sync.Mutex
	started  bool
	question Question
}

type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type JoinData struct {
	Name string `json:"name"`
}

type AnswerData struct {
	Answer int `json:"answer"`
}

// Outgoing messages

type WaitingMsg struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type StartMsg struct {
	Type     string   `json:"type"`
	You      string   `json:"you"`
	Opponent string   `json:"opponent"`
	Question Question `json:"question"`
}

type ScoreUpdateMsg struct {
	Type          string `json:"type"`
	YourScore     int    `json:"yourScore"`
	OpponentScore int    `json:"opponentScore"`
	Correct       bool   `json:"correct"`
	CorrectAnswer int    `json:"correctAnswer"`
	Question      Question `json:"question"`
}

type OpponentScoreMsg struct {
	Type          string `json:"type"`
	OpponentScore int    `json:"opponentScore"`
}

type WinMsg struct {
	Type   string `json:"type"`
	Winner string `json:"winner"`
}

type OpponentLeftMsg struct {
	Type string `json:"type"`
}

// --- Globals ---

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	waitingRoom *Room
	rooms       = make(map[*websocket.Conn]*Room)
	players     = make(map[*websocket.Conn]*Player)
	globalMu    sync.Mutex
)

const winScore = 20
const penaltyPoints = 3

func generateQuestion() Question {
	tables := []int{2, 3, 4, 5, 6, 7, 8, 9, 10}
	a := tables[rand.Intn(len(tables))]
	b := tables[rand.Intn(len(tables))]
	return Question{A: a, B: b, Answer: a * b}
}

func sendJSON(p *Player, v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		log.Println("marshal error:", err)
		return
	}
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if err := p.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Println("write error:", err)
	}
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	log.Printf("[WS] upgrade request from %s (User-Agent: %s)", r.RemoteAddr, r.UserAgent())
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] upgrade FAILED from %s: %v", r.RemoteAddr, err)
		return
	}
	log.Printf("[WS] upgrade OK from %s", r.RemoteAddr)
	defer func() {
		handleDisconnect(conn)
		conn.Close()
	}()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "join":
			handleJoin(conn, msg.Data)
		case "answer":
			handleAnswer(conn, msg.Data)
		}
	}
}

func handleJoin(conn *websocket.Conn, data json.RawMessage) {
	var joinData JoinData
	if err := json.Unmarshal(data, &joinData); err != nil {
		return
	}
	if joinData.Name == "" {
		joinData.Name = "Joueur"
	}

	player := &Player{
		Name: joinData.Name,
		Score: 0,
		conn: conn,
	}

	globalMu.Lock()
	defer globalMu.Unlock()

	players[conn] = player

	if waitingRoom == nil {
		// Create a new room, this player waits
		waitingRoom = &Room{
			ID: fmt.Sprintf("room-%d", rand.Intn(100000)),
		}
		waitingRoom.Players[0] = player
		rooms[conn] = waitingRoom

		log.Printf("[JOIN] %s creates room, sending waiting", player.Name)
		sendJSON(player, WaitingMsg{Type: "waiting", Name: player.Name})
	} else {
		// Second player joins, start the game
		room := waitingRoom
		room.Players[1] = player
		rooms[conn] = room
		waitingRoom = nil

		// Generate first question
		room.question = generateQuestion()
		room.started = true

		// Notify both players
		p0 := room.Players[0]
		p1 := room.Players[1]

		startMsg0 := StartMsg{
			Type:     "start",
			You:      p0.Name,
			Opponent: p1.Name,
			Question: room.question,
		}
		startMsg1 := StartMsg{
			Type:     "start",
			You:      p1.Name,
			Opponent: p0.Name,
			Question: room.question,
		}

		log.Printf("[JOIN] %s joins %s's room, sending start to both", p1.Name, p0.Name)
		sendJSON(p0, startMsg0)
		sendJSON(p1, startMsg1)
		log.Printf("[JOIN] start messages sent to both players")
	}
}

func handleAnswer(conn *websocket.Conn, data json.RawMessage) {
	var answerData AnswerData
	if err := json.Unmarshal(data, &answerData); err != nil {
		return
	}

	globalMu.Lock()
	room, ok := rooms[conn]
	player := players[conn]
	globalMu.Unlock()

	if !ok || player == nil || room == nil || !room.started {
		return
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	correct := answerData.Answer == room.question.Answer
	correctAnswer := room.question.Answer

	if correct {
		player.Score++
	} else {
		player.Score -= penaltyPoints
		if player.Score < 0 {
			player.Score = 0
		}
	}

	// Find opponent
	var opponent *Player
	if room.Players[0].conn == conn {
		opponent = room.Players[1]
	} else {
		opponent = room.Players[0]
	}

	// Generate new question for this player
	newQuestion := generateQuestion()
	room.question = newQuestion

	// Send score update to the answering player
	sendJSON(player, ScoreUpdateMsg{
		Type:          "scoreUpdate",
		YourScore:     player.Score,
		OpponentScore: opponent.Score,
		Correct:       correct,
		CorrectAnswer: correctAnswer,
		Question:      newQuestion,
	})

	// Send opponent score update to the other player
	sendJSON(opponent, OpponentScoreMsg{
		Type:          "opponentScore",
		OpponentScore: player.Score,
	})

	// Check win
	if player.Score >= winScore {
		room.started = false
		sendJSON(player, WinMsg{Type: "win", Winner: player.Name})
		sendJSON(opponent, WinMsg{Type: "win", Winner: player.Name})
	}
}

func handleDisconnect(conn *websocket.Conn) {
	globalMu.Lock()
	defer globalMu.Unlock()

	player := players[conn]
	name := "unknown"
	if player != nil {
		name = player.Name
	}
	log.Printf("[DISCONNECT] %s disconnected", name)

	room, ok := rooms[conn]
	delete(rooms, conn)
	delete(players, conn)

	if !ok || room == nil {
		return
	}

	// If this was the waiting room, clear it
	if waitingRoom == room {
		waitingRoom = nil
		return
	}

	// Notify the other player
	for _, p := range room.Players {
		if p != nil && p.conn != conn {
			sendJSON(p, OpponentLeftMsg{Type: "opponentLeft"})
			delete(rooms, p.conn)
		}
	}
}

func main() {
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}

	http.Handle("/", http.FileServer(http.FS(staticFS)))
	http.HandleFunc("/ws", handleWS)

	port := "8080"
	fmt.Printf("🧮 Chronomaths démarre sur http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
