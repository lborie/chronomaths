# Puissance 4 en ligne + factorisation du mécanisme de session — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un mode « Puissance 4 en ligne » (2 joueurs, chacun son écran) en extrayant du jeu de course de fusées un mécanisme de session générique réutilisable par les deux jeux.

**Architecture :** Côté Go, une couche session générique (`session.go` : matchmaking, SSE, déconnexion) délègue les règles à une interface `Game` implémentée par `race.go` et `connect4.go` ; le plateau est autoritaire côté serveur et diffusé en snapshots complets. Côté front, un helper de session dans `app.js` (`sessionJoin` / `sessionSend` / `sessionClose`) sert les deux jeux, les écrans « rejoindre » et « attente » sont mutualisés, et le plateau du Puissance 4 passe à un rendu par snapshot partagé entre les modes local et en ligne.

**Tech Stack :** Go 1.25 (stdlib seule, `embed`, `net/http`, `testing`), HTML5 / CSS3 / Vanilla JS (aucun framework, aucun module ES), SSE + POST JSON.

**Spec :** `docs/superpowers/specs/2026-07-27-puissance4-en-ligne-design.md`

## Global Constraints

- **Zéro dépendance externe**, côté Go comme côté front. `go.mod` ne doit gagner aucun `require`.
- **Aucun module ES** : `app.js` puis `games.js` sont des scripts classiques ; `games.js` résout `screens`, `showScreen`, `screenCleanups`, `sessionJoin`, `sessionSend`, `sessionClose`, `showJoinScreen`, `showWaitingScreen`, `setWaitingStatus`, `getActiveScreen` par portée lexicale globale. **L'ordre des balises `<script>` dans `index.html` ne change pas.**
- **Aucun nouveau fichier statique** : la liste de precache de `sw.js` reste `['/', '/index.html', '/style.css', '/games.css', '/app.js', '/games.js', '/icon.svg', '/manifest.json']`.
- **Toute tâche qui modifie `static/` bump `CACHE_NAME` dans `static/sw.js`.** Valeur de départ : `chronomaths-v2`. Version cible imposée par tâche : T2 → `chronomaths-v3`, T3 → `chronomaths-v4`, T4 → `chronomaths-v5`, T6 → `chronomaths-v6`, T7 → `chronomaths-v7`, T8 → `chronomaths-v8` (uniquement si T8 touche `static/`).
- **Langue** : UI en français (accents obligatoires), code et identifiants en anglais, commentaires en français.
- **Vérification manuelle après toute modification de `static/`** : `//go:embed` fige les fichiers à la compilation → redémarrer `go run main.go`, puis purger le cache (DevTools → Application → Storage → *Clear site data*) car le Service Worker sert en cache-first.
- **`.operation-card` est interdite** hors des 4 cartes d'opération : elle est bindée vers `config.operation` et fait planter `updateModesScreen()`. Les boutons du hub Jeux utilisent `.multi-btn`.
- **Aucun changement fonctionnel de la course de fusées** : barème +1 / −3 (plancher 0), victoire à 20, mêmes noms et champs d'events (`waiting`, `start`, `scoreUpdate`, `opponentScore`, `win`, `opponentLeft`).
- **Discipline de verrous** : le matchmaking résout la room sous `globalMu`, relâche `globalMu`, puis appelle le jeu ; les callbacks `Game` s'exécutent sous `room.mu` seul.
- Avant chaque commit touchant du Go : `gofmt -l .` (doit ne rien afficher), `go vet ./...`, `go test ./...`.
- **Qui vérifie quoi.** Les tâches 1, 2 et 5 sont vérifiables par `go test` : leur exécutant les lance et rapporte la sortie. Les tâches 3, 4, 6, 7 et 8 ont pour critère d'acceptation un **scénario navigateur** (deux onglets, purge de cache, inspection de la console et du réseau). Un exécutant sans navigateur ne doit **jamais** cocher ces étapes ni écrire « vérifié » : il livre le code, lance les `grep` de non-régression qui sont à sa portée, et signale explicitement que la vérification navigateur reste à faire. Le scénario est alors déroulé par l'orchestrateur avant d'approuver la tâche.

---

### Task 1 : Logique pure du Puissance 4 portée en Go

**Files:**
- Create: `connect4.go`
- Test: `connect4_test.go`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `const c4Rows = 6`, `const c4Cols = 7`
  - `type Cell struct { Row int \`json:"row"\`; Col int \`json:"col"\` }`
  - `type C4Board [c4Rows][c4Cols]int`
  - `func c4CreateBoard() C4Board`
  - `func c4Drop(b *C4Board, col, player int) int` — retourne la ligne, ou `-1`
  - `func c4FindWin(b *C4Board, row, col int) []Cell` — cellules alignées (≥ 4), ou `nil`
  - `func c4IsDraw(b *C4Board) bool`

Portage à l'identique de `createBoard` / `dropDisc` / `findWin` / `isDraw` de `static/games.js:8-50`. Convention conservée : `board[row][col]`, ligne 0 = haut, `0` vide, `1` rouge, `2` jaune.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `connect4_test.go` :

```go
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
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `go test ./... -run 'TestC4'`
Expected: échec de compilation — `undefined: c4CreateBoard`, `undefined: c4Drop`, `undefined: c4FindWin`, `undefined: c4IsDraw`, `undefined: c4Rows`, `undefined: c4Cols`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `connect4.go` :

```go
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
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `gofmt -l . && go vet ./... && go test ./... -run 'TestC4' -v`
Expected: `gofmt` n'affiche rien, `go vet` silencieux, tous les tests `PASS`.

- [ ] **Step 5 : Commit**

```bash
git add connect4.go connect4_test.go
git commit -m "feat: portage Go de la logique pure du Puissance 4"
```

---

### Task 2 : Couche session générique côté Go

**Files:**
- Create: `session.go`, `session_test.go`
- Create: `race.go`
- Modify: `main.go` (réduit aux routes et au serveur statique)
- Modify: `static/app.js:1445` (ajout de `game: 'race'`), `static/app.js:1619` (`/api/answer` → `/api/action`)
- Modify: `static/sw.js:1` (`chronomaths-v2` → `chronomaths-v3`)

**Interfaces:**
- Consumes: rien de la tâche 1.
- Produces:
  - `type Game interface { Start(r *Room); Action(r *Room, p *Player, raw json.RawMessage) }`
  - `type VariantGame interface { Variant(v string) (string, error) }`
  - `type Player struct { ID, Name string; Index int; events chan []byte; done chan struct{}; sseConnected bool; State any }`
  - `type Room struct { ID, Key, Variant string; Game Game; Players [2]*Player; mu sync.Mutex; started bool; State any }`
  - `func (r *Room) Opponent(p *Player) *Player`
  - `var gameKinds map[string]Game` — chaque jeu s'y enregistre dans un `init()`
  - `func resolveKey(game, variant string) (key string, v string, g Game, err error)`
  - `func join(gameName, variant, name string) (*Player, *Room, error)`
  - `func sanitizeName(name string) string`
  - `func sendEvent(p *Player, event string, data any)`
  - `func broadcast(r *Room, event string, data any)`
  - `func handleDisconnect(playerID string)`
  - handlers : `handleJoinHTTP`, `handleActionHTTP`, `handleEventsSSE`
  - `race.go` : `raceGame`, `validOperations`, `Question`, `generateQuestion`, `winScore`, `penaltyPoints`, messages `StartMsg`, `ScoreUpdateMsg`, `OpponentScoreMsg`, `WinMsg`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `session_test.go` :

```go
package main

import (
	"encoding/json"
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

func TestRaceScoring(t *testing.T) {
	resetHub()
	p0, _, _ := join("race", "addition", "Ludo")
	expectEvent(t, p0, "waiting")
	p1, r, _ := join("race", "addition", "Léa")

	var start struct {
		Question Question `json:"question"`
	}
	json.Unmarshal(expectEvent(t, p0, "start"), &start)
	expectEvent(t, p1, "start")

	// Bonne réponse : +1 pour l'auteur, notification à l'adversaire.
	act(t, r, p0, map[string]int{"answer": start.Question.Answer})
	var upd struct {
		YourScore     int      `json:"yourScore"`
		OpponentScore int      `json:"opponentScore"`
		Correct       bool     `json:"correct"`
		Question      Question `json:"question"`
	}
	json.Unmarshal(expectEvent(t, p0, "scoreUpdate"), &upd)
	if !upd.Correct || upd.YourScore != 1 || upd.OpponentScore != 0 {
		t.Fatalf("scoreUpdate = %+v", upd)
	}
	var opp struct {
		OpponentScore int `json:"opponentScore"`
	}
	json.Unmarshal(expectEvent(t, p1, "opponentScore"), &opp)
	if opp.OpponentScore != 1 {
		t.Fatalf("opponentScore = %d, attendu 1", opp.OpponentScore)
	}

	// Mauvaise réponse : -3, plancher à 0.
	act(t, r, p0, map[string]int{"answer": upd.Question.Answer + 1})
	json.Unmarshal(expectEvent(t, p0, "scoreUpdate"), &upd)
	if upd.Correct || upd.YourScore != 0 {
		t.Fatalf("plancher du score non respecté: %+v", upd)
	}
	expectEvent(t, p1, "opponentScore")
}

func TestRaceWinAtTwenty(t *testing.T) {
	resetHub()
	p0, _, _ := join("race", "addition", "Ludo")
	expectEvent(t, p0, "waiting")
	p1, r, _ := join("race", "addition", "Léa")

	var start struct {
		Question Question `json:"question"`
	}
	json.Unmarshal(expectEvent(t, p0, "start"), &start)
	expectEvent(t, p1, "start")

	answer := start.Question.Answer
	for i := 0; i < winScore; i++ {
		act(t, r, p0, map[string]int{"answer": answer})
		var upd struct {
			Question Question `json:"question"`
		}
		json.Unmarshal(expectEvent(t, p0, "scoreUpdate"), &upd)
		expectEvent(t, p1, "opponentScore")
		answer = upd.Question.Answer
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
```

