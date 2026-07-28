package main

import (
	crand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"
)

// ============================================================
// SESSION GÉNÉRIQUE À 2 JOUEURS
// Matchmaking, flux SSE, déconnexion. Les règles vivent dans les
// implémentations de Game (race.go, connect4.go).
// ============================================================

// Game encapsule les règles d'un jeu à 2 joueurs. Les implémentations sont
// sans état : tout l'état vit dans Room.State et Player.State.
type Game interface {
	// Start initialise l'état de la room et envoie l'event "start" aux 2 joueurs.
	Start(r *Room)
	// Action traite un coup. Toujours appelée sous r.mu, jamais sous globalMu.
	Action(r *Room, p *Player, raw json.RawMessage)
}

// VariantGame est implémentée par les jeux qui ont plusieurs files d'attente
// (la course de fusées en a une par opération). Variant valide la variante
// demandée et retourne le suffixe de clé de file.
type VariantGame interface {
	Variant(v string) (string, error)
}

type Player struct {
	ID           string
	Name         string
	Index        int // 0 ou 1 dans la room
	events       chan []byte
	done         chan struct{}
	sseConnected bool
	State        any // état par joueur, spécifique au jeu
}

type Room struct {
	ID      string
	Key     string // clé de file d'attente
	Variant string // variante du jeu (opération pour la course)
	Game    Game
	Players [2]*Player
	mu      sync.Mutex
	started bool
	State   any // état par room, spécifique au jeu
}

// Opponent retourne l'autre joueur de la room (nil si elle n'est pas pleine).
func (r *Room) Opponent(p *Player) *Player {
	return r.Players[1-p.Index]
}

// gameKinds est rempli par les init() de chaque jeu.
var gameKinds = make(map[string]Game)

var (
	waitingRooms = make(map[string]*Room) // clé de file -> room en attente
	rooms        = make(map[string]*Room) // playerID -> room
	players      = make(map[string]*Player)
	globalMu     sync.Mutex
)

type JoinData struct {
	Game      string `json:"game"`
	Name      string `json:"name"`
	Operation string `json:"operation"`
}

type WaitingMsg struct {
	Name string `json:"name"`
}

const maxNameRunes = 15

func generatePlayerID() string {
	b := make([]byte, 8)
	crand.Read(b)
	return hex.EncodeToString(b)
}

// sanitizeName nettoie un prénom saisi : espaces de bord, caractères de
// contrôle, et troncature sur les runes (pas les octets, sinon un prénom
// accentué peut produire de l'UTF-8 invalide).
func sanitizeName(name string) string {
	cleaned := make([]rune, 0, maxNameRunes)
	for _, r := range strings.TrimSpace(name) {
		if unicode.IsControl(r) {
			continue
		}
		cleaned = append(cleaned, r)
		if len(cleaned) == maxNameRunes {
			break
		}
	}
	if len(cleaned) == 0 {
		return "Joueur"
	}
	return string(cleaned)
}

// resolveKey valide la demande et retourne la clé de file, la variante retenue
// et le jeu. Un jeu ou une variante inconnus sont refusés : sans ce contrôle,
// une demande mal formée serait appariée dans la file d'un autre jeu.
func resolveKey(game, variant string) (string, string, Game, error) {
	g, ok := gameKinds[game]
	if !ok {
		return "", "", nil, fmt.Errorf("unknown game %q", game)
	}
	if vg, ok := g.(VariantGame); ok {
		suffix, err := vg.Variant(variant)
		if err != nil {
			return "", "", nil, err
		}
		return game + ":" + suffix, suffix, g, nil
	}
	return game, "", g, nil
}

var errRoomFull = errors.New("room full")

