package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"
)

// resetHub remet les maps globales à zéro entre deux tests.
func resetHub() {
	globalMu.Lock()
	defer globalMu.Unlock()
	waitingRooms = make(map[string]*Room)
	rooms = make(map[string]*Room)
	players = make(map[string]*Player)
}

// nextRaw lit le prochain event SSE du joueur et le découpe en (nom, data JSON).
func nextRaw(t *testing.T, p *Player) (string, []byte) {
	t.Helper()
	select {
	case msg := <-p.events:
		lines := strings.Split(strings.TrimRight(string(msg), "\n"), "\n")
		if len(lines) != 2 || !strings.HasPrefix(lines[0], "event: ") || !strings.HasPrefix(lines[1], "data: ") {
			t.Fatalf("format SSE inattendu: %q", msg)
		}
		return strings.TrimPrefix(lines[0], "event: "), []byte(strings.TrimPrefix(lines[1], "data: "))
	default:
		t.Fatalf("aucun event en attente pour %s", p.Name)
		return "", nil
	}
}

// expectEvent lit le prochain event et vérifie son nom.
func expectEvent(t *testing.T, p *Player, name string) []byte {
	t.Helper()
	got, raw := nextRaw(t, p)
	if got != name {
		t.Fatalf("event %q reçu, %q attendu (data=%s)", got, name, raw)
	}
	return raw
}

// expectNoEvent vérifie qu'aucun event n'est en attente.
func expectNoEvent(t *testing.T, p *Player) {
	t.Helper()
	select {
	case msg := <-p.events:
		t.Fatalf("event inattendu pour %s: %q", p.Name, msg)
	default:
	}
}

func TestSanitizeName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Ludo", "Ludo"},
		{"  Léa  ", "Léa"},
		{"", "Joueur"},
		{"   ", "Joueur"},
		{"Ludo\nvic", "Ludovic"},
		{strings.Repeat("a", 40), strings.Repeat("a", 15)},
		{strings.Repeat("é", 20), strings.Repeat("é", 15)},
	}
	for _, c := range cases {
		if got := sanitizeName(c.in); got != c.want {
			t.Errorf("sanitizeName(%q) = %q, attendu %q", c.in, got, c.want)
		}
	}
}

func TestSanitizeNameTruncatesOnRunes(t *testing.T) {
	got := sanitizeName(strings.Repeat("é", 20))
	if n := utf8.RuneCountInString(got); n != 15 {
		t.Fatalf("%d runes, attendu 15", n)
	}
	if !utf8.ValidString(got) {
		t.Fatalf("UTF-8 invalide après troncature: %q", got)
	}
}

func TestResolveKeyRejectsUnknownGame(t *testing.T) {
	if _, _, _, err := resolveKey("tic-tac-toe", ""); err == nil {
		t.Fatal("jeu inconnu accepté")
	}
}

func TestResolveKeyRejectsUnknownOperation(t *testing.T) {
	for _, op := range []string{"", "modulo", "MULTIPLICATION"} {
		if _, _, _, err := resolveKey("race", op); err == nil {
			t.Fatalf("opération %q acceptée pour race", op)
		}
	}
}

func TestResolveKeySeparatesQueues(t *testing.T) {
	add, _, _, err := resolveKey("race", "addition")
	if err != nil {
		t.Fatal(err)
	}
	mul, _, _, err := resolveKey("race", "multiplication")
	if err != nil {
		t.Fatal(err)
	}
	if add == mul {
		t.Fatalf("addition et multiplication partagent la clé %q", add)
	}
}

func TestJoinRejectsInvalidRequest(t *testing.T) {
	resetHub()
	if _, _, err := join("tic-tac-toe", "", "Ludo"); err == nil {
		t.Fatal("join sur jeu inconnu accepté")
	}
	if len(players) != 0 || len(waitingRooms) != 0 {
		t.Fatalf("un join refusé a laissé des traces: players=%d waitingRooms=%d", len(players), len(waitingRooms))
	}
}

func TestJoinFirstPlayerWaits(t *testing.T) {
	resetHub()
	p, r, err := join("race", "addition", "Ludo")
	if err != nil {
		t.Fatal(err)
	}
	if p.Index != 0 {
		t.Fatalf("Index = %d, attendu 0", p.Index)
	}
	if r.started {
		t.Fatal("room démarrée avec un seul joueur")
	}
	raw := expectEvent(t, p, "waiting")
	var msg struct{ Name string }
	json.Unmarshal(raw, &msg)
	if msg.Name != "Ludo" {
		t.Fatalf("waiting.name = %q, attendu \"Ludo\"", msg.Name)
	}
}