Ajouter aussi le helper `act` en bas de `session_test.go` :

```go
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
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `go test ./... -run 'TestSanitize|TestResolve|TestJoin|TestRace|TestDisconnect'`
Expected: échec de compilation — `undefined: sanitizeName`, `undefined: resolveKey`, `undefined: join`, `undefined: Room.Opponent`, `undefined: gameKinds`.

- [ ] **Step 3 : Créer `session.go`**

```go
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

	room.mu.Lock()
	room.started = true
	room.Game.Start(room)
	room.mu.Unlock()

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

	room.mu.Lock()
	started := room.started
	if started {
		room.Game.Action(room, player, raw)
	}
	room.mu.Unlock()

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
```

- [ ] **Step 4 : Créer `race.go`**

Déplacer depuis `main.go` la génération de questions et le barème, et les envelopper dans une implémentation de `Game`.

```go
package main

import (
	"encoding/json"
	"fmt"
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
```

- [ ] **Step 5 : Réduire `main.go`**

Remplacer intégralement le contenu de `main.go` par :

```go
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/api/join", handleJoinHTTP)
	http.HandleFunc("/api/action", handleActionHTTP)
	http.HandleFunc("/api/events", handleEventsSSE)
	http.Handle("/", http.FileServer(http.FS(staticFS)))

	port := "8080"
	fmt.Printf("🧮 Chronomaths démarre sur http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
```

- [ ] **Step 6 : Lancer les tests pour vérifier qu'ils passent**

Run: `gofmt -l . && go vet ./... && go test ./... -v`
Expected: `gofmt` et `go vet` silencieux ; tous les tests de `session_test.go` et `connect4_test.go` `PASS`.

- [ ] **Step 7 : Adapter les deux points d'appel du front**

Dans `static/app.js`, le corps du join (autour de la ligne 1445) :

```js
            body: JSON.stringify({ game: 'race', name, operation: config.operation })
```

Et l'envoi de réponse (autour de la ligne 1619) :

```js
    fetch('/api/action', {
```

Dans `static/sw.js` ligne 1 :

```js
const CACHE_NAME = 'chronomaths-v3';
```

- [ ] **Step 8 : Vérifier à la main que la course de fusées est intacte**

```bash
go run main.go
```

Ouvrir `http://localhost:8080` dans deux onglets, purger le cache (DevTools → Application → Storage → *Clear site data*) puis recharger. Dans chaque onglet : choisir la même opération → « Multi Joueur » → un prénom → Rejoindre.
Attendu : le premier onglet affiche l'écran d'attente, le second déclenche le départ dans les deux ; les scores montent et descendent comme avant ; la victoire à 20 s'affiche des deux côtés ; fermer un onglet affiche « Adversaire déconnecté » dans l'autre.

Vérifier aussi le refus des demandes mal formées :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d '{"game":"race","name":"X"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d '{"game":"connect4","name":"X"}'
```

Attendu : `400` puis `400` (le jeu `connect4` n'est pas encore enregistré).

- [ ] **Step 9 : Commit**

```bash
git add main.go session.go session_test.go race.go static/app.js static/sw.js
git commit -m "refactor: couche session generique cote Go, la course devient un Game"
```

---

### Task 3 : Helper de session côté front

**Files:**
- Modify: `static/app.js` (nouveau bloc session ; `cleanupScreen` ; bloc multijoueur migré)
- Modify: `static/sw.js:1` (`chronomaths-v3` → `chronomaths-v4`)

**Interfaces:**
- Consumes: `POST /api/join {game, name, operation}`, `POST /api/action` + header `X-Player-ID`, `GET /api/events?playerId=` (tâche 2).
- Produces (résolus par portée globale depuis `games.js`) :
  - `async function sessionJoin({ game, operation, name, on, onLost, onError }) → Promise<boolean>`
  - `function sessionSend(payload)`
  - `function sessionClose()`
  - `const session = { eventSource, playerId, name }`

- [ ] **Step 1 : Ajouter le bloc session dans `app.js`**

Insérer juste avant le commentaire `// MULTIPLAYER MODE` (actuellement ligne 1356) :

```js
// ============================================================
// SESSION EN LIGNE (générique : course de fusées, Puissance 4)
// ============================================================

const session = {
    eventSource: null,
    playerId: null,
    name: ''
};

// Ouvre une session : POST /api/join puis branchement du flux SSE.
//   on      : table { nom d'event SSE -> handler(data) }
//   onLost  : appelé si le flux se ferme de façon inattendue
//   onError : appelé si le join échoue
// Retourne true si la session est ouverte.
async function sessionJoin({ game, operation, name, on, onLost, onError }) {
    sessionClose();
    session.name = name;

    let playerId;
    try {
        const res = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game, name, operation })
        });
        if (!res.ok) {
            if (onError) onError();
            return false;
        }
        playerId = (await res.json()).playerId;
    } catch (err) {
        if (onError) onError();
        return false;
    }

    session.playerId = playerId;

    const es = new EventSource(`/api/events?playerId=${encodeURIComponent(playerId)}`);
    session.eventSource = es;

    Object.entries(on).forEach(([event, handler]) => {
        es.addEventListener(event, (e) => handler(e.data ? JSON.parse(e.data) : {}));
    });

    es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
            session.eventSource = null;
            session.playerId = null;
            if (onLost) onLost();
        }
    };

    return true;
}

// Envoie un coup au serveur. Le format est propre à chaque jeu.
function sessionSend(payload) {
    if (!session.playerId) return;
    fetch('/api/action', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Player-ID': session.playerId
        },
        body: JSON.stringify(payload)
    });
}

// Ferme la session. Sans effet si aucune session n'est ouverte.
function sessionClose() {
    if (session.eventSource) {
        session.eventSource.close();
        session.eventSource = null;
    }
    session.playerId = null;
}
```

- [ ] **Step 2 : Vider `cleanupScreen` de sa connaissance du multijoueur**

Remplacer `cleanupScreen` (lignes 296-312) par :

```js
function cleanupScreen(screenName) {
    if (screenCleanups[screenName]) screenCleanups[screenName]();
    switch (screenName) {
        case 'game':
            clearInterval(state.timerInterval);
            break;
    }
}
```

Et enregistrer les nettoyages du multijoueur juste après la déclaration de `sessionClose` (fin du bloc de l'étape 1) :

```js
// Les écrans en ligne ferment la session quand on les quitte (y compris via
// la navigation arrière du navigateur).
screenCleanups.multiWaiting = sessionClose;
screenCleanups.multiRace = sessionClose;
screenCleanups.multiWin = sessionClose;
```

- [ ] **Step 3 : Migrer la course de fusées sur le helper**

Dans le bloc `MULTIPLAYER MODE`, supprimer de l'état `multi` les champs `eventSource` et `playerId` (désormais dans `session`) :

```js
const multi = {
    playerName: '',
    opponentName: '',
    myScore: 0,
    opponentScore: 0
};
```

Remplacer `multiEl.btnBackHome` (lignes 1404-1411) par :

```js
multiEl.btnBackHome.addEventListener('click', () => {
    sessionClose();
    showScreen('modes');
});
```

Remplacer `joinGame` + `connectSSE` (lignes 1413-1508) par le bloc suivant. `waitingStatusEl` est déclaré **avant** `joinGame`, comme aujourd'hui (ligne 1429) : `joinGame` s'en sert, et un `const` n'est pas hissé.

```js
const waitingStatusEl = document.getElementById('waiting-status');

function joinGame() {
    const name = multiEl.playerName.value.trim();
    if (!name) return;

    multi.playerName = name;
    multi.myScore = 0;
    multi.opponentScore = 0;

    multiEl.waitingName.textContent = name;
    waitingStatusEl.textContent = 'Connexion...';
    showScreen('multiWaiting');

    sessionJoin({
        game: 'race',
        operation: config.operation,
        name,
        on: {
            waiting: () => {
                multiEl.waitingName.textContent = multi.playerName;
                waitingStatusEl.textContent = '';
                showScreen('multiWaiting');
            },
            start: (msg) => {
                multi.opponentName = msg.opponent;
                multi.myScore = 0;
                multi.opponentScore = 0;
                startMultiRace(msg);
            },
            scoreUpdate: (msg) => {
                multi.myScore = msg.yourScore;
                multi.opponentScore = msg.opponentScore;
                handleScoreUpdate(msg);
            },
            opponentScore: (msg) => {
                multi.opponentScore = msg.opponentScore;
                updateRaceTrack();
            },
            win: (msg) => showWinScreen(msg.winner),
            opponentLeft: () => showOpponentLeft()
        },
        onLost: () => {
            if (getActiveScreen() === 'multiRace') showOpponentLeft();
        },
        onError: () => {
            waitingStatusEl.textContent = 'Erreur de connexion';
        }
    });
}

document.getElementById('btn-join').addEventListener('click', joinGame);
multiEl.playerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinGame();
});
```

Remplacer l'envoi de réponse (lignes 1614-1627) par :

```js
multiEl.multiAnswerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const answer = parseInt(multiEl.multiAnswerInput.value);
    if (isNaN(answer)) return;
    sessionSend({ answer });
});
```

Et le bouton rejouer (lignes 1629-1636) :

```js
multiEl.btnPlayAgainMulti.addEventListener('click', () => {
    sessionClose();
    showScreen('modes');
});
```

- [ ] **Step 4 : Bump du cache**

`static/sw.js` ligne 1 :

```js
const CACHE_NAME = 'chronomaths-v4';
```

- [ ] **Step 5 : Vérifier qu'aucune référence morte ne subsiste**

Run: `grep -n "multi\.eventSource\|multi\.playerId\|connectSSE\|api/answer" static/app.js static/games.js`
Expected: aucune ligne.

- [ ] **Step 6 : Vérifier à la main la course de fusées**

```bash
go run main.go
```

Purger le cache, puis rejouer le scénario complet à deux onglets : attente, départ, bonne et mauvaise réponse, victoire à 20, bouton « Rejouer », fermeture d'un onglet (« Adversaire déconnecté »), et **navigation arrière du navigateur** depuis l'écran de course (attendu : retour sans erreur console, flux SSE fermé — vérifier dans l'onglet Network que la requête `events` passe à `canceled`).

- [ ] **Step 7 : Commit**

```bash
git add static/app.js static/sw.js
git commit -m "refactor: helper de session front partage, cleanupScreen degage du multijoueur"
```

---

### Task 4 : Écrans « rejoindre » et « attente » mutualisés

**Files:**
- Modify: `static/index.html:253-289` (écrans join et waiting)
- Modify: `static/app.js` (helpers d'écran ; course migrée dessus)
- Modify: `static/sw.js:1` (`chronomaths-v4` → `chronomaths-v5`)

**Interfaces:**
- Consumes: `sessionJoin`, `sessionClose`, `showScreen`, `getActiveScreen` (tâche 3).
- Produces (résolus par portée globale depuis `games.js`) :
  - `function showJoinScreen({ emojiLeft, title, emojiRight, subtitle, waitingEmoji, back, onSubmit })` — `onSubmit(name)` est appelé au clic sur « Rejoindre » ou à la touche Entrée, avec le prénom déjà `trim()` et non vide
  - `function showWaitingScreen(name)` — affiche l'écran d'attente avec l'emoji du jeu courant et le statut « Connexion... »
  - `function setWaitingStatus(text)`
  - `function leaveOnline()` — ferme la session et revient à l'écran `back` du jeu courant

- [ ] **Step 1 : Généraliser le HTML des deux écrans**

Dans `static/index.html`, remplacer les lignes 253-289 par :

```html
        <!-- Écran rejoindre : partagé par les jeux en ligne -->
        <div id="screen-multi-join" class="screen">
            <h1 class="title">
                <span class="emoji" id="join-emoji-left">🎮</span>
                <span id="join-title">Multi Joueur</span>
                <span class="emoji" id="join-emoji-right">🚀</span>
            </h1>
            <p class="subtitle" id="join-subtitle">Course de fusées!</p>

            <div class="join-card">
                <h2>Rejoindre une partie</h2>
                <div id="join-form">
                    <input
                        type="text"
                        id="player-name"
                        class="name-input"
                        placeholder="Ton prénom"
                        maxlength="15"
                        autocomplete="off"
                    >
                    <button type="button" id="btn-join" class="join-btn">Rejoindre</button>
                </div>
                <button id="btn-back-home" class="back-btn">← Retour</button>
            </div>
        </div>

        <!-- Écran attente : partagé par les jeux en ligne -->
        <div id="screen-multi-waiting" class="screen">
            <div class="waiting-card">
                <div class="waiting-rocket" id="waiting-emoji">🚀</div>
                <h2>En attente d'un adversaire...</h2>
                <p id="waiting-name" class="waiting-name"></p>
                <p id="waiting-status" class="waiting-status">Connexion...</p>
                <div class="waiting-dots">
                    <span></span><span></span><span></span>
                </div>
                <button id="btn-waiting-cancel" class="back-btn">← Annuler</button>
            </div>
        </div>
```

- [ ] **Step 2 : Ajouter le style du bouton d'annulation**

Dans `static/style.css`, juste après le bloc `.waiting-dots span:nth-child(3)` (autour de la ligne 876), ajouter :

```css
.waiting-card .back-btn {
    margin-top: 1.25rem;
    min-height: 44px;
}
```

- [ ] **Step 3 : Ajouter les helpers d'écran dans `app.js`**

Dans le bloc `SESSION EN LIGNE` créé à la tâche 3, après `sessionClose` et les entrées `screenCleanups`, ajouter :

```js
// ------------------------------------------------------------
// Écrans « rejoindre » et « attente », partagés par les jeux en ligne.
// Chaque jeu fournit son habillage et sa destination de retour.
// ------------------------------------------------------------

const onlineEl = {
    joinEmojiLeft: document.getElementById('join-emoji-left'),
    joinTitle: document.getElementById('join-title'),
    joinEmojiRight: document.getElementById('join-emoji-right'),
    joinSubtitle: document.getElementById('join-subtitle'),
    waitingEmoji: document.getElementById('waiting-emoji'),
    waitingName: document.getElementById('waiting-name'),
    waitingStatus: document.getElementById('waiting-status'),
    btnWaitingCancel: document.getElementById('btn-waiting-cancel')
};

const onlineFlow = {
    waitingEmoji: '🚀',
    back: 'modes',
    submit: null
};

function showJoinScreen({ emojiLeft, title, emojiRight, subtitle, waitingEmoji, back, onSubmit }) {
    onlineEl.joinEmojiLeft.textContent = emojiLeft;
    onlineEl.joinTitle.textContent = title;
    onlineEl.joinEmojiRight.textContent = emojiRight;
    onlineEl.joinSubtitle.textContent = subtitle;
    onlineFlow.waitingEmoji = waitingEmoji;
    onlineFlow.back = back;
    onlineFlow.submit = onSubmit;
    showScreen('multiJoin');
    document.getElementById('player-name').focus();
}

function showWaitingScreen(name) {
    onlineEl.waitingEmoji.textContent = onlineFlow.waitingEmoji;
    onlineEl.waitingName.textContent = name;
    onlineEl.waitingStatus.textContent = 'Connexion...';
    showScreen('multiWaiting');
}

function setWaitingStatus(text) {
    onlineEl.waitingStatus.textContent = text;
}

// Quitte le parcours en ligne courant : ferme la session et revient à l'écran
// d'où le jeu a été lancé (Modes pour la course, hub Jeux pour le Puissance 4).
function leaveOnline() {
    sessionClose();
    showScreen(onlineFlow.back);
}

function submitOnlineName() {
    const input = document.getElementById('player-name');
    const name = input.value.trim();
    if (!name || !onlineFlow.submit) return;
    onlineFlow.submit(name);
}

document.getElementById('btn-join').addEventListener('click', submitOnlineName);
document.getElementById('player-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitOnlineName();
});
document.getElementById('btn-back-home').addEventListener('click', leaveOnline);
onlineEl.btnWaitingCancel.addEventListener('click', leaveOnline);
```

- [ ] **Step 4 : Migrer la course sur ces helpers**

Dans le bloc `MULTIPLAYER MODE` de `app.js` :

Remplacer le handler de `multiEl.btnMulti` (lignes 1399-1402) par :

```js
multiEl.btnMulti.addEventListener('click', () => {
    showJoinScreen({
        emojiLeft: '🎮',
        title: 'Multi Joueur',
        emojiRight: '🚀',
        subtitle: 'Course de fusées !',
        waitingEmoji: '🚀',
        back: 'modes',
        onSubmit: joinRace
    });
});
```

Supprimer `multiEl.btnBackHome` de la table `multiEl` et son `addEventListener` (le bouton est désormais géré par `leaveOnline`). Supprimer aussi de `multiEl` l'entrée `playerName`, la déclaration `const waitingStatusEl`, le `document.getElementById('btn-join').addEventListener` et le `multiEl.playerName.addEventListener` de la tâche 3 : ils sont remplacés par les helpers partagés.

Renommer `joinGame` en `joinRace(name)` et supprimer sa lecture du champ de saisie :

```js
function joinRace(name) {
    multi.playerName = name;
    multi.myScore = 0;
    multi.opponentScore = 0;

    showWaitingScreen(name);

    sessionJoin({
        game: 'race',
        operation: config.operation,
        name,
        on: {
            waiting: () => {
                onlineEl.waitingName.textContent = multi.playerName;
                setWaitingStatus('');
                showScreen('multiWaiting');
            },
            start: (msg) => {
                multi.opponentName = msg.opponent;
                multi.myScore = 0;
                multi.opponentScore = 0;
                startMultiRace(msg);
            },
            scoreUpdate: (msg) => {
                multi.myScore = msg.yourScore;
                multi.opponentScore = msg.opponentScore;
                handleScoreUpdate(msg);
            },
            opponentScore: (msg) => {
                multi.opponentScore = msg.opponentScore;
                updateRaceTrack();
            },
            win: (msg) => showWinScreen(msg.winner),
            opponentLeft: () => showOpponentLeft()
        },
        onLost: () => {
            if (getActiveScreen() === 'multiRace') showOpponentLeft();
        },
        onError: () => setWaitingStatus('Erreur de connexion')
    });
}
```

Supprimer enfin de la table `multiEl` l'entrée `waitingName` : l'écran d'attente est désormais piloté par `onlineEl.waitingName`. `startMultiRace` n'est pas concerné, il ne touche que les voies de course et le champ de réponse.

Enfin, `multiEl.btnPlayAgainMulti` devient :

```js
multiEl.btnPlayAgainMulti.addEventListener('click', () => {
    sessionClose();
    showScreen('modes');
});
```

- [ ] **Step 5 : Bump du cache**

`static/sw.js` ligne 1 :

```js
const CACHE_NAME = 'chronomaths-v5';
```

- [ ] **Step 6 : Vérifier qu'aucune référence morte ne subsiste**

Run: `grep -n "multiEl.playerName\|multiEl.waitingName\|multiEl.btnBackHome\|waitingStatusEl\|joinGame" static/app.js`
Expected: aucune ligne.

- [ ] **Step 7 : Vérifier à la main**

```bash
go run main.go
```

Purger le cache. Vérifier : le titre de l'écran « rejoindre » est bien `🎮 Multi Joueur 🚀` / « Course de fusées ! » ; « ← Retour » ramène à Modes ; sur l'écran d'attente, « ← Annuler » ramène à Modes et **la requête `events` passe à `canceled`** dans l'onglet Network ; le scénario complet à deux onglets fonctionne toujours ; le prénom saisi est conservé d'un join au suivant.

- [ ] **Step 8 : Commit**

```bash
git add static/index.html static/style.css static/app.js static/sw.js
git commit -m "refactor: ecrans rejoindre et attente partages, bouton Annuler en attente"
```

---

### Task 5 : Jeu Puissance 4 en ligne côté Go

**Files:**
- Modify: `connect4.go` (ajout de la partie session sous la logique pure)
- Modify: `connect4_test.go` (ajout des tests du jeu)

**Interfaces:**
- Consumes: `Game`, `Room`, `Player`, `gameKinds`, `sendEvent`, `broadcast`, `join`, `Room.Opponent` (tâche 2) ; `c4CreateBoard`, `c4Drop`, `c4FindWin`, `c4IsDraw`, `C4Board`, `Cell`, `c4Rows`, `c4Cols` (tâche 1).
- Produces:
  - `type connect4Game struct{}` enregistré dans `gameKinds["connect4"]`
  - `type c4Room struct { Board C4Board; Current, Starter int; Over bool; Result string; Winner int; Line []Cell; LastMove *c4Move; Wins [2]int; Rematch [2]bool; Round int }`
  - `type c4Move struct { Row, Col, Player int }` (JSON `row`, `col`, `player`)
  - `type c4StateMsg` — snapshot JSON : `board`, `current`, `over`, `result`, `winner`, `line`, `lastMove`, `wins`, `rematch`, `round`
  - `type C4StartMsg struct { You, Opponent string; Color int; State c4StateMsg }` (JSON `you`, `opponent`, `color`, `state`)
  - `type C4StateEvent struct { State c4StateMsg }` (JSON `state`)
  - Events émis : `start`, `c4State`
  - Actions acceptées : `{"type":"drop","col":N}`, `{"type":"rematch"}`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `connect4_test.go` :

```go
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

	var fill func(i int) bool
	fill = func(i int) bool {
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
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `go test ./... -run 'TestC4Online'`
Expected: échec de compilation — `undefined: c4Room`, `undefined: C4StartMsg`, `undefined: C4StateEvent`, `undefined: connect4Game`, et `join("connect4", …)` retournerait `unknown game "connect4"`.

- [ ] **Step 3 : Écrire l'implémentation**

Ajouter à la fin de `connect4.go` :

```go
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
	Board    C4Board  `json:"board"`
	Current  int      `json:"current"`
	Over     bool     `json:"over"`
	Result   string   `json:"result"`
	Winner   int      `json:"winner"`
	Line     []Cell   `json:"line"`
	LastMove *c4Move  `json:"lastMove"`
	Wins     [2]int   `json:"wins"`
	Rematch  [2]bool  `json:"rematch"`
	Round    int      `json:"round"`
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

func (s *c4Room) snapshot() c4StateMsg {
	return c4StateMsg{
		Board:    s.Board,
		Current:  s.Current,
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
// Wins et Round survivent à l'appel.
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
```

- [ ] **Step 4 : Mesurer d'abord le test de match nul**

`c4FillNoWin` fait une recherche avec retour arrière : correcte et déterministe, mais son temps d'exécution n'est pas connu à l'avance.

Run: `go test ./... -run TestC4OnlineDrawEndsRound -v`
Expected: `PASS` en moins d'une seconde (`go test` affiche le temps du test).

Si le test dépasse quelques secondes, remplacer la recherche par le plateau qu'elle trouve, une fois pour toutes : ajouter temporairement `t.Logf("%v", full)` dans le test, relever la valeur, et remplacer le corps de `c4FillNoWin` par ce littéral `C4Board{...}` (en gardant le nom de la fonction et la vérification `c4FindWin` sur chaque case, en boucle, pour que le littéral reste auto-contrôlé). Déterministe et instantané.

- [ ] **Step 5 : Lancer toute la suite pour vérifier qu'elle passe**

Run: `gofmt -l . && go vet ./... && go test ./... -v`
Expected: `gofmt` et `go vet` silencieux ; tous les tests `PASS`, y compris ceux des tâches 1 et 2.

- [ ] **Step 6 : Vérifier le refus des demandes invalides sur le nouveau jeu**

```bash
go run main.go
```

Dans un autre terminal :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d '{"game":"connect4","name":"Ludo"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d '{"game":"connect4","name":"Ludo","operation":"nawak"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d '{"game":"nawak","name":"Ludo"}'
```

Attendu : `200`, `200` (l'`operation` est ignorée par `connect4`), `400`.

- [ ] **Step 7 : Commit**

```bash
git add connect4.go connect4_test.go
git commit -m "feat: Puissance 4 en ligne cote serveur, snapshots et accord de manche"
```

---

### Task 6 : Rendu du Puissance 4 par snapshot (mode local)

**Files:**
- Modify: `static/games.js` (rendu, coups locaux)
- Modify: `static/games.css:107-115` (animation déplacée sur une classe dédiée), ajout `.c4-col:disabled`
- Modify: `static/sw.js:1` (`chronomaths-v5` → `chronomaths-v6`)

**Interfaces:**
- Consumes: `createBoard`, `dropDisc`, `findWin`, `isDraw` (déjà dans `games.js`) ; `screenCleanups` (tâche 3).
- Produces (utilisés par la tâche 7) :
  - `function renderC4Snapshot(board, { lastMove, line, playable, hint })` — reconstruit la grille ; `board[row][col]`, `lastMove` = `{row, col}` ou `null`, `line` = tableau de `{row, col}` ou `null`, `playable` = colonnes cliquables, `hint` = 1, 2 ou 0
  - `function renderC4Move(board, opts, onSettled)` — affiche la chute puis, l'animation terminée, ré-affiche sans animation avec la ligne gagnante et appelle `onSettled()`
  - `function c4DropMs()` — 0 si `prefers-reduced-motion: reduce`, sinon `C4_DROP_MS`
  - `function playC4Column(col)` — point d'entrée du clic sur une colonne
  - `c4.mode` (`'local'` par défaut)

Ce refactor ne change **aucun comportement observable** du Puissance 4 local ; il remplace le rendu incrémental par un rendu depuis l'état absolu, seul compatible avec les snapshots serveur de la tâche 7.

- [ ] **Step 1 : Déplacer l'animation de chute sur une classe dédiée**

Dans `static/games.css`, remplacer le bloc `.c4-disc` (lignes 107-115) par :

```css
.c4-disc {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    box-shadow:
        inset 0 -3px 6px rgba(0, 0, 0, 0.25),
        0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Le rendu se fait depuis l'état complet du plateau : seul le dernier jeton
   posé porte cette classe, sinon tous les jetons rejoueraient leur chute. */
.c4-disc-drop {
    animation: c4Drop 0.35s cubic-bezier(0.5, 0, 0.75, 0.4);
}
```

Et ajouter, juste après `.c4-col:focus-visible` (ligne 98) :

```css
/* Colonne non jouable : ni curseur ni indice de survol, mais l'apparence du
   plateau ne change pas (pas d'opacité, la grille reste lisible). */
.c4-col:disabled {
    cursor: default;
}
```

Enfin, restreindre l'indice de survol aux colonnes jouables — remplacer les deux dernières règles du fichier (lignes 160-161) par :

```css
    .c4-hint-p1 .c4-col:not(:disabled):hover { background: rgba(255, 71, 87, 0.30); }
    .c4-hint-p2 .c4-col:not(:disabled):hover { background: rgba(255, 201, 60, 0.35); }
```

- [ ] **Step 2 : Remplacer l'état et le rendu dans `games.js`**

Remplacer le bloc `PUISSANCE 4 — ÉTAT & RENDU` (lignes 56-92) par :

```js
const C4_PLAYERS = {
    1: { name: 'Rouge', emoji: '🔴' },
    2: { name: 'Jaune', emoji: '🟡' }
};

const c4 = {
    mode: 'local',   // 'local' | 'online'
    board: null,
    current: 1,      // joueur dont c'est le tour (mode local)
    starter: 1,      // joueur ayant commencé la manche (mode local)
    over: false,
    wins: { 1: 0, 2: 0 },
    dropTimer: null
};

// Enregistrement des écrans auprès de la machine à états d'app.js.
screens.games = document.getElementById('screen-games');
screens.connect4 = document.getElementById('screen-connect4');

const c4El = {
    board: document.getElementById('c4-board'),
    turn: document.getElementById('c4-turn'),
    score: document.getElementById('c4-score')
};

function cancelC4Drop() {
    if (c4.dropTimer) {
        clearTimeout(c4.dropTimer);
        c4.dropTimer = null;
    }
}

// Nettoyage déclenché par la navigation arrière du navigateur.
screenCleanups.connect4 = () => {
    cancelC4Drop();
    sessionClose();
};
```

- [ ] **Step 3 : Remplacer le rendu par un rendu depuis l'état absolu**

Remplacer le bloc `RENDU` (lignes 140-188 : `C4_DROP_MS`, `renderC4Board`, `updateC4Turn`, `updateC4Score`, `placeC4Disc`) par :

```js
// Durée de la chute, alignée sur l'animation c4Drop de games.css.
const C4_DROP_MS = 350;

// prefers-reduced-motion neutralise l'animation : ne pas faire attendre.
function c4DropMs() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : C4_DROP_MS;
}

// Rendu du plateau depuis son état complet, partagé par les deux modes.
//   lastMove : {row, col} du dernier jeton posé (animé), ou null
//   line     : cellules gagnantes à mettre en valeur, ou null
//   playable : colonnes cliquables
//   hint     : couleur de l'indice de survol (1 ou 2), 0 pour aucun
function renderC4Snapshot(board, { lastMove, line, playable, hint }) {
    // La grille est reconstruite entièrement : mémoriser la colonne au clavier
    // pour la rendre, sinon chaque coup éjecterait le focus vers <body>.
    const focused = document.activeElement;
    const focusCol = focused && focused.classList.contains('c4-col')
        ? focused.dataset.col
        : null;

    c4El.board.textContent = '';
    c4El.board.className = hint ? `c4-board c4-hint-p${hint}` : 'c4-board';

    for (let col = 0; col < C4_COLS; col++) {
        const colEl = document.createElement('button');
        colEl.type = 'button';
        colEl.className = 'c4-col';
        colEl.dataset.col = col;
        colEl.disabled = !playable;
        colEl.setAttribute('aria-label', `Colonne ${col + 1}`);

        for (let row = 0; row < C4_ROWS; row++) {
            const cell = document.createElement('div');
            cell.className = 'c4-cell';

            const player = board[row][col];
            if (player !== 0) {
                const disc = document.createElement('div');
                disc.className = `c4-disc c4-p${player}`;
                if (lastMove && lastMove.row === row && lastMove.col === col) {
                    disc.classList.add('c4-disc-drop');
                    // Hauteur de chute : cases parcourues depuis le haut.
                    disc.style.setProperty('--c4-fall', row + 1);
                }
                if (line && line.some(c => c.row === row && c.col === col)) {
                    disc.classList.add('c4-disc-win');
                }
                cell.appendChild(disc);
            }
            colEl.appendChild(cell);
        }

        colEl.addEventListener('click', () => playC4Column(col));
        c4El.board.appendChild(colEl);
    }

    if (focusCol !== null) {
        const target = c4El.board.querySelector(`.c4-col[data-col="${focusCol}"]:not(:disabled)`);
        if (target) target.focus();
    }
}

// Affiche la chute du dernier jeton, puis révèle l'issue de la manche.
// Les colonnes restent verrouillées pendant l'animation, ce qui interdit
// tout second coup sans drapeau supplémentaire.
function renderC4Move(board, opts, onSettled) {
    renderC4Snapshot(board, { ...opts, line: null, playable: false });
    cancelC4Drop();
    c4.dropTimer = setTimeout(() => {
        c4.dropTimer = null;
        renderC4Snapshot(board, { ...opts, lastMove: null });
        if (onSettled) onSettled();
    }, opts.lastMove ? c4DropMs() : 0);
}

function updateC4Turn() {
    const p = C4_PLAYERS[c4.current];
    c4El.turn.textContent = `${p.emoji} À ${p.name} de jouer`;
    c4El.turn.className = `c4-turn c4-turn-p${c4.current}`;
}

function updateC4Score() {
    c4El.score.textContent = `🔴 Rouge ${c4.wins[1]} – ${c4.wins[2]} Jaune 🟡`;
}
```

- [ ] **Step 4 : Adapter les manches et les coups locaux**

Remplacer `startC4Match` / `startC4Round` (lignes 122-138) par :

```js
// Nouvelle rencontre : remet le score de manches à zéro.
function startC4Match() {
    c4.mode = 'local';
    c4.wins = { 1: 0, 2: 0 };
    c4.starter = 1;
    startC4Round();
}

// Nouvelle manche : plateau vierge, score de manches conservé.
function startC4Round() {
    cancelC4Drop();
    c4.board = createBoard();
    c4.current = c4.starter;
    c4.over = false;
    renderC4Snapshot(c4.board, {
        lastMove: null,
        line: null,
        playable: true,
        hint: c4.current
    });
    updateC4Turn();
    updateC4Score();
}
```

Remplacer le bloc `COUPS` (lignes 190-241 : `playC4Move`, `highlightC4Win`, `showC4End`) par :

```js
// ============================================================
// COUPS
// ============================================================

// Point d'entrée du clic sur une colonne, quel que soit le mode.
function playC4Column(col) {
    if (c4.mode === 'online') {
        sessionSend({ type: 'drop', col });
        return;
    }
    playC4LocalMove(col);
}

function playC4LocalMove(col) {
    if (c4.over) return;

    const player = c4.current;
    const row = dropDisc(c4.board, col, player);
    if (row === -1) return; // colonne pleine : coup ignoré, le tour ne change pas

    const line = findWin(c4.board, row, col);
    const draw = !line && isDraw(c4.board);

    if (line) {
        c4.over = true;
        c4.wins[player]++;
    } else if (draw) {
        c4.over = true;
    } else {
        c4.current = player === 1 ? 2 : 1;
    }

    renderC4Move(c4.board, {
        lastMove: { row, col },
        line,
        playable: !c4.over,
        hint: c4.over ? 0 : c4.current
    }, () => {
        if (line) {
            const p = C4_PLAYERS[player];
            showC4End(`🏆 ${p.emoji} ${p.name} gagne !`);
        } else if (draw) {
            showC4End('🤝 Match nul !');
        } else {
            updateC4Turn();
        }
        updateC4Score();
    });
}

function showC4End(text) {
    c4El.turn.textContent = text;
    c4El.turn.className = 'c4-turn c4-turn-over';
}
```

- [ ] **Step 5 : Fermer la session au retour depuis le plateau**

Remplacer le handler `btn-c4-back` (lignes 111-114) par :

```js
document.getElementById('btn-c4-back').addEventListener('click', () => {
    cancelC4Drop();
    sessionClose();
    showScreen('games');
});
```

- [ ] **Step 6 : Bump du cache**

`static/sw.js` ligne 1 :

```js
const CACHE_NAME = 'chronomaths-v6';
```

- [ ] **Step 7 : Vérifier qu'aucune référence morte ne subsiste**

Run: `grep -n "placeC4Disc\|highlightC4Win\|renderC4Board\|c4\.locked" static/games.js`
Expected: aucune ligne.

- [ ] **Step 8 : Vérifier à la main le Puissance 4 local**

```bash
go run main.go
```

Purger le cache. Accueil → 🎮 Jeux → Puissance 4. Vérifier :
- un seul jeton tombe à chaque clic, avec l'animation de chute, et **les jetons déjà posés ne rejouent pas leur chute** ;
- pendant la chute, cliquer une autre colonne ne fait rien ;
- l'alignement gagnant clignote, le libellé de tour passe en vert, le score de manches s'incrémente ;
- « Nouvelle partie » remet un plateau vierge, alterne le joueur qui commence, conserve le score ;
- une colonne pleine ignore le clic sans changer le tour ;
- **au clavier** : Tab jusqu'à une colonne, Entrée pour jouer, et le focus reste sur cette colonne après la chute — le vérifier avec `document.activeElement.dataset.col` dans la console juste après le coup (la grille est reconstruite à chaque rendu, c'est la régression que la restitution de focus évite) ;
- le match nul s'affiche en remplissant tout le plateau ;
- « ← Retour » puis retour au jeu repart d'une rencontre neuve (score 0–0) ;
- la navigation arrière du navigateur depuis le plateau ne laisse aucune erreur en console.

Avec `prefers-reduced-motion` activé (DevTools → Rendering → *Emulate CSS prefers-reduced-motion*), vérifier que le jeton apparaît immédiatement et que la fin de manche s'affiche sans attente.

- [ ] **Step 9 : Commit**

```bash
git add static/games.js static/games.css static/sw.js
git commit -m "refactor: rendu du Puissance 4 depuis l'etat complet du plateau"
```

---

### Task 7 : Mode en ligne du Puissance 4 branché sur la session

**Files:**
- Modify: `static/index.html:462-473` (hub Jeux : second bouton), `static/index.html:488-493` (zone d'actions du plateau)
- Modify: `static/games.js` (navigation, `applyC4State`, libellés en ligne, rematch, perte de connexion)
- Modify: `static/games.css` (statut de rematch)
- Modify: `static/sw.js:1` (`chronomaths-v6` → `chronomaths-v7`)

**Interfaces:**
- Consumes: `sessionJoin`, `sessionSend`, `sessionClose`, `showJoinScreen`, `showWaitingScreen`, `setWaitingStatus`, `getActiveScreen`, `showScreen` (tâches 3 et 4) ; `renderC4Snapshot`, `renderC4Move`, `playC4Column`, `c4`, `c4El`, `C4_PLAYERS` (tâche 6) ; events `start` / `c4State` / `opponentLeft` et actions `{type:'drop',col}` / `{type:'rematch'}` (tâche 5).
- Produces: rien pour d'autres tâches.

- [ ] **Step 1 : Ajouter le bouton du hub et la zone de rematch**

Dans `static/index.html`, remplacer le contenu du `<div class="mode-selection">` du hub Jeux (lignes 462-473) par :

```html
            <div class="mode-selection">
                <button id="btn-connect4" class="multi-btn c4-entry-btn">
                    <span class="multi-icon">🔴</span>
                    <span class="multi-text">
                        <span class="multi-title">Puissance 4</span>
                        <span class="multi-details">2 joueurs, chacun son tour, sur le même écran</span>
                    </span>
                    <span class="multi-arrow">→</span>
                </button>

                <button id="btn-connect4-online" class="multi-btn c4-entry-btn">
                    <span class="multi-icon">🌍</span>
                    <span class="multi-text">
                        <span class="multi-title">Puissance 4 en ligne</span>
                        <span class="multi-details">2 joueurs, chacun son écran</span>
                    </span>
                    <span class="multi-arrow">→</span>
                </button>

                <button id="btn-games-back" class="back-btn" style="margin-top:1rem;">← Retour</button>
            </div>
```

Et remplacer la zone d'actions du plateau (lignes 488-493) par :

```html
                <div class="c4-actions">
                    <button id="btn-c4-replay" class="play-again-btn">
                        <span>🔄</span> <span id="c4-replay-label">Nouvelle partie</span>
                    </button>
                    <p id="c4-rematch-status" class="c4-rematch-status" aria-live="polite"></p>
                    <button id="btn-c4-back" class="back-btn">← Retour</button>
                </div>
```

- [ ] **Step 2 : Styler le statut de rematch**

Dans `static/games.css`, après le bloc `.c4-actions .back-btn` (lignes 145-147), ajouter :

```css
.c4-rematch-status {
    min-height: 1.25rem;
    text-align: center;
    color: var(--text-light);
    font-size: 0.95rem;
    font-weight: 600;
}
```

- [ ] **Step 3 : Ajouter l'état et les éléments du mode en ligne dans `games.js`**

Dans le bloc `PUISSANCE 4 — ÉTAT & RENDU`, compléter `c4El` et ajouter `c4Online` juste après :

```js
const c4El = {
    board: document.getElementById('c4-board'),
    turn: document.getElementById('c4-turn'),
    score: document.getElementById('c4-score'),
    replay: document.getElementById('btn-c4-replay'),
    replayLabel: document.getElementById('c4-replay-label'),
    rematchStatus: document.getElementById('c4-rematch-status')
};

// État du mode en ligne. Le plateau fait autorité côté serveur : on ne garde
// ici que l'identité des joueurs et le dernier snapshot reçu.
const c4Online = {
    color: 0,            // 1 = rouge, 2 = jaune
    myName: '',
    opponentName: '',
    state: null,
    lost: ''             // message de fin anormale, '' si tout va bien
};
```

- [ ] **Step 4 : Ajouter la navigation vers le mode en ligne**

Dans le bloc `NAVIGATION`, après le handler de `btn-connect4`, ajouter :

```js
document.getElementById('btn-connect4-online').addEventListener('click', () => {
    showJoinScreen({
        emojiLeft: '🌍',
        title: 'Puissance 4 en ligne',
        emojiRight: '🔴',
        subtitle: 'Trouve un adversaire !',
        waitingEmoji: '🔴',
        back: 'games',
        onSubmit: joinConnect4Online
    });
});
```

Le handler de `btn-connect4` n'a pas à changer : `startC4Match()` remet déjà `c4.mode = 'local'` depuis la tâche 6.

Remplacer le handler de `btn-c4-replay` (lignes 116-119) par :

```js
document.getElementById('btn-c4-replay').addEventListener('click', () => {
    if (c4.mode === 'online') {
        sessionSend({ type: 'rematch' });
        return;
    }
    c4.starter = c4.starter === 1 ? 2 : 1;
    startC4Round();
});
```

- [ ] **Step 5 : Ajouter le bloc du mode en ligne**

Ajouter à la fin de `static/games.js` :

```js
// ============================================================
// PUISSANCE 4 EN LIGNE
// Le serveur fait autorité : chaque event porte un snapshot complet
// du plateau, le client n'appelle jamais dropDisc.
// ============================================================

function joinConnect4Online(name) {
    c4.mode = 'online';
    c4Online.color = 0;
    c4Online.myName = name;
    c4Online.opponentName = '';
    c4Online.state = null;
    c4Online.lost = '';

    showWaitingScreen(name);

    sessionJoin({
        game: 'connect4',
        name,
        on: {
            waiting: () => {
                setWaitingStatus('');
            },
            start: (msg) => {
                c4Online.color = msg.color;
                c4Online.opponentName = msg.opponent;
                showScreen('connect4');
                applyC4State(msg.state, false);
            },
            c4State: (msg) => applyC4State(msg.state, true),
            opponentLeft: () => showC4Lost('🚪 Adversaire déconnecté')
        },
        onLost: () => showC4Lost('⚠️ Connexion perdue'),
        onError: () => setWaitingStatus('Erreur de connexion')
    });
}

// Applique un snapshot serveur. animate est faux pour l'état initial d'une
// manche (aucun jeton à faire tomber).
function applyC4State(state, animate) {
    c4Online.state = state;

    const myTurn = !state.over && !c4Online.lost && state.current === c4Online.color;
    const opts = {
        lastMove: state.lastMove,
        line: state.line,
        playable: myTurn,
        hint: state.over || c4Online.lost ? 0 : state.current
    };

    if (animate && state.lastMove) {
        renderC4Move(state.board, opts, () => updateC4Online(state));
    } else {
        cancelC4Drop();
        renderC4Snapshot(state.board, { ...opts, lastMove: null });
        updateC4Online(state);
    }
}

function updateC4Online(state) {
    updateC4OnlineTurn(state);
    updateC4OnlineScore(state);
    updateC4OnlineRematch(state);
}

function updateC4OnlineTurn(state) {
    if (c4Online.lost) {
        c4El.turn.textContent = c4Online.lost;
        c4El.turn.className = 'c4-turn c4-turn-over';
        return;
    }

    if (state.over) {
        if (state.result === 'draw') {
            c4El.turn.textContent = '🤝 Match nul !';
        } else if (state.winner === c4Online.color) {
            c4El.turn.textContent = '🏆 Tu gagnes !';
        } else {
            c4El.turn.textContent = `😢 ${c4Online.opponentName} gagne !`;
        }
        c4El.turn.className = 'c4-turn c4-turn-over';
        return;
    }

    const color = state.current;
    const emoji = C4_PLAYERS[color].emoji;
    c4El.turn.textContent = color === c4Online.color
        ? `${emoji} À toi de jouer`
        : `${emoji} Au tour de ${c4Online.opponentName}`;
    c4El.turn.className = `c4-turn c4-turn-p${color}`;
}

// Rouge (index 0) reste toujours à gauche, quel que soit le joueur devant
// l'écran : les deux clients affichent le même score dans le même ordre.
function updateC4OnlineScore(state) {
    const redName = c4Online.color === 1 ? c4Online.myName : c4Online.opponentName;
    const yellowName = c4Online.color === 2 ? c4Online.myName : c4Online.opponentName;
    c4El.score.textContent = `🔴 ${redName} ${state.wins[0]} – ${state.wins[1]} ${yellowName} 🟡`;
}

function updateC4OnlineRematch(state) {
    c4El.replayLabel.textContent = 'Nouvelle manche';

    if (c4Online.lost) {
        c4El.replay.style.display = 'none';
        c4El.rematchStatus.textContent = '';
        return;
    }

    c4El.replay.style.display = state.over ? '' : 'none';

    const meAsked = state.rematch[c4Online.color - 1];
    const themAsked = state.rematch[2 - c4Online.color];
    c4El.replay.disabled = meAsked;

    if (meAsked && !themAsked) {
        c4El.rematchStatus.textContent = `⏳ En attente de ${c4Online.opponentName}…`;
    } else if (themAsked && !meAsked) {
        c4El.rematchStatus.textContent = `🔄 ${c4Online.opponentName} veut rejouer`;
    } else {
        c4El.rematchStatus.textContent = '';
    }
}

// Fin anormale : adversaire parti ou flux perdu. Le plateau reste affiché,
// verrouillé, avec pour seule issue le bouton Retour.
function showC4Lost(message) {
    sessionClose();

    if (getActiveScreen() !== 'connect4' || !c4Online.state) {
        setWaitingStatus('Connexion perdue');
        return;
    }

    c4Online.lost = message;
    applyC4State(c4Online.state, false);
}
```

- [ ] **Step 6 : Rétablir l'habillage local du bouton rejouer**

Le mode en ligne écrit dans `c4El.replayLabel`, `c4El.replay.style.display`, `c4El.replay.disabled` et `c4El.rematchStatus` : le mode local doit remettre son propre habillage. Dans `startC4Round` (tâche 6), après `updateC4Score()`, ajouter :

```js
    c4El.replay.style.display = '';
    c4El.replay.disabled = false;
    c4El.replayLabel.textContent = 'Nouvelle partie';
    c4El.rematchStatus.textContent = '';
```

- [ ] **Step 7 : Bump du cache**

`static/sw.js` ligne 1 :

```js
const CACHE_NAME = 'chronomaths-v7';
```

- [ ] **Step 8 : Vérifier à la main le mode en ligne**

```bash
go run main.go
```

Purger le cache dans les deux onglets. Dans chacun : Accueil → 🎮 Jeux → 🌍 Puissance 4 en ligne → un prénom (« Ludo » puis « Léa ») → Rejoindre.

Vérifier :
- le premier onglet attend avec l'emoji 🔴 et un bouton « ← Annuler » qui ramène au hub Jeux ;
- au départ, le premier joueur est 🔴 Rouge et voit « 🔴 À toi de jouer », le second « 🔴 Au tour de Ludo » ;
- hors de son tour, cliquer une colonne ne fait rien et aucun indice de survol n'apparaît ;
- chaque coup apparaît dans les deux onglets avec l'animation de chute, une seule fois, sans que les jetons déjà posés rejouent leur chute ;
- le score s'affiche dans le **même ordre** dans les deux onglets (`🔴 Ludo 0 – 0 Léa 🟡`) ;
- à la victoire : ligne clignotante des deux côtés, « 🏆 Tu gagnes ! » d'un côté et « 😢 Ludo gagne ! » de l'autre, score incrémenté, bouton « Nouvelle manche » visible ;
- cliquer « Nouvelle manche » d'un seul côté : ce côté affiche « ⏳ En attente de Léa… » avec le bouton désactivé, l'autre « 🔄 Ludo veut rejouer » ; recliquer ne change rien ;
- quand les deux ont cliqué : plateau vierge, **c'est Jaune qui commence**, score conservé ;
- fermer un onglet : l'autre affiche « 🚪 Adversaire déconnecté », le plateau reste visible et verrouillé, seul « ← Retour » subsiste ;
- couper le serveur (Ctrl-C) pendant une partie : les onglets affichent « ⚠️ Connexion perdue » ;
- « ← Retour » ramène au hub Jeux ; relancer une partie locale depuis le hub fonctionne (score 0–0, noms Rouge/Jaune, bouton « Nouvelle partie ») ;
- la navigation arrière du navigateur depuis le plateau en ligne ferme le flux SSE (requête `events` `canceled` dans l'onglet Network) ;
- la course de fusées fonctionne toujours (non-régression du parcours partagé).

- [ ] **Step 9 : Commit**

```bash
git add static/index.html static/games.js static/games.css static/sw.js
git commit -m "feat: mode en ligne du Puissance 4, chacun son ecran"
```

---

### Task 8 : Audits sécurité et responsive, documentation

**Files:**
- Modify: `README.md`, `CLAUDE.md`
- Modify: `static/games.css` / `static/style.css` (uniquement si l'audit responsive révèle un défaut)
- Modify: `static/sw.js:1` (`chronomaths-v7` → `chronomaths-v8`, **uniquement si `static/` est modifié**)

**Interfaces:**
- Consumes: l'ensemble des tâches précédentes.
- Produces: rien.

- [ ] **Step 1 : Audit sécurité**

Vérifier chaque point et corriger les écarts constatés :

```bash
# Aucune insertion HTML brute : tout passe par textContent.
grep -n "innerHTML" static/app.js static/games.js
# Bornes et tour validés côté serveur, pas seulement côté client.
grep -n "c4Play\|s.Current != color\|row == -1" connect4.go
# Troncature du nom sur les runes.
grep -n "maxNameRunes\|\[:15\]" session.go
```

Attendu : `innerHTML` n'apparaît que dans les usages préexistants du rendu de la posée (à confirmer ligne par ligne : aucune donnée venant du serveur ni d'une saisie utilisateur ne doit y transiter) ; `[:15]` n'apparaît nulle part.

Puis, serveur lancé, vérifier qu'un client hostile ne peut rien forcer :

```bash
# Coup sans identité.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/action \
  -H 'Content-Type: application/json' -d '{"type":"drop","col":0}'
# Coup avec une identité inventée.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/action \
  -H 'X-Player-ID: deadbeefdeadbeef' -H 'Content-Type: application/json' \
  -d '{"type":"drop","col":0}'
# Corps illisible et corps géant.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d 'pas du json'
python3 -c "print('{\"game\":\"connect4\",\"name\":\"' + 'a'*100000 + '\"}')" > /tmp/big.json
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' --data-binary @/tmp/big.json
# Flux SSE d'un joueur inconnu.
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8080/api/events?playerId=nawak'
```

Attendu : `400`, `400`, `400`, puis `400` **ou** `413` pour le corps géant (`http.MaxBytesReader` peut renvoyer un `*MaxBytesError` et marquer la réponse avant que le handler n'écrive — les deux codes sont un refus correct), et `404`.

Vérifier enfin dans un onglet en ligne, via DevTools → Network, qu'aucune réponse ne contient le `playerId` de l'adversaire (les snapshots ne portent que des noms, des couleurs et des cases).

Consigner le résultat dans le message de commit ; si un écart est trouvé, le corriger dans cette tâche.

- [ ] **Step 2 : Audit responsive**

Avec DevTools, en 320 px de large, en 390 px, et en paysage 740×360 :

- le plateau ne déborde pas horizontalement et reste entièrement visible sans scroll latéral de la page ;
- chaque `.c4-col` mesure au moins 44 px de large — le mesurer dans la console : `[...document.querySelectorAll('.c4-col')].map(c => c.getBoundingClientRect().width)` ; si une valeur descend sous 44, réduire le `padding` du `.c4-board` ou plafonner sa largeur, et **ne pas** réduire les cellules ;
- les boutons « ← Annuler », « Nouvelle manche » et « ← Retour » font au moins 44 px de haut ;
- l'indice de survol des colonnes n'apparaît pas au toucher (device toolbar en mode tactile) et n'apparaît pas sur une colonne désactivée ;
- navigation au clavier : le focus survit à un coup en local **et** à un coup adverse en ligne — sauf quand ce n'est pas son tour, où les 7 colonnes sont `disabled` et où le focus part légitimement du plateau ; vérifier qu'il y revient dès que le tour revient ;
- avec *Emulate CSS prefers-reduced-motion* : ni chute, ni clignotement de la ligne gagnante, ni attente avant l'affichage de la fin de manche ;
- la safe-area est respectée en bas d'écran sur un profil iPhone (le bouton « ← Retour » reste atteignable) ;
- `grep -n "background-attachment: fixed" static/*.css` ne retourne rien.

Corriger les défauts constatés dans `static/games.css` (ou `static/style.css` pour les écrans partagés), puis bumper `CACHE_NAME` en `chronomaths-v8`.

- [ ] **Step 3 : Mettre à jour `README.md`**

Dans la section Jeux, remplacer la description du Puissance 4 par les deux modes. Ajouter, à l'endroit où la section décrit le Puissance 4 :

```markdown
### 🎮 Jeux

- **🔴 Puissance 4** — 2 joueurs sur le même appareil, chacun son tour. Score de manches conservé, le joueur qui commence alterne à chaque nouvelle partie.
- **🌍 Puissance 4 en ligne** — 2 joueurs, chacun sur son écran. Chaque joueur saisit son prénom, le premier arrivé attend un adversaire. Le premier connecté joue 🔴 Rouge, le second 🟡 Jaune. Le score de manches est conservé et, pour relancer une manche, **les deux joueurs doivent cliquer sur « Nouvelle manche »** ; le joueur qui commence alterne.

Si un joueur quitte la partie, l'autre est prévenu et peut revenir au hub Jeux. Un joueur qui laisse simplement son onglet ouvert sans jouer bloque la partie : il n'y a pas de minuteur de tour.
```

Vérifier aussi que la section décrivant le multijoueur des opérations mentionne toujours le bouton « ← Annuler » disponible pendant l'attente.

- [ ] **Step 4 : Mettre à jour `CLAUDE.md`**

Dans la section *Structure*, remplacer les lignes de `main.go` par :

```
├── main.go           # Serveur HTTP : embed, routes, main()
├── session.go        # Session générique 2 joueurs : matchmaking, SSE, déconnexion
├── race.go           # Course de fusées : génération des questions + jeu
├── connect4.go       # Puissance 4 : logique pure + jeu en ligne
├── connect4_test.go  # Tests de la logique de plateau et du jeu en ligne
```

Remplacer la section *Multijoueur (SSE + POST)* par :

```markdown
### Session multijoueur générique (SSE + POST)

- **Server→Client** : Server-Sent Events via `GET /api/events?playerId=XXX` (`EventSource`)
- **Client→Server** : `POST /api/join` (rejoindre) et `POST /api/action` (jouer, header `X-Player-ID`)
- `session.go` ne connaît aucune règle de jeu : il délègue à l'interface `Game` (`Start`, `Action`), implémentée par `raceGame` (`race.go`) et `connect4Game` (`connect4.go`). Chaque jeu s'enregistre dans `gameKinds` via son `init()`.
- Files d'attente isolées par clé : `race:<operation>` ou `connect4`. Un jeu ou une variante inconnus sont **refusés en 400** — sans ce contrôle, une demande mal formée serait appariée dans la file d'un autre jeu.
- Un jeu à plusieurs files implémente `VariantGame.Variant()` (la course en a une par opération) ; le Puissance 4 ne l'implémente pas.
- **Discipline de verrous** : le matchmaking résout la room sous `globalMu`, relâche `globalMu`, puis appelle le jeu ; les callbacks `Game` s'exécutent sous `room.mu` seul.
- ⚠️ `sendEvent` abandonne un message quand le canal du joueur est plein. Tout jeu tour par tour doit donc diffuser un **snapshot complet** de son état, jamais un delta : un delta perdu désynchronise définitivement, un état absolu est auto-réparant.
- Chaque joueur reçoit un `playerId` unique (16 hex, `crypto/rand`) au join. Keepalive SSE toutes les 30 s, timeout joueur fantôme 30 s.
- Events génériques : `waiting`, `opponentLeft`. Course : `start`, `scoreUpdate`, `opponentScore`, `win`. Puissance 4 : `start`, `c4State`.
- **Front** : `sessionJoin({game, operation, name, on, onLost, onError})`, `sessionSend(payload)` et `sessionClose()` vivent dans `app.js` (pas de fichier séparé : cela imposerait une entrée de plus dans le precache de `sw.js` et une contrainte d'ordre de chargement supplémentaire). `on` est une table `nom d'event → handler`.
- Les écrans `screen-multi-join` et `screen-multi-waiting` sont **partagés** par les jeux en ligne : `showJoinScreen({emojiLeft, title, emojiRight, subtitle, waitingEmoji, back, onSubmit})` en fournit l'habillage et la destination de retour.
```

Compléter la section *Section Jeux* :

```markdown
- **Puissance 4** : deux modes sur le même écran `screen-connect4`, pilotés par `c4.mode` (`'local'` | `'online'`). Les fonctions pures du plateau existent en double, en JS (`games.js`, mode local) et en Go (`connect4.go`, mode en ligne) : toute correction de règle doit être portée des deux côtés.
- Le rendu passe par `renderC4Snapshot(board, {lastMove, line, playable, hint})`, qui reconstruit la grille depuis l'**état complet** du plateau. C'est ce qui permet aux deux modes de partager un seul chemin de rendu. Corollaire : l'animation de chute vit sur la classe `.c4-disc-drop`, appliquée au seul `lastMove` — la mettre sur `.c4-disc` ferait rejouer la chute de tous les jetons à chaque rendu.
- Les colonnes non jouables sont `disabled` : le verrouillage pendant la chute et hors de son tour est porté par le DOM, sans drapeau de lock.
- `C4_DROP_MS` (games.js) doit rester aligné sur la durée de l'animation `c4Drop` (games.css). `c4DropMs()` retourne 0 sous `prefers-reduced-motion`.
- En ligne, le client n'appelle **jamais** `dropDisc` : il envoie `{type:'drop',col}` et n'affiche que le snapshot renvoyé. La relance d'une manche demande l'accord des deux joueurs (`{type:'rematch'}`).
```

- [ ] **Step 5 : Vérification finale complète**

Run: `gofmt -l . && go vet ./... && go test ./... -v`
Expected: `gofmt` et `go vet` silencieux, tous les tests `PASS`.

Puis, serveur relancé et cache purgé, dérouler une dernière fois les quatre parcours : solo (une opération au choix), posée, course de fusées à deux onglets, Puissance 4 local, Puissance 4 en ligne à deux onglets. Aucune erreur en console dans aucun onglet.

- [ ] **Step 6 : Commit**

```bash
git add README.md CLAUDE.md static/
git commit -m "doc: Puissance 4 en ligne dans README et CLAUDE.md, audits securite et responsive"
```

---

## Récapitulatif des tâches

| # | Tâche | Livrable testable |
|---|---|---|
| 1 | Logique pure du Puissance 4 en Go | `go test` vert sur `connect4_test.go` |
| 2 | Couche session générique Go | `go test` vert ; course de fusées inchangée à l'écran |
| 3 | Helper de session front | Course de fusées migrée, `cleanupScreen` sans jeu |
| 4 | Écrans rejoindre / attente mutualisés | Course inchangée + « ← Annuler » fonctionnel |
| 5 | Puissance 4 en ligne côté Go | `go test` vert sur les 9 tests `TestC4Online*` |
| 6 | Rendu par snapshot | Puissance 4 local inchangé à l'écran |
| 7 | Mode en ligne branché | Partie complète à deux onglets, rematch, déconnexion |
| 8 | Audits + documentation | Audits consignés, `README.md` et `CLAUDE.md` à jour |