// join crée un joueur et l'apparie. Le premier arrivé attend, le second
// démarre la partie. globalMu est relâché avant tout appel au jeu.
func join(gameName, variant, name string) (*Player, *Room, error) {
	key, resolved, g, err := resolveKey(gameName, variant)
	if err != nil {
		return nil, nil, err
	}

	p := &Player{
		ID:     generatePlayerID(),
		Name:   sanitizeName(name),
		events: make(chan []byte, 16),
		done:   make(chan struct{}),
	}

	globalMu.Lock()
	room := waitingRooms[key]
	if room == nil {
		room = &Room{
			ID:      fmt.Sprintf("room-%d", rand.Intn(100000)),
			Key:     key,
			Variant: resolved,
			Game:    g,
		}
		room.Players[0] = p
		p.Index = 0
		waitingRooms[key] = room
		players[p.ID] = p
		rooms[p.ID] = room
		globalMu.Unlock()

		sendEvent(p, "waiting", WaitingMsg{Name: p.Name})
		log.Printf("[JOIN] %s crée une room (%s)", p.Name, key)
		return p, room, nil
	}

	if room.Players[1] != nil {
		globalMu.Unlock()
		return nil, nil, errRoomFull
	}
	room.Players[1] = p
	p.Index = 1
	players[p.ID] = p
	rooms[p.ID] = room
	delete(waitingRooms, key)
	globalMu.Unlock()

	log.Printf("[JOIN] %s rejoint la room de %s (%s)", p.Name, room.Players[0].Name, key)

	func() {
		room.mu.Lock()
		defer room.mu.Unlock()
		room.started = true
		room.Game.Start(room)
	}()

	return p, room, nil
}

// ============================================================
// ENVOI D'EVENTS SSE
// ============================================================

func sendEvent(p *Player, event string, data any) {
	payload, err := json.Marshal(data)
	if err != nil {
		log.Println("marshal error:", err)
		return
	}
	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", event, payload)
	select {
	case p.events <- []byte(msg):
	case <-p.done:
	default:
		log.Printf("[SSE] message abandonné pour %s, canal plein", p.Name)
	}
}

// broadcast envoie le même event aux deux joueurs de la room.
func broadcast(r *Room, event string, data any) {
	for _, p := range r.Players {
		if p != nil {
			sendEvent(p, event, data)
		}
	}
}

// ============================================================
// HANDLERS HTTP
// ============================================================

func handleJoinHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var d JoinData
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&d); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	p, _, err := join(d.Game, d.Operation, d.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	go watchGhost(p.ID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"playerId": p.ID})
}

// watchGhost supprime un joueur qui n'ouvre jamais son flux SSE.
func watchGhost(playerID string) {
	time.Sleep(30 * time.Second)
	globalMu.Lock()
	p, ok := players[playerID]
	connected := ok && p.sseConnected
	globalMu.Unlock()
	if ok && !connected {
		handleDisconnect(playerID)
	}
}

func handleActionHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	playerID := r.Header.Get("X-Player-ID")
	if playerID == "" {
		http.Error(w, "missing player id", http.StatusBadRequest)
		return
	}

	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4096))
	if err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	globalMu.Lock()
	room, ok := rooms[playerID]
	player := players[playerID]
	globalMu.Unlock()

	if !ok || player == nil || room == nil {
		http.Error(w, "not in game", http.StatusBadRequest)
		return
	}

	started := func() bool {
		room.mu.Lock()
		defer room.mu.Unlock()
		if !room.started {
			return false
		}
		room.Game.Action(room, player, raw)
		return true
	}()

	if !started {
		http.Error(w, "not in game", http.StatusBadRequest)
		return
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
	log.Printf("[DISCONNECT] %s s'est déconnecté", name)

	room, ok := rooms[playerID]
	delete(rooms, playerID)
	delete(players, playerID)

	if !ok || room == nil {
		return
	}

	if waitingRooms[room.Key] == room {
		delete(waitingRooms, room.Key)
		return
	}

	for _, p := range room.Players {
		if p != nil && p.ID != playerID {
			sendEvent(p, "opponentLeft", struct{}{})
			delete(rooms, p.ID)
		}
	}
}