func TestJoinSecondPlayerStartsGame(t *testing.T) {
	resetHub()
	p0, _, _ := join("race", "addition", "Ludo")
	expectEvent(t, p0, "waiting")

	p1, r, err := join("race", "addition", "Léa")
	if err != nil {
		t.Fatal(err)
	}
	if p1.Index != 1 {
		t.Fatalf("Index = %d, attendu 1", p1.Index)
	}
	if !r.started {
		t.Fatal("room non démarrée avec deux joueurs")
	}
	if len(waitingRooms) != 0 {
		t.Fatalf("la room reste en attente après appariement: %d", len(waitingRooms))
	}
	if r.Opponent(p0) != p1 || r.Opponent(p1) != p0 {
		t.Fatal("Opponent() incohérent")
	}
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")
}

func TestJoinDoesNotMixQueues(t *testing.T) {
	resetHub()
	p0, _, _ := join("race", "addition", "Ludo")
	expectEvent(t, p0, "waiting")

	p1, r1, _ := join("race", "division", "Léa")
	expectEvent(t, p1, "waiting")
	if r1.started {
		t.Fatal("un joueur de division a été apparié à un joueur d'addition")
	}
	if len(waitingRooms) != 2 {
		t.Fatalf("%d files d'attente, attendu 2", len(waitingRooms))
	}
	expectNoEvent(t, p0)
}

// --- Course de fusées ---

// joinRace apparie deux joueurs sur une course d'additions et consomme
// l'event "waiting". Les events "start" restent à lire par l'appelant.
func joinRace(t *testing.T) (*Player, *Player, *Room) {
	t.Helper()
	resetHub()
	p0, _, err := join("race", "addition", "Ludo")
	if err != nil {
		t.Fatal(err)
	}
	expectEvent(t, p0, "waiting")
	p1, r, err := join("race", "addition", "Léa")
	if err != nil {
		t.Fatal(err)
	}
	return p0, p1, r
}

// raceAnswer lit la réponse attendue dans l'état serveur du joueur. Les tests
// ne peuvent plus la prendre dans le flux SSE — c'était précisément la fuite
// que Question.Answer `json:"-"` supprime. À relire avant chaque coup :
// raceGame.Action remplace la question au passage.
func raceAnswer(t *testing.T, p *Player) int {
	t.Helper()
	st, ok := p.State.(*raceState)
	if !ok {
		t.Fatalf("état de %s absent ou d'un autre jeu: %T", p.Name, p.State)
	}
	return st.Question.Answer
}

func TestRaceScoring(t *testing.T) {
	p0, p1, r := joinRace(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	// Quatre bonnes réponses : +1 à chaque fois, notification à l'adversaire.
	var upd struct {
		YourScore     int  `json:"yourScore"`
		OpponentScore int  `json:"opponentScore"`
		Correct       bool `json:"correct"`
	}
	for i := 1; i <= 4; i++ {
		act(t, r, p0, map[string]int{"answer": raceAnswer(t, p0)})
		json.Unmarshal(expectEvent(t, p0, "scoreUpdate"), &upd)
		if !upd.Correct || upd.YourScore != i || upd.OpponentScore != 0 {
			t.Fatalf("après %d bonne(s) réponse(s), scoreUpdate = %+v", i, upd)
		}
		var opp struct {
			OpponentScore int `json:"opponentScore"`
		}
		json.Unmarshal(expectEvent(t, p1, "opponentScore"), &opp)
		if opp.OpponentScore != i {
			t.Fatalf("opponentScore = %d, attendu %d", opp.OpponentScore, i)
		}
	}

	// Mauvaise réponse depuis un score de 4 : 4 - 3 = 1 pile, ce qui pin
	// la valeur exacte de penaltyPoints (un plancher à 0 masquerait toute
	// valeur de pénalité >= 4).
	act(t, r, p0, map[string]int{"answer": raceAnswer(t, p0) + 1})
	json.Unmarshal(expectEvent(t, p0, "scoreUpdate"), &upd)
	if upd.Correct || upd.YourScore != 1 {
		t.Fatalf("pénalité incorrecte, attendu 4-3=1: %+v", upd)
	}
	expectEvent(t, p1, "opponentScore")
}

// TestRaceScoreFloorsAtZero couvre le plancher, que TestRaceScoring laisse
// volontairement de côté : son cas 4-3=1 est choisi pour pin penaltyPoints,
// donc il ne passe jamais sous zéro.
func TestRaceScoreFloorsAtZero(t *testing.T) {
	p0, p1, r := joinRace(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	var upd struct {
		YourScore int  `json:"yourScore"`
		Correct   bool `json:"correct"`
	}
	play := func(answer int) {
		t.Helper()
		act(t, r, p0, map[string]int{"answer": answer})
		json.Unmarshal(expectEvent(t, p0, "scoreUpdate"), &upd)
		expectEvent(t, p1, "opponentScore")
	}

	// Un point d'abord : la pénalité doit alors produire 1 - 3 = -2, donc un
	// intermédiaire réellement négatif. Repartir de 0 ne distinguerait pas un
	// plancher d'un score qui n'a simplement jamais bougé.
	play(raceAnswer(t, p0))
	if !upd.Correct || upd.YourScore != 1 {
		t.Fatalf("bonne réponse initiale: scoreUpdate = %+v, attendu score 1", upd)
	}
	play(raceAnswer(t, p0) + 1)
	if upd.Correct || upd.YourScore != 0 {
		t.Fatalf("plancher manquant, 1-3 doit donner 0: scoreUpdate = %+v", upd)
	}
	// Et le score reste à 0, il ne descend pas en négatif par accumulation.
	play(raceAnswer(t, p0) + 1)
	if upd.Correct || upd.YourScore != 0 {
		t.Fatalf("mauvaise réponse depuis 0: scoreUpdate = %+v, attendu score 0", upd)
	}
}

func TestRaceWinAtTwenty(t *testing.T) {
	p0, p1, r := joinRace(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	for i := 0; i < 20; i++ {
		act(t, r, p0, map[string]int{"answer": raceAnswer(t, p0)})
		expectEvent(t, p0, "scoreUpdate")
		expectEvent(t, p1, "opponentScore")
	}

	var win struct{ Winner string }
	json.Unmarshal(expectEvent(t, p0, "win"), &win)
	if win.Winner != "Ludo" {
		t.Fatalf("winner = %q, attendu \"Ludo\"", win.Winner)
	}
	expectEvent(t, p1, "win")
	if r.started {
		t.Fatal("room encore démarrée après la victoire")
	}
}

// questionObject décode les octets réellement envoyés sur le fil et retourne
// l'objet racine et son objet "question". Passer par une map plutôt que par
// les structs Go est ce qui rend le test insensible au type de transport :
// il verrait aussi une fuite réintroduite par une struct dédiée.
func questionObject(t *testing.T, raw []byte) (map[string]any, map[string]any) {
	t.Helper()
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		t.Fatalf("JSON illisible: %v (data=%s)", err, raw)
	}
	q, ok := root["question"].(map[string]any)
	if !ok {
		t.Fatalf("clé \"question\" absente ou non-objet dans %s", raw)
	}
	return root, q
}

// assertQuestionHidesAnswer vérifie qu'un objet "question" du fil cache la
// réponse mais expose bien les opérandes.
func assertQuestionHidesAnswer(t *testing.T, event string, q map[string]any) {
	t.Helper()
	// Inspection par clé, jamais par sous-chaîne : "correctAnswer" — légitime
	// à la racine de scoreUpdate — contient "answer" en camelCase.
	if _, leaked := q["answer"]; leaked {
		t.Fatalf("%s: la réponse fuite dans question %v, un joueur lisant son flux SSE gagnerait à coup sûr", event, q)
	}
	for _, key := range []string{"a", "b"} {
		if _, ok := q[key]; !ok {
			t.Fatalf("%s: clé %q absente de question %v, le front n'affiche plus le calcul", event, key, q)
		}
	}
}

// TestRaceStartHidesAnswer échoue si Question.Answer redevient sérialisable :
// l'event "start" porte la question avant toute réponse du joueur.
func TestRaceStartHidesAnswer(t *testing.T) {
	p0, p1, _ := joinRace(t)
	_, q := questionObject(t, expectEvent(t, p0, "start"))
	assertQuestionHidesAnswer(t, "start", q)
	_, q = questionObject(t, expectEvent(t, p1, "start"))
	assertQuestionHidesAnswer(t, "start", q)
}

// TestRaceScoreUpdateHidesAnswerButRevealsCorrectAnswer couvre l'autre event
// porteur d'une question — celle du coup suivant, donc encore à trouver — et
// pin la présence de correctAnswer, qui révèle légitimement la réponse au
// coup déjà joué (le front en a besoin pour « La réponse était X »).
func TestRaceScoreUpdateHidesAnswerButRevealsCorrectAnswer(t *testing.T) {
	p0, p1, r := joinRace(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	want := raceAnswer(t, p0)
	act(t, r, p0, map[string]int{"answer": want + 1})

	root, q := questionObject(t, expectEvent(t, p0, "scoreUpdate"))
	assertQuestionHidesAnswer(t, "scoreUpdate", q)

	got, ok := root["correctAnswer"]
	if !ok {
		t.Fatalf("clé \"correctAnswer\" absente de scoreUpdate %v: le front ne peut plus afficher « La réponse était X »", root)
	}
	if n, isNum := got.(float64); !isNum || int(n) != want {
		t.Fatalf("correctAnswer = %v, attendu %d", got, want)
	}
	expectEvent(t, p1, "opponentScore")
}

// TestHandleActionHTTPRoutesThroughGame vérifie que le handler HTTP réel
// (pas seulement act(), qui reproduit son verrouillage) déclenche bien
// room.Game.Action() sous room.mu : c'est la discipline de verrouillage
// que ce refactor a pour but d'établir.
func TestHandleActionHTTPRoutesThroughGame(t *testing.T) {
	p0, p1, _ := joinRace(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	body, _ := json.Marshal(map[string]int{"answer": raceAnswer(t, p0)})
	req := httptest.NewRequest(http.MethodPost, "/api/action", strings.NewReader(string(body)))
	req.Header.Set("X-Player-ID", p0.ID)
	rec := httptest.NewRecorder()
	handleActionHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200 (body=%s)", rec.Code, rec.Body.String())
	}

	var upd struct {
		YourScore int  `json:"yourScore"`
		Correct   bool `json:"correct"`
	}
	json.Unmarshal(expectEvent(t, p0, "scoreUpdate"), &upd)
	if !upd.Correct || upd.YourScore != 1 {
		t.Fatalf("scoreUpdate via handleActionHTTP = %+v", upd)
	}
	expectEvent(t, p1, "opponentScore")
}

// TestHandleJoinHTTPRejectsInvalidRequests vérifie que le refus d'un jeu
// inconnu ou d'une opération manquante/invalide (le comportement 400 que
// ce refactor introduit délibérément) passe bien par le handler HTTP réel,
// pas seulement par resolveKey().
func TestHandleJoinHTTPRejectsInvalidRequests(t *testing.T) {
	resetHub()
	cases := []string{
		`{"game":"tic-tac-toe","name":"X"}`, // jeu inconnu
		`{"game":"race","name":"X"}`,        // opération manquante
	}
	for _, body := range cases {
		req := httptest.NewRequest(http.MethodPost, "/api/join", strings.NewReader(body))
		rec := httptest.NewRecorder()
		handleJoinHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("body=%s: status = %d, attendu 400", body, rec.Code)
		}
	}
}

func TestDisconnectNotifiesOpponent(t *testing.T) {
	resetHub()
	p0, _, _ := join("race", "addition", "Ludo")
	expectEvent(t, p0, "waiting")
	p1, _, _ := join("race", "addition", "Léa")
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	handleDisconnect(p1.ID)
	expectEvent(t, p0, "opponentLeft")
	if _, ok := players[p1.ID]; ok {
		t.Fatal("le joueur déconnecté reste enregistré")
	}
	if _, ok := rooms[p0.ID]; ok {
		t.Fatal("le survivant reste rattaché à la room")
	}
}

func TestDisconnectRemovesWaitingRoom(t *testing.T) {
	resetHub()
	p, _, _ := join("race", "addition", "Ludo")
	expectEvent(t, p, "waiting")
	handleDisconnect(p.ID)
	if len(waitingRooms) != 0 {
		t.Fatalf("%d room(s) en attente après déconnexion, attendu 0", len(waitingRooms))
	}
}

// act appelle le jeu comme le ferait handleActionHTTP, sous room.mu.
func act(t *testing.T, r *Room, p *Player, payload any) {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.started {
		t.Fatal("act() sur une room non démarrée")
	}
	r.Game.Action(r, p, raw)
}
