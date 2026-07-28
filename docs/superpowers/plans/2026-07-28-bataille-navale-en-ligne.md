# Bataille navale en ligne — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un troisième jeu à la section Jeux — une bataille navale à deux joueuses, chacune sur son écran — dont la confidentialité de la flotte est garantie par le typage des payloads.

**Architecture :** Côté Go, `battleship.go` ajoute un jeu à la couche de session existante (`session.go`, interface `Game`) sans la modifier : logique pure du plateau, puis un jeu en ligne à trois phases (placement / bataille / fin). Contrairement au Puissance 4 qui diffuse le même snapshot aux deux joueurs, chaque joueuse reçoit une **vue différente** via `sendEvent` — `broadcast` n'est jamais utilisé pour l'état de jeu. Côté front, `battleship.js` et `battleship.css` sont des fichiers dédiés qui consomment le helper de session d'`app.js` et reconstruisent l'interface depuis l'état complet reçu.

**Tech Stack :** Go 1.25 (stdlib seule, `embed`, `net/http`, `testing`), HTML5 / CSS3 / Vanilla JS (aucun framework, aucun module ES), SSE + POST JSON.

**Spec :** `docs/superpowers/specs/2026-07-28-bataille-navale-en-ligne-design.md`

## Global Constraints

- **Zéro dépendance externe**, côté Go comme côté front. `go.mod` ne doit gagner aucun `require`.
- **La confidentialité de la flotte est portée par le typage.** `bsEnemyView` ne doit **jamais** gagner un champ capable de contenir une case de bateau non touchée. L'état de jeu part par `sendEvent(p, …)` avec la vue propre à chaque joueuse ; **`broadcast` est interdit pour l'état de jeu** — c'est la différence structurelle avec le Puissance 4.
- **Aucun module ES** : `app.js` puis `battleship.js` sont des scripts classiques. `battleship.js` résout `screens`, `showScreen`, `screenCleanups`, `sessionJoin`, `sessionSend`, `sessionClose`, `showJoinScreen`, `setWaitingStatus`, `getActiveScreen` par portée lexicale globale : il doit donc être chargé **après `app.js`** dans `index.html`.
- **Deux nouveaux fichiers statiques**, contrairement au plan précédent : la liste de precache de `sw.js` passe de `['/', '/index.html', '/style.css', '/games.css', '/app.js', '/games.js', '/icon.svg', '/manifest.json']` à la même liste plus `'/battleship.css'` et `'/battleship.js'`.
- **Toute tâche qui modifie `static/` bump `CACHE_NAME` dans `static/sw.js`.** Valeur de départ : `chronomaths-v11`. Version cible imposée : T3 → `chronomaths-v12`, T4 → `chronomaths-v13`, T5 → `chronomaths-v14` (uniquement si T5 touche `static/`).
- **Langue** : UI en français (accents obligatoires), code et identifiants en anglais, commentaires en français. Les messages de commit du dépôt sont **sans accents**.
- **Commande de lancement : `go run .`, jamais `go run main.go`** — le paquet `main` est réparti sur plusieurs fichiers.
- **Vérification manuelle après toute modification de `static/`** : `//go:embed` fige les fichiers à la compilation → redémarrer `go run .`, puis purger le Service Worker et les caches (DevTools → Application → Storage → *Clear site data*), sinon l'ancien bundle reste servi en cache-first.
- **`.operation-card` est interdite** hors des 4 cartes d'opération : elle est bindée vers `config.operation` et fait planter `updateModesScreen()`. Le bouton du hub Jeux utilise `.multi-btn`.
- **Ne pas passer `waitingTilt`** à `showJoinScreen` : l'inclinaison à −45° de l'emoji d'attente est propre à la course de fusées. La remonter sur `.waiting-icon` inclinerait l'emoji de tout futur jeu en ligne.
- **Aucun changement fonctionnel ailleurs** : ni le Puissance 4 (local ou en ligne), ni la course de fusées, ni les modes solo et posée. `session.go`, `race.go`, `connect4.go`, `static/app.js`, `static/games.js`, `static/games.css` et `static/style.css` **ne sont pas modifiés**.
- **Discipline de verrous** : le matchmaking résout la room sous `globalMu`, relâche `globalMu`, puis appelle le jeu ; les callbacks `Game` s'exécutent sous `room.mu` seul.
- **⚠️ `sendEvent` abandonne un message quand le canal de la joueuse est plein.** Le snapshot doit rester un **état absolu**, jamais un delta : un delta perdu désynchronise définitivement, un état absolu est auto-réparant.
- Avant chaque commit touchant du Go : `gofmt -l .` (doit ne rien afficher), `go vet ./...`, `go test -race ./...`.
- **Qui vérifie quoi.** Les tâches 1 et 2 sont vérifiables par `go test` : leur exécutant les lance et rapporte la sortie brute. Les tâches 3, 4 et 5 ont pour critère d'acceptation un **scénario navigateur** (deux onglets, purge de cache, inspection de la console et du réseau). Un exécutant sans navigateur ne doit **jamais** cocher ces étapes ni écrire « vérifié » : il livre le code, lance les `grep` de non-régression à sa portée, et signale explicitement que la vérification navigateur reste à faire. Le scénario est alors déroulé par l'orchestrateur avant d'approuver la tâche.

---
### Task 1 : Logique pure de la bataille navale en Go

**Files:**
- Create: `battleship.go`
- Test: `battleship_test.go`

**Interfaces:**
- Consumes: rien. Cette tâche n'utilise ni `session.go`, ni `Room`, ni `Player`, ni aucun event.
- Produces :
  - `const bsSize = 8`, `const bsTotalCells = 12`
  - `const ( bsUnknown = 0; bsMiss = 1; bsHit = 2 )`
  - `var bsFleetSpec = []struct{ Name string; Size int }{{"Porte-avions", 4}, {"Croiseur", 3}, {"Sous-marin", 3}, {"Torpilleur", 2}}`
  - `type bsCell struct { Row int \`json:"row"\`; Col int \`json:"col"\` }`
  - `type bsShip struct { Name string; Cells []bsCell; Hits int }`
  - `func bsInBounds(c bsCell) bool`
  - `func bsRandomFleet() []bsShip`
  - `func bsPlacements(occupied *[bsSize][bsSize]bool, size int) [][]bsCell`
  - `func bsShipAt(fleet []bsShip, c bsCell) *bsShip`
  - `func bsSunk(s *bsShip) bool`
  - `func bsAllSunk(fleet []bsShip) bool`
  - `func bsFire(fleet []bsShip, shots *[bsSize][bsSize]int, c bsCell) (result string, sunkName string, ok bool)`

Cette tâche est **entièrement vérifiable par `go test`**. Aucune vérification navigateur.

#### Premier cycle : la flotte de référence et les bornes

- [ ] **Step 1 : Écrire les tests de la spec de flotte et des bornes**

Créer `battleship_test.go`.

```go
package main

import "testing"

func TestBsFleetSpecSizes(t *testing.T) {
	// La flotte est fixée par le design : 4 / 3 / 3 / 2. bsTotalCells est écrit
	// en dur — une constante ne peut pas sommer un slice — ce test est donc le
	// garde-fou qui tient la constante et la spec d'accord.
	want := []int{4, 3, 3, 2}
	if len(bsFleetSpec) != len(want) {
		t.Fatalf("%d bateaux dans bsFleetSpec, attendu %d", len(bsFleetSpec), len(want))
	}
	total := 0
	for i, spec := range bsFleetSpec {
		if spec.Name == "" {
			t.Fatalf("bateau %d sans nom", i)
		}
		if spec.Size != want[i] {
			t.Fatalf("%s de taille %d, attendu %d", spec.Name, spec.Size, want[i])
		}
		total += spec.Size
	}
	if total != bsTotalCells {
		t.Fatalf("somme des tailles = %d, bsTotalCells = %d", total, bsTotalCells)
	}
}

func TestBsInBounds(t *testing.T) {
	for _, c := range []bsCell{{0, 0}, {0, bsSize - 1}, {bsSize - 1, 0}, {bsSize - 1, bsSize - 1}, {3, 4}} {
		if !bsInBounds(c) {
			t.Fatalf("(%d,%d) déclarée hors de la grille", c.Row, c.Col)
		}
	}
	for _, c := range []bsCell{{-1, 0}, {0, -1}, {bsSize, 0}, {0, bsSize}, {-1, -1}, {99, 99}} {
		if bsInBounds(c) {
			t.Fatalf("(%d,%d) déclarée dans la grille", c.Row, c.Col)
		}
	}
}
```

- [ ] **Step 2 : Lancer les tests et constater l'échec**

Run: `go test -run 'TestBsFleetSpecSizes|TestBsInBounds' ./...`
Expected: échec de compilation — `undefined: bsFleetSpec`, `undefined: bsTotalCells`, `undefined: bsCell`, `undefined: bsSize`, `undefined: bsInBounds`.

- [ ] **Step 3 : Écrire les constantes, les types et `bsInBounds`**

Créer `battleship.go`.

```go
package main

import "math/rand"

// ============================================================
// BATAILLE NAVALE — LOGIQUE PURE
// ============================================================

const bsSize = 8

// Encodage d'une case de la grille de tirs d'une joueuse.
const (
	bsUnknown = 0 // jamais tirée
	bsMiss    = 1 // tir tombé à l'eau
	bsHit     = 2 // tir qui a touché un bateau
)

// La flotte, identique pour les deux joueuses. Les deux bateaux de 3 cases
// portent des noms distincts : ils sont annoncés à la tireuse quand ils
// coulent, « Croiseur coulé » doit désigner un bateau précis.
var bsFleetSpec = []struct {
	Name string
	Size int
}{
	{"Porte-avions", 4},
	{"Croiseur", 3},
	{"Sous-marin", 3},
	{"Torpilleur", 2},
}

// bsTotalCells est la somme des tailles de bsFleetSpec. Écrite en dur parce
// qu'une constante ne peut pas sommer un slice, et tenue d'accord avec la spec
// par TestBsFleetSpecSizes.
const bsTotalCells = 12

type bsCell struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

type bsShip struct {
	Name  string
	Cells []bsCell
	Hits  int
}

func bsInBounds(c bsCell) bool {
	return c.Row >= 0 && c.Row < bsSize && c.Col >= 0 && c.Col < bsSize
}
```

- [ ] **Step 4 : Lancer les tests et constater le succès**

Run: `go test -run 'TestBsFleetSpecSizes|TestBsInBounds' -v ./...`
Expected: `PASS` sur les 2 tests.

#### Deuxième cycle : le placement aléatoire

- [ ] **Step 5 : Écrire les tests de la flotte aléatoire**

Ajouter à `battleship_test.go`.

```go
// bsFleetCells aplatit une flotte en une liste de cases, pour les tests qui
// raisonnent sur l'occupation sans se soucier du découpage par bateau.
func bsFleetCells(fleet []bsShip) []bsCell {
	var cells []bsCell
	for _, s := range fleet {
		cells = append(cells, s.Cells...)
	}
	return cells
}

// bsShipIsStraight vérifie qu'un bateau est aligné et contigu : même ligne et
// colonnes consécutives, ou même colonne et lignes consécutives. L'ordre des
// cellules suit le sens de la pose, depuis l'origine du bateau.
func bsShipIsStraight(s bsShip) bool {
	if len(s.Cells) == 0 {
		return false
	}
	first := s.Cells[0]
	horizontal, vertical := true, true
	for i, c := range s.Cells {
		if c.Row != first.Row || c.Col != first.Col+i {
			horizontal = false
		}
		if c.Col != first.Col || c.Row != first.Row+i {
			vertical = false
		}
	}
	return horizontal || vertical
}

// bsMaxDraws : le placement est aléatoire, un bug de chevauchement ou de
// débordement peut donc n'apparaître que sur une configuration rare. On tire un
// grand nombre de flottes plutôt qu'une seule, sinon le test passerait la
// plupart du temps et échouerait au hasard en intégration continue.
const bsMaxDraws = 500

func TestBsRandomFleetMatchesSpec(t *testing.T) {
	fleet := bsRandomFleet()
	if len(fleet) != len(bsFleetSpec) {
		t.Fatalf("%d bateaux, attendu %d", len(fleet), len(bsFleetSpec))
	}
	for i, spec := range bsFleetSpec {
		if fleet[i].Name != spec.Name {
			t.Errorf("bateau %d nommé %q, attendu %q", i, fleet[i].Name, spec.Name)
		}
		if len(fleet[i].Cells) != spec.Size {
			t.Errorf("%s occupe %d cases, attendu %d", spec.Name, len(fleet[i].Cells), spec.Size)
		}
		if fleet[i].Hits != 0 {
			t.Errorf("%s démarre avec %d touches, attendu 0", spec.Name, fleet[i].Hits)
		}
	}
	if got := len(bsFleetCells(fleet)); got != bsTotalCells {
		t.Fatalf("flotte de %d cases, attendu bsTotalCells = %d", got, bsTotalCells)
	}
}

func TestBsRandomFleetStaysInBounds(t *testing.T) {
	for draw := 0; draw < bsMaxDraws; draw++ {
		for _, c := range bsFleetCells(bsRandomFleet()) {
			if !bsInBounds(c) {
				t.Fatalf("tirage %d : case hors grille %+v", draw, c)
			}
		}
	}
}

func TestBsRandomFleetNeverOverlaps(t *testing.T) {
	for draw := 0; draw < bsMaxDraws; draw++ {
		seen := map[bsCell]string{}
		for _, s := range bsRandomFleet() {
			for _, c := range s.Cells {
				if other, dup := seen[c]; dup {
					t.Fatalf("tirage %d : %s et %s se chevauchent en %+v", draw, other, s.Name, c)
				}
				seen[c] = s.Name
			}
		}
	}
}

// Sans ce test, un bug de placement pourrait produire un bateau en escalier
// dont la longueur serait pourtant correcte.
func TestBsRandomFleetShipsAreStraight(t *testing.T) {
	for draw := 0; draw < bsMaxDraws; draw++ {
		for _, s := range bsRandomFleet() {
			if !bsShipIsStraight(s) {
				t.Fatalf("tirage %d : %s n'est ni aligné ni contigu, cases %+v", draw, s.Name, s.Cells)
			}
		}
	}
}

func TestBsFallbackFleetIsValid(t *testing.T) {
	// Le repli de bsRandomFleet est inatteignable : ce test est le seul endroit
	// qui l'exécute, et le seul qui empêche du code mort de pourrir.
	fleet := bsFallbackFleet()
	if len(fleet) != len(bsFleetSpec) {
		t.Fatalf("%d bateaux dans le repli, attendu %d", len(fleet), len(bsFleetSpec))
	}
	var seen [bsSize][bsSize]bool
	for i, spec := range bsFleetSpec {
		if fleet[i].Name != spec.Name || len(fleet[i].Cells) != spec.Size {
			t.Fatalf("repli : bateau %d = %q/%d cases, attendu %q/%d", i, fleet[i].Name, len(fleet[i].Cells), spec.Name, spec.Size)
		}
		if !bsShipIsStraight(fleet[i]) {
			t.Fatalf("repli : %s n'est pas aligné et contigu : %v", spec.Name, fleet[i].Cells)
		}
		for _, c := range fleet[i].Cells {
			if !bsInBounds(c) {
				t.Fatalf("repli : %s sort de la grille en (%d,%d)", spec.Name, c.Row, c.Col)
			}
			if seen[c.Row][c.Col] {
				t.Fatalf("repli : chevauchement en (%d,%d)", c.Row, c.Col)
			}
			seen[c.Row][c.Col] = true
		}
	}
}
```

- [ ] **Step 6 : Lancer les tests et constater l'échec**

Run: `go test -run 'TestBsRandomFleet|TestBsFallbackFleet' ./...`
Expected: échec de compilation — `undefined: bsRandomFleet`, `undefined: bsFallbackFleet`.

- [ ] **Step 7 : Implémenter le placement aléatoire**

Ajouter à `battleship.go`.

```go
// bsFleetAttempts borne les reprises de tirage d'une flotte entière. La borne
// est inatteignable en pratique — 12 cases sur 64, avec énumération des
// positions valides, aboutit au premier essai — mais elle interdit toute boucle
// infinie si la flotte grossissait un jour.
const bsFleetAttempts = 100

// bsRandomFleet place les 4 bateaux au hasard, sans chevauchement. Les bateaux
// peuvent se toucher (règle classique, décision du spec).
//
// Pour chaque bateau, on ÉNUMÈRE toutes les positions encore valides puis on en
// tire une uniformément, plutôt que de tirer une position au hasard et de
// recommencer si elle est occupée. Deux raisons : le tirage est réellement
// uniforme, et il ne peut pas boucler quand la grille se remplit. L'énumération
// coûte au plus 8×8×2 = 128 candidates par bateau, soit rien.
func bsRandomFleet() []bsShip {
	for attempt := 0; attempt < bsFleetAttempts; attempt++ {
		if fleet, ok := bsTryFleet(); ok {
			return fleet
		}
	}
	// Inatteignable : voir bsFleetAttempts. On rend tout de même une flotte
	// valide plutôt que de paniquer — il n'existe aucun panic ailleurs dans ce
	// serveur, et une flotte incomplète rendrait la partie injouable en silence.
	return bsFallbackFleet()
}

// bsTryFleet tente un placement complet. ok vaut false si un bateau n'a aucune
// position libre, ce qui invite l'appelante à retirer toute la flotte.
func bsTryFleet() ([]bsShip, bool) {
	var occupied [bsSize][bsSize]bool
	fleet := make([]bsShip, 0, len(bsFleetSpec))

	for _, spec := range bsFleetSpec {
		options := bsPlacements(&occupied, spec.Size)
		if len(options) == 0 {
			return nil, false
		}
		cells := options[rand.Intn(len(options))]
		for _, c := range cells {
			occupied[c.Row][c.Col] = true
		}
		fleet = append(fleet, bsShip{Name: spec.Name, Cells: cells})
	}
	return fleet, true
}

// bsPlacements énumère tous les emplacements possibles d'un bateau de la taille
// donnée, horizontaux et verticaux, qui ne heurtent aucune case déjà occupée.
// Les cases retournées sont ordonnées depuis l'origine du bateau, ce dont
// dépend la vérification de contiguïté des tests.
func bsPlacements(occupied *[bsSize][bsSize]bool, size int) [][]bsCell {
	var options [][]bsCell
	for row := 0; row < bsSize; row++ {
		for col := 0; col < bsSize; col++ {
			for _, horizontal := range []bool{true, false} {
				cells, ok := bsRun(row, col, size, horizontal)
				if !ok {
					continue
				}
				free := true
				for _, c := range cells {
					if occupied[c.Row][c.Col] {
						free = false
						break
					}
				}
				if free {
					options = append(options, cells)
				}
			}
		}
	}
	return options
}

// bsRun construit les cases d'un bateau partant de (row, col). ok vaut false si
// le bateau sortirait de la grille.
func bsRun(row, col, size int, horizontal bool) ([]bsCell, bool) {
	cells := make([]bsCell, 0, size)
	for i := 0; i < size; i++ {
		c := bsCell{Row: row, Col: col}
		if horizontal {
			c.Col += i
		} else {
			c.Row += i
		}
		if !bsInBounds(c) {
			return nil, false
		}
		cells = append(cells, c)
	}
	return cells, true
}

// bsFallbackFleet est un placement valide et déterministe, un bateau par ligne.
// Il n'est utilisé que sur le chemin inatteignable de bsRandomFleet.
func bsFallbackFleet() []bsShip {
	fleet := make([]bsShip, 0, len(bsFleetSpec))
	for i, spec := range bsFleetSpec {
		cells, _ := bsRun(i, 0, spec.Size, true)
		fleet = append(fleet, bsShip{Name: spec.Name, Cells: cells})
	}
	return fleet
}
```

- [ ] **Step 8 : Lancer les tests et constater le succès**

Run: `go test -run 'TestBsRandomFleet|TestBsFallbackFleet' -v ./...`
Expected: `PASS` sur les 5 tests.

#### Troisième cycle : le tir

- [ ] **Step 9 : Écrire les tests du tir et de l'adjacence**

Ajouter à `battleship_test.go`. Les flottes sont construites **à la main** : un test de tir ne doit dépendre d'aucun tirage.

```go
// bsHandFleet est une flotte fixe et connue, pour les tests de tir.
// Les cellules sont écrites {ligne, colonne}.
func bsHandFleet() []bsShip {
	return []bsShip{
		{Name: "Porte-avions", Cells: []bsCell{{0, 0}, {0, 1}, {0, 2}, {0, 3}}},
		{Name: "Croiseur", Cells: []bsCell{{2, 0}, {2, 1}, {2, 2}}},
		{Name: "Sous-marin", Cells: []bsCell{{0, 7}, {1, 7}, {2, 7}}},
		{Name: "Torpilleur", Cells: []bsCell{{7, 6}, {7, 7}}},
	}
}

func TestBsFireOutOfBoundsChangesNothing(t *testing.T) {
	fleet := bsHandFleet()
	var shots [bsSize][bsSize]int
	for _, c := range []bsCell{{-1, 0}, {0, -1}, {bsSize, 0}, {0, bsSize}} {
		if _, _, ok := bsFire(fleet, &shots, c); ok {
			t.Errorf("tir accepté hors grille en %+v", c)
		}
	}
	if fleet[0].Hits != 0 {
		t.Fatal("un tir hors grille a muté la flotte")
	}
}

func TestBsFireRejectsRepeatedCell(t *testing.T) {
	fleet := bsHandFleet()
	var shots [bsSize][bsSize]int
	target := bsCell{5, 5} // case vide

	if _, _, ok := bsFire(fleet, &shots, target); !ok {
		t.Fatal("premier tir refusé")
	}
	if _, _, ok := bsFire(fleet, &shots, target); ok {
		t.Fatal("second tir sur la même case accepté : une joueuse pourrait rejouer indéfiniment")
	}
}

func TestBsFireMissMarksWater(t *testing.T) {
	fleet := bsHandFleet()
	var shots [bsSize][bsSize]int
	result, sunk, ok := bsFire(fleet, &shots, bsCell{5, 5})
	if !ok || result != "miss" || sunk != "" {
		t.Fatalf("tir à l'eau : result=%q sunk=%q ok=%v", result, sunk, ok)
	}
	if shots[5][5] != bsMiss {
		t.Fatalf("grille de tirs = %d, attendu bsMiss", shots[5][5])
	}
}

func TestBsFireHitMarksAndCounts(t *testing.T) {
	fleet := bsHandFleet()
	var shots [bsSize][bsSize]int
	result, sunk, ok := bsFire(fleet, &shots, bsCell{0, 0})
	if !ok || result != "hit" || sunk != "" {
		t.Fatalf("tir qui touche : result=%q sunk=%q ok=%v", result, sunk, ok)
	}
	if shots[0][0] != bsHit {
		t.Fatalf("grille de tirs = %d, attendu bsHit", shots[0][0])
	}
	if fleet[0].Hits != 1 {
		t.Fatalf("Porte-avions à %d touches, attendu 1", fleet[0].Hits)
	}
}

// Le dernier tir sur un bateau doit annoncer "sunk" ET son nom : le front
// affiche « Tu as coulé le Torpilleur ! ».
func TestBsFireSunkReportsShipName(t *testing.T) {
	fleet := bsHandFleet()
	var shots [bsSize][bsSize]int

	if result, _, _ := bsFire(fleet, &shots, bsCell{7, 6}); result != "hit" {
		t.Fatalf("première case du Torpilleur : result=%q, attendu hit", result)
	}
	result, sunk, ok := bsFire(fleet, &shots, bsCell{7, 7})
	if !ok || result != "sunk" {
		t.Fatalf("dernière case du Torpilleur : result=%q ok=%v, attendu sunk", result, ok)
	}
	if sunk != "Torpilleur" {
		t.Fatalf("bateau coulé nommé %q, attendu \"Torpilleur\"", sunk)
	}
}

func TestBsShipAtFindsShipsAndNilOnWater(t *testing.T) {
	fleet := bsHandFleet()
	if s := bsShipAt(fleet, bsCell{5, 5}); s != nil {
		t.Fatalf("case vide attribuée à %q", s.Name)
	}
	s := bsShipAt(fleet, bsCell{2, 1})
	if s == nil || s.Name != "Croiseur" {
		t.Fatalf("case (2,1) attribuée à %v, attendu Croiseur", s)
	}
}

// bsAllSunk pin le seuil de victoire : il ne doit pas se déclencher avant la
// dernière case, sinon une manche se terminerait trop tôt.
func TestBsAllSunkOnlyAtTotalCells(t *testing.T) {
	fleet := bsHandFleet()
	var shots [bsSize][bsSize]int
	cells := bsFleetCells(fleet)
	if len(cells) != bsTotalCells {
		t.Fatalf("flotte de test à %d cases, attendu %d", len(cells), bsTotalCells)
	}

	for i, c := range cells {
		if bsAllSunk(fleet) {
			t.Fatalf("flotte déclarée coulée après %d tirs sur %d", i, len(cells))
		}
		if _, _, ok := bsFire(fleet, &shots, c); !ok {
			t.Fatalf("tir refusé en %+v", c)
		}
	}
	if !bsAllSunk(fleet) {
		t.Fatalf("flotte non coulée après ses %d cases", len(cells))
	}
}

func TestBsAdjacentShipsAreAllowed(t *testing.T) {
	// Décision explicite du design : les bateaux peuvent se toucher (règle
	// classique). Le test porte sur l'énumération des positions, là où la règle
	// vivrait si on la durcissait — et non sur un tirage : exiger qu'un tirage
	// précis produise deux bateaux collés dépendrait du hasard.
	var occupied [bsSize][bsSize]bool
	for col := 0; col < 4; col++ {
		occupied[0][col] = true // porte-avions posé ligne 0, colonnes 0..3
	}

	glued := []bsCell{{1, 0}, {1, 1}, {1, 2}} // collé sous le porte-avions
	found := false
	for _, option := range bsPlacements(&occupied, len(glued)) {
		same := len(option) == len(glued)
		for i := range option {
			if !same || option[i] != glued[i] {
				same = false
				break
			}
		}
		if same {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("position collée au bateau précédent absente des candidates, or les bateaux adjacents sont autorisés")
	}

	// Conséquence : une flotte aux bateaux jointifs est jouable, et couler l'un
	// ne touche pas son voisin.
	fleet := []bsShip{
		{Name: "Croiseur", Cells: []bsCell{{0, 0}, {0, 1}, {0, 2}}},
		{Name: "Torpilleur", Cells: []bsCell{{1, 0}, {1, 1}}},
	}
	var shots [bsSize][bsSize]int
	if _, _, ok := bsFire(fleet, &shots, bsCell{1, 0}); !ok {
		t.Fatal("tir refusé sur le torpilleur jointif")
	}
	result, sunkName, ok := bsFire(fleet, &shots, bsCell{1, 1})
	if !ok || result != "sunk" || sunkName != "Torpilleur" {
		t.Fatalf("result=%q sunkName=%q ok=%v, attendu le torpilleur coulé", result, sunkName, ok)
	}
	if s := bsShipAt(fleet, bsCell{0, 0}); s == nil || s.Hits != 0 {
		t.Fatal("le croiseur voisin a encaissé les tirs destinés au torpilleur")
	}
	if bsAllSunk(fleet) {
		t.Fatal("flotte déclarée détruite alors que le croiseur est intact")
	}
}
```

- [ ] **Step 10 : Lancer les tests et constater l'échec**

Run: `go test -run 'TestBsFire|TestBsShipAt|TestBsAllSunk|TestBsAdjacent' ./...`
Expected: échec de compilation — `undefined: bsFire`, `undefined: bsShipAt`, `undefined: bsAllSunk`.

- [ ] **Step 11 : Implémenter le tir**

Ajouter à `battleship.go`.

```go
func bsSunk(s *bsShip) bool { return s.Hits >= len(s.Cells) }

func bsAllSunk(fleet []bsShip) bool {
	for i := range fleet {
		if !bsSunk(&fleet[i]) {
			return false
		}
	}
	return true
}

// bsShipAt retourne le bateau occupant la case, ou nil. Le pointeur vise
// l'élément du slice reçu : l'appelante peut incrémenter ses touches.
func bsShipAt(fleet []bsShip, c bsCell) *bsShip {
	for i := range fleet {
		for _, cell := range fleet[i].Cells {
			if cell == c {
				return &fleet[i]
			}
		}
	}
	return nil
}

// bsFire applique un tir. fleet est la flotte de la CIBLE, shots la grille de
// tirs de la TIREUSE — les deux appartiennent à des joueuses différentes.
//
// ok vaut false, sans rien muter, si la case est hors grille ou déjà tirée :
// c'est ce qui interdit de rejouer sur une case connue. result vaut "miss",
// "hit" ou "sunk" ; sunkName ne porte un nom que sur "sunk".
func bsFire(fleet []bsShip, shots *[bsSize][bsSize]int, c bsCell) (string, string, bool) {
	if !bsInBounds(c) || shots[c.Row][c.Col] != bsUnknown {
		return "", "", false
	}

	ship := bsShipAt(fleet, c)
	if ship == nil {
		shots[c.Row][c.Col] = bsMiss
		return "miss", "", true
	}

	shots[c.Row][c.Col] = bsHit
	ship.Hits++
	if bsSunk(ship) {
		return "sunk", ship.Name, true
	}
	return "hit", "", true
}
```

- [ ] **Step 12 : Lancer toute la suite**

Run: `gofmt -l . && go vet ./... && go clean -testcache && go test -race ./... -v`
Expected: `gofmt` et `go vet` silencieux, tous les tests `PASS`, y compris les tests préexistants du Puissance 4, de la course et de la session.

- [ ] **Step 13 : Commit**

```bash
git add battleship.go battleship_test.go
git commit -m "feat: logique pure de la bataille navale en Go"
```

Le message de commit rapporte la sortie de `go test -race ./...`.

---
### Task 2 : Bataille navale en ligne côté Go

**Files:**
- Modify: `battleship.go`
- Modify: `battleship_test.go`

**Interfaces:**
- Consumes (tâche 1) : `bsSize`, `bsTotalCells`, `bsUnknown`, `bsMiss`, `bsHit`, `bsFleetSpec`, `bsCell`, `bsShip`, `bsInBounds`, `bsRandomFleet`, `bsShipAt`, `bsSunk`, `bsAllSunk`, `bsFire`.
- Consumes (existant, **à ne pas modifier**) : `Game` (`Start(r *Room)`, `Action(r *Room, p *Player, raw json.RawMessage)`), `Room.State any`, `Room.Opponent(p) *Player`, `Player.Index`, `Player.Name`, `sendEvent(p, event, payload)`, `gameKinds`.
- Consumes (helpers de test existants) : `resetHub()`, `join(game, variant, name)`, `expectEvent(t, p, name)`, `expectNoEvent(t, p)`, `act(t, r, p, payload)`.
- Produces : `bsSide`, `bsRoom`, `bsShipView`, `bsSelfView`, `bsEnemyView`, `bsShot`, `bsStateMsg`, `BsStartMsg`, `BsStateEvent`, `battleshipGame`, `(*bsRoom).viewFor(idx int)`, `(*bsRoom).startRound(starter int)`, `bsSendViews(r, s)`, et le helper de test `joinBattleship(t)`.

Cette tâche est **entièrement vérifiable par `go test`**. Aucune vérification navigateur.

⚠️ `battleshipGame` **n'implémente pas** `VariantGame` : une seule file d'attente, de clé `battleship`.

- [ ] **Step 1 : Écrire le test de confidentialité — AVANT toute implémentation**

C'est la contrainte qui **définit** ce design, elle vient donc en premier. Ajouter à `battleship_test.go`.

Trois propriétés sont épinglées, et la formulation de la première mérite une explication : on ne compare **pas** les cases reçues à la flotte adverse. Deux flottes vivent sur des grilles distinctes, la case (0,0) peut donc appartenir légitimement à ma flotte *et* à la sienne — une comparaison directe produirait des faux positifs. La propriété juste est : **toute case apparaissant sous `enemy` doit être une case que j'ai réellement tirée**. Elle est plus forte et sans ambiguïté.

```go
// bsCollectCells parcourt récursivement une structure JSON décodée et retourne
// toutes les paires {row, col} qu'elle contient, à n'importe quelle profondeur.
// Passer par une map plutôt que par les structs Go est ce qui rend le test
// insensible au transport : il verrait une fuite réintroduite par un champ
// ajouté, un type différent, ou un broadcast employé par erreur.
func bsCollectCells(v any) []bsCell {
	var out []bsCell
	switch t := v.(type) {
	case map[string]any:
		row, hasRow := t["row"].(float64)
		col, hasCol := t["col"].(float64)
		if hasRow && hasCol {
			out = append(out, bsCell{Row: int(row), Col: int(col)})
		}
		for _, sub := range t {
			out = append(out, bsCollectCells(sub)...)
		}
	case []any:
		for _, sub := range t {
			out = append(out, bsCollectCells(sub)...)
		}
	}
	return out
}

// bsKeys retourne les clés d'un objet JSON décodé, triées.
func bsKeys(t *testing.T, v any) []string {
	t.Helper()
	obj, ok := v.(map[string]any)
	if !ok {
		t.Fatalf("objet attendu, reçu %T", v)
	}
	keys := make([]string, 0, len(obj))
	for k := range obj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// bsStateOf décode le champ "state" d'un event et le retourne en map.
func bsStateOf(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var env map[string]any
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("JSON illisible: %v (data=%s)", err, raw)
	}
	st, ok := env["state"].(map[string]any)
	if !ok {
		t.Fatalf("clé \"state\" absente de %s", raw)
	}
	return st
}

// bsFiredCells retourne les cases que cette joueuse a réellement tirées, lues
// dans l'état SERVEUR — jamais dans le flux, qui est précisément ce qu'on audite.
func bsFiredCells(t *testing.T, r *Room, idx int) map[bsCell]bool {
	t.Helper()
	s, ok := r.State.(*bsRoom)
	if !ok {
		t.Fatalf("état de room absent ou d'un autre jeu: %T", r.State)
	}
	fired := map[bsCell]bool{}
	for row := 0; row < bsSize; row++ {
		for col := 0; col < bsSize; col++ {
			if s.Sides[idx].Shots[row][col] != bsUnknown {
				fired[bsCell{Row: row, Col: col}] = true
			}
		}
	}
	return fired
}

// assertEnemyViewIsClean est le cœur de l'audit de confidentialité.
func assertEnemyViewIsClean(t *testing.T, label string, state map[string]any, fired map[bsCell]bool) {
	t.Helper()

	// Propriété B : la forme de la vue adverse est verrouillée. Un champ
	// ajouté plus tard échoue ici plutôt que de passer inaperçu.
	enemy, ok := state["enemy"]
	if !ok {
		t.Fatalf("%s: clé \"enemy\" absente", label)
	}
	want := []string{"hits", "misses", "remaining", "sunkShips"}
	if got := bsKeys(t, enemy); !reflect.DeepEqual(got, want) {
		t.Fatalf("%s: clés de enemy = %v, attendu %v — un champ ajouté ici peut révéler la flotte adverse", label, got, want)
	}

	// Propriété A : aucune case non tirée ne peut apparaître côté adverse.
	for _, c := range bsCollectCells(enemy) {
		if !fired[c] {
			t.Fatalf("%s: la case %+v apparaît dans la vue adverse sans avoir été tirée — la flotte adverse fuite", label, c)
		}
	}
}

// TestBsEnemyViewNeverLeaksIntactCells vérifie sur les OCTETS RÉELLEMENT
// ENVOYÉS qu'aucune case de la flotte adverse encore intacte n'atteint le
// client. C'est la transposition, en plus fort, du test écrit pour la fuite de
// race.go : là-bas on cherchait l'absence d'une clé connue, ici on vérifie une
// PROPRIÉTÉ du fil, ce qui résiste à un changement de forme.
func TestBsEnemyViewNeverLeaksIntactCells(t *testing.T) {
	p0, p1, r := joinBattleship(t)

	// Phase placement : les deux vues partent déjà, elles doivent être propres.
	for _, tc := range []struct {
		p   *Player
		idx int
	}{{p0, 0}, {p1, 1}} {
		state := bsStateOf(t, expectEvent(t, tc.p, "start"))
		assertEnemyViewIsClean(t, "start/"+tc.p.Name, state, bsFiredCells(t, r, tc.idx))
	}

	// Le snapshot racine est verrouillé lui aussi : une fuite pourrait être
	// posée à côté de "enemy" plutôt que dedans.
	act(t, r, p0, map[string]string{"type": "ready"})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")
	act(t, r, p1, map[string]string{"type": "ready"})
	rootState := bsStateOf(t, expectEvent(t, p0, "bsState"))
	expectEvent(t, p1, "bsState")

	wantRoot := []string{"enemy", "lastShot", "over", "phase", "ready", "rematch", "round", "wins", "winner", "you", "yourTurn"}
	if got := bsKeys(t, rootState); !reflect.DeepEqual(got, wantRoot) {
		t.Fatalf("clés du snapshot = %v, attendu %v", got, wantRoot)
	}

	// Phase bataille : on tire plusieurs fois et on réaudite après chaque tir.
	s := r.State.(*bsRoom)
	shooter, shooterIdx, other := p0, 0, p1
	if s.Turn == 2 {
		shooter, shooterIdx, other = p1, 1, p0
	}
	for _, c := range []bsCell{{0, 0}, {0, 1}, {7, 7}, {3, 4}} {
		if !s.Sides[shooterIdx].Ready || s.Phase != bsBattle {
			t.Fatalf("phase inattendue %q", s.Phase)
		}
		if s.Turn != shooterIdx+1 {
			// Un tir à l'eau a passé la main : on suit le tour.
			shooter, other = other, shooter
			shooterIdx = 1 - shooterIdx
		}
		act(t, r, shooter, map[string]any{"type": "fire", "row": c.Row, "col": c.Col})
		for _, tc := range []struct {
			p   *Player
			idx int
		}{{p0, 0}, {p1, 1}} {
			state := bsStateOf(t, expectEvent(t, tc.p, "bsState"))
			assertEnemyViewIsClean(t, "bsState/"+tc.p.Name, state, bsFiredCells(t, r, tc.idx))
		}
	}
}
```

Ajouter les imports nécessaires en tête de `battleship_test.go` : `encoding/json`, `reflect`, `sort`, `testing`.

- [ ] **Step 2 : Lancer le test et constater l'échec**

Run: `go test -run 'TestBsEnemyViewNeverLeaks' ./...`
Expected: échec de compilation — `undefined: joinBattleship`, `undefined: bsRoom`, `undefined: bsBattle`.

- [ ] **Step 3 : Écrire l'état de room, les vues et le snapshot**

Ajouter à `battleship.go`. Compléter l'import : `encoding/json`, `log`, `math/rand`.

```go
// ============================================================
// BATAILLE NAVALE — JEU EN LIGNE
//
// Le serveur fait autorité. Différence structurelle avec le Puissance 4 :
// le plateau n'est PAS public, chaque joueuse reçoit une vue DIFFÉRENTE.
// broadcast n'est jamais utilisé pour l'état de jeu — voir bsSendViews.
// ============================================================

func init() {
	gameKinds["battleship"] = battleshipGame{}
}

// Phases d'une manche.
const (
	bsPlacement = "placement"
	bsBattle    = "battle"
	bsOver      = "over"
)

// bsSide est l'état d'une joueuse. Shots est la grille de SES tirs, donc de ce
// qu'elle sait de l'adversaire ; ses propres dégâts se lisent dans les Shots
// de l'autre. Aucune donnée n'est dupliquée.
type bsSide struct {
	Fleet []bsShip
	Shots [bsSize][bsSize]int
	Ready bool
}

type bsRoom struct {
	Sides    [2]bsSide
	Phase    string
	Turn     int // siège qui doit jouer (1 ou 2) ; 0 hors bataille
	Starter  int // siège qui ouvre la manche (1 ou 2)
	Over     bool
	Winner   int // 0 aucune, sinon 1 ou 2
	LastShot *bsShot
	Wins     [2]int
	Rematch  [2]bool
	Round    int
}

type bsShipView struct {
	Name  string   `json:"name"`
	Cells []bsCell `json:"cells"`
	Sunk  bool     `json:"sunk"`
}

// bsSelfView : ma propre flotte. Les positions réelles y figurent, elles sont
// à moi.
type bsSelfView struct {
	Ships  []bsShipView `json:"ships"`
	Hits   []bsCell     `json:"hits"`   // mes cases touchées
	Misses []bsCell     `json:"misses"` // tirs adverses tombés à l'eau
}

// bsEnemyView : ce que je sais de l'adversaire. AUCUN champ ne peut porter une
// case de bateau non touchée — réintroduire la fuite exigerait d'en ajouter un,
// ce que le test de confidentialité refuse.
type bsEnemyView struct {
	Hits      []bsCell `json:"hits"`
	Misses    []bsCell `json:"misses"`
	SunkShips []string `json:"sunkShips"`
	Remaining int      `json:"remaining"`
}

type bsShot struct {
	Row    int    `json:"row"`
	Col    int    `json:"col"`
	By     int    `json:"by"`     // siège de la tireuse : p.Index + 1
	Result string `json:"result"` // "miss" | "hit" | "sunk"
}

// bsStateMsg reflète bsRoom À LA MAIN : toute nouvelle propriété de bsRoom doit
// y être reportée explicitement, sinon elle n'atteint jamais le client. Le
// risque inverse est ici plus grave que sur le Puissance 4 — un champ ajouté à
// la légère peut révéler la flotte adverse.
type bsStateMsg struct {
	Phase    string      `json:"phase"`
	You      bsSelfView  `json:"you"`
	Enemy    bsEnemyView `json:"enemy"`
	YourTurn bool        `json:"yourTurn"`
	Ready    [2]bool     `json:"ready"`
	Over     bool        `json:"over"`
	Winner   int         `json:"winner"`
	LastShot *bsShot     `json:"lastShot"`
	Wins     [2]int      `json:"wins"`
	Rematch  [2]bool     `json:"rematch"`
	Round    int         `json:"round"`
}

type BsStartMsg struct {
	You      string     `json:"you"`
	Opponent string     `json:"opponent"`
	Seat     int        `json:"seat"`
	State    bsStateMsg `json:"state"`
}

type BsStateEvent struct {
	State bsStateMsg `json:"state"`
}

// bsSplitShots répartit une grille de tirs en cases touchées et cases à l'eau.
// Les tranches sont neuves à chaque appel : le payload est sérialisé puis lu
// par la pompe SSE, il ne doit rien partager de mutable avec l'état de room.
func bsSplitShots(shots *[bsSize][bsSize]int) (hits, misses []bsCell) {
	for row := 0; row < bsSize; row++ {
		for col := 0; col < bsSize; col++ {
			switch shots[row][col] {
			case bsHit:
				hits = append(hits, bsCell{Row: row, Col: col})
			case bsMiss:
				misses = append(misses, bsCell{Row: row, Col: col})
			}
		}
	}
	return hits, misses
}

// viewFor construit la vue de la joueuse d'indice idx. C'est LE point où la
// confidentialité se joue : bsEnemyView ne reçoit que ce que cette joueuse a
// découvert en tirant, jamais une case adverse encore intacte.
//
// Fleet[i].Cells est partagé et non copié : les cases d'un bateau ne changent
// plus après le placement (seul Hits évolue), et startRound remplace la flotte
// entière par une neuve. Rien de mutable ne fuit donc vers la goroutine SSE.
func (s *bsRoom) viewFor(idx int) bsStateMsg {
	me, them := &s.Sides[idx], &s.Sides[1-idx]

	self := bsSelfView{Ships: make([]bsShipView, 0, len(me.Fleet))}
	for i := range me.Fleet {
		self.Ships = append(self.Ships, bsShipView{
			Name:  me.Fleet[i].Name,
			Cells: me.Fleet[i].Cells,
			Sunk:  bsSunk(&me.Fleet[i]),
		})
	}
	// Mes dégâts se lisent dans les tirs de l'ADVERSAIRE.
	self.Hits, self.Misses = bsSplitShots(&them.Shots)

	enemy := bsEnemyView{}
	enemy.Hits, enemy.Misses = bsSplitShots(&me.Shots)
	for i := range them.Fleet {
		if bsSunk(&them.Fleet[i]) {
			// Légitime : toutes ses cases sont déjà des touches connues.
			enemy.SunkShips = append(enemy.SunkShips, them.Fleet[i].Name)
		} else {
			enemy.Remaining++
		}
	}

	return bsStateMsg{
		Phase:    s.Phase,
		You:      self,
		Enemy:    enemy,
		YourTurn: s.Phase == bsBattle && s.Turn == idx+1,
		Ready:    [2]bool{s.Sides[0].Ready, s.Sides[1].Ready},
		Over:     s.Over,
		Winner:   s.Winner,
		LastShot: s.LastShot,
		Wins:     s.Wins,
		Rematch:  s.Rematch,
		Round:    s.Round,
	}
}

// bsSendViews envoie à CHAQUE joueuse sa propre vue. Ne jamais remplacer par
// broadcast : les deux payloads sont différents, et l'un contient la flotte
// que l'autre ne doit pas voir.
func bsSendViews(r *Room, s *bsRoom) {
	for _, p := range r.Players {
		sendEvent(p, "bsState", BsStateEvent{State: s.viewFor(p.Index)})
	}
}

// startRound remet les flottes, les tirs et la phase à zéro. starter est le
// siège qui ouvrira la bataille. Wins survit à l'appel ; Round est incrémenté.
func (s *bsRoom) startRound(starter int) {
	for i := range s.Sides {
		s.Sides[i] = bsSide{Fleet: bsRandomFleet()}
	}
	s.Phase = bsPlacement
	s.Turn = 0
	s.Starter = starter
	s.Over = false
	s.Winner = 0
	s.LastShot = nil
	s.Rematch = [2]bool{}
	s.Round++
}
```

- [ ] **Step 4 : Écrire `Start`, `Action` et le helper de test**

Ajouter à `battleship.go` :

```go
type battleshipGame struct{}

func (battleshipGame) Start(r *Room) {
	s := &bsRoom{}
	s.startRound(1) // la manche 1 s'ouvre sur le siège 1
	r.State = s

	for _, p := range r.Players {
		sendEvent(p, "start", BsStartMsg{
			You:      p.Name,
			Opponent: r.Opponent(p).Name,
			Seat:     p.Index + 1,
			State:    s.viewFor(p.Index),
		})
	}
}

func (battleshipGame) Action(r *Room, p *Player, raw json.RawMessage) {
	var d struct {
		Type string `json:"type"`
		Row  int    `json:"row"`
		Col  int    `json:"col"`
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		log.Printf("[BS] action illisible de %s: %v", p.Name, err)
		return
	}

	s, ok := r.State.(*bsRoom)
	if !ok {
		return
	}

	switch d.Type {
	case "shuffle":
		bsShuffle(r, s, p)
	case "ready":
		bsReady(r, s, p)
	case "fire":
		bsPlay(r, s, p, bsCell{Row: d.Row, Col: d.Col})
	case "rematch":
		bsAskRematch(r, s, p)
	default:
		log.Printf("[BS] action de type inconnu %q de %s", d.Type, p.Name)
	}
}

// bsShuffle retire une flotte. Refusé hors placement et après verrouillage :
// sinon une joueuse pourrait déplacer ses bateaux sous les tirs adverses.
func bsShuffle(r *Room, s *bsRoom, p *Player) {
	if s.Phase != bsPlacement || s.Sides[p.Index].Ready {
		return
	}
	s.Sides[p.Index].Fleet = bsRandomFleet()
	bsSendViews(r, s)
}

// bsReady verrouille la flotte. La bataille ne commence que quand les deux
// joueuses ont validé.
func bsReady(r *Room, s *bsRoom, p *Player) {
	if s.Phase != bsPlacement {
		return
	}
	s.Sides[p.Index].Ready = true
	if s.Sides[0].Ready && s.Sides[1].Ready {
		s.Phase = bsBattle
		s.Turn = s.Starter
	}
	bsSendViews(r, s)
}

// bsPlay applique un tir. Le siège vient de p.Index, jamais de la requête :
// une joueuse ne peut donc pas tirer à la place de l'autre.
func bsPlay(r *Room, s *bsRoom, p *Player, c bsCell) {
	seat := p.Index + 1
	if s.Phase != bsBattle || s.Turn != seat {
		return
	}

	me, them := &s.Sides[p.Index], &s.Sides[1-p.Index]
	// Le nom du bateau coulé n'est pas repris ici : viewFor le recalcule dans
	// Enemy.SunkShips depuis l'état, ce qui garde le snapshot auto-réparant.
	result, _, ok := bsFire(them.Fleet, &me.Shots, c)
	if !ok {
		return // hors bornes ou case déjà tirée
	}

	s.LastShot = &bsShot{Row: c.Row, Col: c.Col, By: seat, Result: result}

	switch {
	case bsAllSunk(them.Fleet):
		s.Phase = bsOver
		s.Over = true
		s.Winner = seat
		s.Turn = 0
		s.Wins[p.Index]++
	case result == "miss":
		s.Turn = 3 - seat // à l'eau : la main passe
	}
	// Touché ou coulé sans fin de partie : Turn reste, la joueuse rejoue.

	bsSendViews(r, s)
}

// bsAskRematch enregistre l'accord d'une joueuse. La manche ne repart que
// lorsque les deux ont accepté ; le siège qui commence alterne.
func bsAskRematch(r *Room, s *bsRoom, p *Player) {
	if !s.Over {
		return
	}
	s.Rematch[p.Index] = true
	if s.Rematch[0] && s.Rematch[1] {
		s.startRound(3 - s.Starter)
	}
	bsSendViews(r, s)
}
```

Ajouter le helper de test à `battleship_test.go`, sur le modèle de `joinC4` :

```go
// joinBattleship apparie deux joueuses sur une bataille navale et consomme
// l'event "waiting". Les events "start" restent à lire par l'appelante.
func joinBattleship(t *testing.T) (*Player, *Player, *Room) {
	t.Helper()
	resetHub()
	p0, _, err := join("battleship", "", "Ludo")
	if err != nil {
		t.Fatal(err)
	}
	expectEvent(t, p0, "waiting")
	p1, r, err := join("battleship", "", "Léa")
	if err != nil {
		t.Fatal(err)
	}
	return p0, p1, r
}
```

- [ ] **Step 5 : Lancer le test de confidentialité et constater le succès**

Run: `go test -run 'TestBsEnemyViewNeverLeaks' -v ./...`
Expected: `PASS`.

- [ ] **Step 6 : Contrôle négatif du test de confidentialité**

Prouver que le test attrape réellement une fuite, plutôt que de le supposer.

Ajouter **temporairement** un champ à `bsEnemyView` et le remplir dans `viewFor` :

```go
// AJOUT TEMPORAIRE — à retirer à la fin de ce step.
type bsEnemyView struct {
	Hits      []bsCell `json:"hits"`
	Misses    []bsCell `json:"misses"`
	SunkShips []string `json:"sunkShips"`
	Remaining int      `json:"remaining"`
	Fleet     []bsShipView `json:"fleet"` // la fuite
}
```

et dans `viewFor`, après la boucle sur `them.Fleet` :

```go
	for i := range them.Fleet {
		enemy.Fleet = append(enemy.Fleet, bsShipView{Name: them.Fleet[i].Name, Cells: them.Fleet[i].Cells})
	}
```

Run: `go test -run 'TestBsEnemyViewNeverLeaks' ./...`
Expected: **FAIL**, sur les deux propriétés — le jeu de clés de `enemy` ne correspond plus, et des cases non tirées apparaissent.

Puis **retirer** l'ajout, et relancer :

Run: `go test -run 'TestBsEnemyViewNeverLeaks' ./... && git diff --stat battleship.go`
Expected: `PASS`, et le diff ne montre que le travail légitime de cette tâche.

- [ ] **Step 7 : Écrire les tests du placement**

```go
func TestBsStartAssignsSeatsAndPlacement(t *testing.T) {
	p0, p1, _ := joinBattleship(t)

	for i, p := range []*Player{p0, p1} {
		raw := expectEvent(t, p, "start")
		var msg struct {
			You      string     `json:"you"`
			Opponent string     `json:"opponent"`
			Seat     int        `json:"seat"`
			State    bsStateMsg `json:"state"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil {
			t.Fatalf("start illisible: %v", err)
		}
		if msg.Seat != i+1 {
			t.Errorf("%s a le siège %d, attendu %d", p.Name, msg.Seat, i+1)
		}
		if msg.State.Phase != bsPlacement {
			t.Errorf("%s démarre en phase %q, attendu %q", p.Name, msg.State.Phase, bsPlacement)
		}
		if len(msg.State.You.Ships) != len(bsFleetSpec) {
			t.Errorf("%s reçoit %d bateaux, attendu %d", p.Name, len(msg.State.You.Ships), len(bsFleetSpec))
		}
		if msg.State.YourTurn {
			t.Errorf("%s a la main dès le placement", p.Name)
		}
		if msg.State.Enemy.Remaining != len(bsFleetSpec) {
			t.Errorf("%s voit %d bateaux adverses à flot, attendu %d", p.Name, msg.State.Enemy.Remaining, len(bsFleetSpec))
		}
	}
}

// Les deux flottes sont tirées indépendamment : recevoir la même placerait les
// bateaux au même endroit chez les deux joueuses, ce qui trahirait la flotte
// adverse sans qu'aucun champ ne fuite.
func TestBsStartDrawsTwoIndependentFleets(t *testing.T) {
	identical := 0
	const draws = 20
	for i := 0; i < draws; i++ {
		p0, p1, r := joinBattleship(t)
		expectEvent(t, p0, "start")
		expectEvent(t, p1, "start")
		s := r.State.(*bsRoom)
		if reflect.DeepEqual(s.Sides[0].Fleet, s.Sides[1].Fleet) {
			identical++
		}
	}
	if identical == draws {
		t.Fatalf("les deux flottes sont identiques sur %d tirages : elles ne sont pas tirées indépendamment", draws)
	}
}

func TestBsShuffleChangesFleetDuringPlacement(t *testing.T) {
	p0, p1, r := joinBattleship(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	s := r.State.(*bsRoom)
	// On mélange jusqu'à obtenir une flotte différente : deux tirages
	// consécutifs peuvent coïncider, l'exiger du premier serait fragile.
	before := append([]bsShip(nil), s.Sides[0].Fleet...)
	changed := false
	for i := 0; i < 20 && !changed; i++ {
		act(t, r, p0, map[string]string{"type": "shuffle"})
		expectEvent(t, p0, "bsState")
		expectEvent(t, p1, "bsState")
		changed = !reflect.DeepEqual(before, s.Sides[0].Fleet)
	}
	if !changed {
		t.Fatal("20 mélanges n'ont jamais changé la flotte")
	}
	if s.Phase != bsPlacement {
		t.Fatalf("phase %q après mélange, attendu %q", s.Phase, bsPlacement)
	}
}

func TestBsShuffleRefusedAfterReady(t *testing.T) {
	p0, p1, r := joinBattleship(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	act(t, r, p0, map[string]string{"type": "ready"})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")

	s := r.State.(*bsRoom)
	before := append([]bsShip(nil), s.Sides[0].Fleet...)
	act(t, r, p0, map[string]string{"type": "shuffle"})
	expectNoEvent(t, p0)
	if !reflect.DeepEqual(before, s.Sides[0].Fleet) {
		t.Fatal("la flotte a changé après verrouillage : on pourrait déplacer ses bateaux sous les tirs")
	}
}

func TestBsBattleStartsOnlyWhenBothReady(t *testing.T) {
	p0, p1, r := joinBattleship(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")
	s := r.State.(*bsRoom)

	act(t, r, p0, map[string]string{"type": "ready"})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")
	if s.Phase != bsPlacement {
		t.Fatalf("la bataille a commencé avec une seule joueuse prête (phase %q)", s.Phase)
	}

	act(t, r, p1, map[string]string{"type": "ready"})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")
	if s.Phase != bsBattle {
		t.Fatalf("phase %q avec les deux prêtes, attendu %q", s.Phase, bsBattle)
	}
	if s.Turn != s.Starter {
		t.Fatalf("Turn = %d, attendu Starter = %d", s.Turn, s.Starter)
	}
}
```

- [ ] **Step 8 : Écrire les tests de la bataille**

```go
// bsReachBattle amène une room en phase bataille. Retourne les deux joueuses,
// la room, son état, et l'indice de celle qui a la main.
func bsReachBattle(t *testing.T) (*Player, *Player, *Room, *bsRoom, int) {
	t.Helper()
	p0, p1, r := joinBattleship(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")
	for _, p := range []*Player{p0, p1} {
		act(t, r, p, map[string]string{"type": "ready"})
		expectEvent(t, p0, "bsState")
		expectEvent(t, p1, "bsState")
	}
	s := r.State.(*bsRoom)
	if s.Phase != bsBattle {
		t.Fatalf("phase %q, attendu %q", s.Phase, bsBattle)
	}
	return p0, p1, r, s, s.Turn - 1
}

// bsEmptyCell trouve une case de la flotte cible qui ne porte aucun bateau,
// pour provoquer un tir à l'eau de façon déterministe.
func bsEmptyCell(t *testing.T, fleet []bsShip) bsCell {
	t.Helper()
	for row := 0; row < bsSize; row++ {
		for col := 0; col < bsSize; col++ {
			c := bsCell{Row: row, Col: col}
			if bsShipAt(fleet, c) == nil {
				return c
			}
		}
	}
	t.Fatal("aucune case vide : la flotte remplit la grille")
	return bsCell{}
}

func TestBsFireRefusedOutOfTurnAndOutOfPhase(t *testing.T) {
	p0, p1, r := joinBattleship(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	// Hors phase bataille.
	act(t, r, p0, map[string]any{"type": "fire", "row": 0, "col": 0})
	expectNoEvent(t, p0)

	players := []*Player{p0, p1}
	for _, p := range players {
		act(t, r, p, map[string]string{"type": "ready"})
		expectEvent(t, p0, "bsState")
		expectEvent(t, p1, "bsState")
	}
	s := r.State.(*bsRoom)

	// Hors tour : c'est l'autre joueuse qui tente.
	idle := players[1-(s.Turn-1)]
	act(t, r, idle, map[string]any{"type": "fire", "row": 0, "col": 0})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
}

func TestBsFireRefusedOutOfBoundsAndOnRepeatedCell(t *testing.T) {
	p0, p1, r, s, idx := bsReachBattle(t)
	players := []*Player{p0, p1}
	shooter := players[idx]

	act(t, r, shooter, map[string]any{"type": "fire", "row": 99, "col": 0})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)

	// Un tir qui touche garde la main : on peut donc retirer sur la même case.
	target := s.Sides[1-idx].Fleet[0].Cells[0]
	act(t, r, shooter, map[string]any{"type": "fire", "row": target.Row, "col": target.Col})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")

	act(t, r, shooter, map[string]any{"type": "fire", "row": target.Row, "col": target.Col})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
}

// La règle du spec : touché → on rejoue, à l'eau → la main passe.
func TestBsHitKeepsTurnAndMissPassesIt(t *testing.T) {
	p0, p1, r, s, idx := bsReachBattle(t)
	players := []*Player{p0, p1}
	shooter := players[idx]
	seat := idx + 1

	hit := s.Sides[1-idx].Fleet[0].Cells[0]
	act(t, r, shooter, map[string]any{"type": "fire", "row": hit.Row, "col": hit.Col})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")
	if s.Turn != seat {
		t.Fatalf("après un touché, Turn = %d, attendu %d : la main doit rester", s.Turn, seat)
	}
	if s.LastShot == nil || s.LastShot.Result != "hit" || s.LastShot.By != seat {
		t.Fatalf("LastShot = %+v, attendu un hit du siège %d", s.LastShot, seat)
	}

	miss := bsEmptyCell(t, s.Sides[1-idx].Fleet)
	act(t, r, shooter, map[string]any{"type": "fire", "row": miss.Row, "col": miss.Col})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")
	if s.Turn != 3-seat {
		t.Fatalf("après un tir à l'eau, Turn = %d, attendu %d : la main doit passer", s.Turn, 3-seat)
	}
}

// Couler un bateau garde la main ET annonce son nom à la tireuse.
func TestBsSinkKeepsTurnAndNamesTheShip(t *testing.T) {
	p0, p1, r, s, idx := bsReachBattle(t)
	players := []*Player{p0, p1}
	shooter := players[idx]
	seat := idx + 1

	victim := s.Sides[1-idx].Fleet[3] // Torpilleur, 2 cases : le plus court
	for _, c := range victim.Cells {
		act(t, r, shooter, map[string]any{"type": "fire", "row": c.Row, "col": c.Col})
		expectEvent(t, p0, "bsState")
		expectEvent(t, p1, "bsState")
	}
	if s.Turn != seat {
		t.Fatalf("après un coulé, Turn = %d, attendu %d", s.Turn, seat)
	}
	if s.LastShot.Result != "sunk" {
		t.Fatalf("LastShot.Result = %q, attendu sunk", s.LastShot.Result)
	}

	view := s.viewFor(idx)
	if len(view.Enemy.SunkShips) != 1 || view.Enemy.SunkShips[0] != victim.Name {
		t.Fatalf("SunkShips = %v, attendu [%q]", view.Enemy.SunkShips, victim.Name)
	}
	if view.Enemy.Remaining != len(bsFleetSpec)-1 {
		t.Fatalf("Remaining = %d, attendu %d", view.Enemy.Remaining, len(bsFleetSpec)-1)
	}
}

func TestBsWinWhenWholeFleetSunk(t *testing.T) {
	p0, p1, r, s, idx := bsReachBattle(t)
	players := []*Player{p0, p1}
	shooter := players[idx]
	seat := idx + 1

	// Tous les tirs touchent, la main ne passe donc jamais.
	for _, ship := range append([]bsShip(nil), s.Sides[1-idx].Fleet...) {
		for _, c := range ship.Cells {
			act(t, r, shooter, map[string]any{"type": "fire", "row": c.Row, "col": c.Col})
			expectEvent(t, p0, "bsState")
			expectEvent(t, p1, "bsState")
		}
	}

	if !s.Over || s.Phase != bsOver {
		t.Fatalf("Over=%v Phase=%q après les %d cases, attendu une fin de manche", s.Over, s.Phase, bsTotalCells)
	}
	if s.Winner != seat {
		t.Fatalf("Winner = %d, attendu %d", s.Winner, seat)
	}
	if s.Wins[idx] != 1 {
		t.Fatalf("Wins[%d] = %d, attendu 1", idx, s.Wins[idx])
	}
	if s.Turn != 0 {
		t.Fatalf("Turn = %d après la fin, attendu 0", s.Turn)
	}
}
```

- [ ] **Step 9 : Écrire les tests de la revanche et des actions invalides**

```go
func TestBsRematchNeedsBothPlayers(t *testing.T) {
	p0, p1, r, s, idx := bsReachBattle(t)
	players := []*Player{p0, p1}
	shooter := players[idx]

	for _, ship := range append([]bsShip(nil), s.Sides[1-idx].Fleet...) {
		for _, c := range ship.Cells {
			act(t, r, shooter, map[string]any{"type": "fire", "row": c.Row, "col": c.Col})
			expectEvent(t, p0, "bsState")
			expectEvent(t, p1, "bsState")
		}
	}

	starterBefore, roundBefore := s.Starter, s.Round

	act(t, r, p0, map[string]string{"type": "rematch"})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")
	if s.Phase != bsOver {
		t.Fatalf("la manche a repris avec un seul accord (phase %q)", s.Phase)
	}

	act(t, r, p1, map[string]string{"type": "rematch"})
	expectEvent(t, p0, "bsState")
	expectEvent(t, p1, "bsState")

	if s.Phase != bsPlacement {
		t.Fatalf("phase %q après double accord, attendu %q", s.Phase, bsPlacement)
	}
	if s.Starter != 3-starterBefore {
		t.Fatalf("Starter = %d, attendu %d : la joueuse qui commence doit alterner", s.Starter, 3-starterBefore)
	}
	if s.Round != roundBefore+1 {
		t.Fatalf("Round = %d, attendu %d", s.Round, roundBefore+1)
	}
	if s.Wins[idx] != 1 {
		t.Fatalf("Wins[%d] = %d après la relance : le score de manches doit survivre", idx, s.Wins[idx])
	}
	if s.Sides[0].Ready || s.Sides[1].Ready {
		t.Fatal("une flotte est encore verrouillée après la relance")
	}
	if s.LastShot != nil {
		t.Fatal("LastShot survit à la relance : le front rejouerait l'explosion du tir précédent")
	}
}

func TestBsRematchRefusedBeforeTheEnd(t *testing.T) {
	p0, p1, r, s, _ := bsReachBattle(t)
	act(t, r, p0, map[string]string{"type": "rematch"})
	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
	if s.Rematch[0] {
		t.Fatal("accord de revanche enregistré alors que la manche n'est pas finie")
	}
}

func TestBsIgnoresUnreadableAndUnknownActions(t *testing.T) {
	p0, p1, r := joinBattleship(t)
	expectEvent(t, p0, "start")
	expectEvent(t, p1, "start")

	r.mu.Lock()
	r.Game.Action(r, p0, json.RawMessage(`pas du json`))
	r.Game.Action(r, p0, json.RawMessage(`{"type":"nawak"}`))
	r.mu.Unlock()

	expectNoEvent(t, p0)
	expectNoEvent(t, p1)
}
```

- [ ] **Step 10 : Lancer toute la suite**

Run: `gofmt -l . && go vet ./... && go clean -testcache && go test -race ./... -v`
Expected: `gofmt` et `go vet` silencieux, tous les tests `PASS`, y compris ceux du Puissance 4, de la course et de la session.

- [ ] **Step 11 : Commit**

```bash
git add battleship.go battleship_test.go
git commit -m "feat: bataille navale en ligne cote Go, vues par joueuse"
```

Le message de commit doit dire explicitement que la confidentialité est portée par le typage de `bsEnemyView`, rapporter la sortie de `go test -race ./...`, et mentionner le résultat du contrôle négatif du step 6.

---
### Task 3 : Écran de la bataille navale et rendu par snapshot, sans réseau

**Files:**
- Create: `static/battleship.js`
- Create: `static/battleship.css`
- Modify: `static/index.html`
- Modify: `static/sw.js`

**Interfaces:**
- Consumes (existant, **à ne pas modifier**) : `screens`, `screenCleanups`, `showScreen(nom)`, `getActiveScreen()`. Tous résolus par **portée lexicale globale** : `battleship.js` doit être chargé **après `app.js`**.
- Produces : `BS_SIZE`, `BS_COLS`, `bsCellLabel(row, col)`, `renderBsSnapshot(state)`, `bsAim(row, col)`, `bsFocusCell`, `bsAimed`, `screens.battleship`, `screenCleanups.battleship`, et les ids DOM listés ci-dessous.

**Critère d'acceptation : scénario navigateur** (step 9). Aucun appel réseau dans cette tâche — les boutons pilotent un **état de démonstration local**, ce qui permet de valider l'affichage, le responsive et le clavier avant d'y brancher la session en tâche 4.

**Note de conception, écart assumé par rapport au spec.** Le spec chiffrait les cases à ~37 px à 375 px de large, sans compter de gouttière d'en-tête. Cette tâche ajoute les repères de colonnes (A–H) et de lignes (1–8), parce que le repérage dans un tableau est utile à un CM1 et que la maquette validée les montrait. La gouttière coûte environ 2 px par case : attendez donc **~35 px** et non 37. Le step 8 impose de **mesurer** et de consigner la valeur réelle. Ne pas tenter de récupérer ces pixels en réduisant les gaps sous 3 px : la grille cesserait de se lire.

- [ ] **Step 1 : Ajouter l'écran et le bouton du hub dans `index.html`**

Ajouter le bouton dans `#screen-games`, **après** `btn-connect4-online` et **avant** `btn-games-back`. ⚠️ La classe `.operation-card` est interdite : elle est bindée vers `config.operation` et fait planter `updateModesScreen()`.

```html
                <button id="btn-battleship-online" class="multi-btn bs-entry-btn">
                    <span class="multi-icon">🚢</span>
                    <span class="multi-text">
                        <span class="multi-title">Bataille navale en ligne</span>
                        <span class="multi-details">2 joueurs, chacun son écran</span>
                    </span>
                    <span class="multi-arrow">→</span>
                </button>
```

Ajouter l'écran après `#screen-connect4` :

```html
        <div id="screen-battleship" class="screen">
            <div class="bs-container">
                <span id="bs-score" class="bs-score">🚢 0 – 0 🚢</span>
                <p id="bs-status" class="bs-status">Place ta flotte</p>

                <div id="bs-grid" class="bs-grid"></div>

                <div class="bs-aim">
                    <span id="bs-aim-label" class="bs-aim-label"></span>
                    <button id="btn-bs-fire" class="bs-fire-btn" disabled>🎯 Feu !</button>
                </div>

                <div id="bs-minimap-wrap" class="bs-minimap-wrap">
                    <span class="bs-minimap-title">Ta flotte</span>
                    <div id="bs-minimap" class="bs-minimap"></div>
                </div>

                <div class="bs-actions">
                    <button id="btn-bs-shuffle" class="bs-shuffle-btn">🎲 Mélanger</button>
                    <button id="btn-bs-ready" class="bs-ready-btn">✓ Je suis prête</button>
                    <button id="btn-bs-replay" class="play-again-btn">
                        <span id="bs-replay-label">Nouvelle manche</span>
                    </button>
                    <p id="bs-rematch-status" class="bs-rematch-status"></p>
                    <button id="btn-bs-back" class="back-btn">← Retour</button>
                </div>
            </div>
        </div>
```

Ajouter le `<link>` **après** celui de `games.css`, et le `<script>` **après** celui de `games.js` :

```html
    <link rel="stylesheet" href="/battleship.css">
```
```html
    <script src="/battleship.js"></script>
```

- [ ] **Step 2 : Ajouter les deux fichiers au precache et bumper le cache**

Dans `static/sw.js` :

```js
const CACHE_NAME = 'chronomaths-v12';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/games.css',
  '/battleship.css',
  '/app.js',
  '/games.js',
  '/battleship.js',
  '/icon.svg',
  '/manifest.json'
];
```

C'est le premier plan de ce dépôt qui ajoute des fichiers statiques : sans ces deux entrées, la PWA hors ligne servirait un `index.html` qui référence des fichiers absents.

- [ ] **Step 3 : Écrire le squelette de `battleship.js` et le rendu de la grille**

Créer `static/battleship.js`.

```js
// ============================================================
// BATAILLE NAVALE EN LIGNE
// Le serveur fait autorité : le client envoie une case et n'affiche que le
// snapshot renvoyé. Il ne calcule jamais le résultat d'un tir.
// ============================================================

screens.battleship = document.getElementById('screen-battleship');

const BS_SIZE = 8;
const BS_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const bsEl = {
    score: document.getElementById('bs-score'),
    status: document.getElementById('bs-status'),
    grid: document.getElementById('bs-grid'),
    minimap: document.getElementById('bs-minimap'),
    minimapWrap: document.getElementById('bs-minimap-wrap'),
    aimLabel: document.getElementById('bs-aim-label'),
    fire: document.getElementById('btn-bs-fire'),
    shuffle: document.getElementById('btn-bs-shuffle'),
    ready: document.getElementById('btn-bs-ready'),
    replay: document.getElementById('btn-bs-replay'),
    replayLabel: document.getElementById('bs-replay-label'),
    rematchStatus: document.getElementById('bs-rematch-status'),
    back: document.getElementById('btn-bs-back')
};

// bsFocusCell est en portée MODULE et non locale au rendu : la grille est
// entièrement reconstruite à chaque snapshot, une capture locale perdrait donc
// la case focalisée entre deux rendus. Même raison que c4FocusCol.
let bsFocusCell = null;
// Case visée mais pas encore tirée, ou null. C'est le « viser » de
// « viser puis confirmer ».
let bsAimed = null;
// Dernier état rendu, pour pouvoir redessiner après une visée sans attendre un
// nouveau snapshot serveur.
let bsCurrentState = null;

// Le snapshot serveur est SYMÉTRIQUE : il ne dit pas quel siège je suis, parce
// que `ready`, `wins` et `winner` sont indexés par siège et identiques pour les
// deux joueuses. Deux drapeaux dérivés comblent ce manque, posés avant le rendu
// par applyBsState (tâche 4) et à la main par l'état de démonstration (tâche 3) :
//   state.iAmReady = state.ready[bsOnline.seat - 1]
//   state.iWon     = state.winner === bsOnline.seat

// bsCellLabel donne le repère humain d'une case : colonne en lettre, ligne
// en numéro 1-indexé. (1, 6) -> "G2".
function bsCellLabel(row, col) {
    return BS_COLS[col] + (row + 1);
}

// bsKeyOf sert de clé de Set/Map pour une case.
function bsKeyOf(cell) {
    return cell.row + ',' + cell.col;
}

function bsCellSet(cells) {
    return new Set((cells || []).map(bsKeyOf));
}
```

- [ ] **Step 4 : Écrire `renderBsSnapshot`**

Un seul chemin de rendu pour les trois phases, reconstruit depuis l'état complet.

```js
// renderBsSnapshot reconstruit TOUTE l'interface depuis l'état complet reçu.
// C'est ce qui permet aux trois phases de partager un seul chemin de rendu, et
// ce qui rend l'affichage auto-réparant si un snapshot est perdu.
function renderBsSnapshot(state) {
    bsCurrentState = state;
    const placement = state.phase === 'placement';
    // En placement, les deux boutons ne servent que tant que MA flotte n'est
    // pas verrouillée — d'où le drapeau dérivé iAmReady.
    const locked = state.iAmReady === true;

    bsEl.grid.innerHTML = '';
    bsEl.grid.appendChild(bsBuildGrid(state, placement));

    bsEl.minimapWrap.style.display = placement ? 'none' : 'block';
    if (!placement) {
        bsEl.minimap.innerHTML = '';
        bsEl.minimap.appendChild(bsBuildMinimap(state));
    }

    bsEl.shuffle.style.display = placement && !locked ? 'block' : 'none';
    bsEl.ready.style.display = placement && !locked ? 'block' : 'none';
    bsEl.replay.style.display = state.over ? 'block' : 'none';
    bsEl.aimLabel.textContent = bsAimed ? bsCellLabel(bsAimed.row, bsAimed.col) : '';
    bsEl.fire.style.display = state.phase === 'battle' ? 'block' : 'none';
    bsEl.fire.disabled = !(state.yourTurn && bsAimed);

    bsEl.status.textContent = bsStatusText(state);
    bsEl.score.textContent = `🚢 ${state.wins[0]} – ${state.wins[1]} 🚢`;

    bsRestoreFocus();
}
```

```js
// bsBuildGrid construit la grande grille : ma flotte en placement, la grille de
// tir en bataille. Les en-têtes A–H et 1–8 aident au repérage.
function bsBuildGrid(state, placement) {
    const frag = document.createDocumentFragment();

    // Coin vide, puis les lettres de colonnes.
    frag.appendChild(bsHeaderCell(''));
    for (const letter of BS_COLS) frag.appendChild(bsHeaderCell(letter));

    const myShipCells = new Map();
    for (const ship of state.you.ships || []) {
        for (const c of ship.cells) myShipCells.set(bsKeyOf(c), ship);
    }
    // Mes tirs sur l'adversaire : c'est tout ce que je sais de sa grille.
    const myHits = bsCellSet(state.enemy.hits);
    const myMisses = bsCellSet(state.enemy.misses);

    for (let row = 0; row < BS_SIZE; row++) {
        frag.appendChild(bsHeaderCell(String(row + 1)));
        for (let col = 0; col < BS_SIZE; col++) {
            const key = row + ',' + col;
            let cell;
            if (placement) {
                // Ma flotte : non cliquable, on regarde seulement.
                cell = document.createElement('div');
                cell.className = 'bs-cell';
                const ship = myShipCells.get(key);
                if (ship) cell.classList.add(ship.sunk ? 'bs-cell-sunk' : 'bs-cell-ship');
            } else {
                // Grille de tir : un bouton par case, verrouillé par le DOM.
                cell = document.createElement('button');
                cell.className = 'bs-cell bs-cell-target';
                cell.dataset.row = String(row);
                cell.dataset.col = String(col);
                cell.setAttribute('aria-label', bsCellLabel(row, col));
                if (myHits.has(key)) cell.classList.add('bs-cell-hit');
                else if (myMisses.has(key)) cell.classList.add('bs-cell-miss');
                if (bsAimed && bsAimed.row === row && bsAimed.col === col) {
                    cell.classList.add('bs-cell-aimed');
                }
                // Une case déjà tirée ou un tour qui n'est pas le mien : le
                // verrou est porté par le DOM, sans drapeau de lock.
                cell.disabled = !state.yourTurn || myHits.has(key) || myMisses.has(key);
                cell.addEventListener('click', () => bsAim(row, col));
            }
            frag.appendChild(cell);
        }
    }
    return frag;
}

function bsHeaderCell(text) {
    const el = document.createElement('span');
    el.className = 'bs-head';
    el.textContent = text;
    return el;
}

// bsBuildMinimap montre ma flotte en petit pendant la bataille : non cliquable,
// juste pour voir les dégâts reçus.
function bsBuildMinimap(state) {
    const frag = document.createDocumentFragment();
    const shipCells = new Map();
    for (const ship of state.you.ships || []) {
        for (const c of ship.cells) shipCells.set(bsKeyOf(c), ship);
    }
    const hits = bsCellSet(state.you.hits);
    const misses = bsCellSet(state.you.misses);

    for (let row = 0; row < BS_SIZE; row++) {
        for (let col = 0; col < BS_SIZE; col++) {
            const key = row + ',' + col;
            const cell = document.createElement('div');
            cell.className = 'bs-mini-cell';
            const ship = shipCells.get(key);
            if (hits.has(key)) cell.classList.add(ship && ship.sunk ? 'bs-mini-sunk' : 'bs-mini-hit');
            else if (ship) cell.classList.add('bs-mini-ship');
            else if (misses.has(key)) cell.classList.add('bs-mini-miss');
            frag.appendChild(cell);
        }
    }
    return frag;
}
```

- [ ] **Step 5 : Écrire le visage, le focus et le libellé d'état**

```js
// bsAim est le « viser » de « viser puis confirmer ». Les cases font ~35 px sur
// téléphone, sous le seuil tactile de 44 px : sans cette confirmation, un doigt
// qui glisse coûterait un tour.
function bsAim(row, col) {
    bsAimed = { row, col };
    bsFocusCell = { row, col };
    if (bsCurrentState) renderBsSnapshot(bsCurrentState);
}

// bsRestoreFocus rend le focus à la case mémorisée après la reconstruction de
// la grille. L'heuristique « le focus est sur <body> » peut être fausse
// (chargement de page, focus perdu ailleurs) : on ne restaure donc que si la
// case existe encore et reste utilisable.
function bsRestoreFocus() {
    if (!bsFocusCell) return;
    const sel = `.bs-cell-target[data-row="${bsFocusCell.row}"][data-col="${bsFocusCell.col}"]`;
    const cell = bsEl.grid.querySelector(sel);
    if (cell && !cell.disabled && document.activeElement === document.body) {
        cell.focus();
    }
}

function bsStatusText(state) {
    if (state.phase === 'placement') {
        if (state.iAmReady) return '⏳ En attente de ton adversaire…';
        return 'Place ta flotte, puis valide';
    }
    if (state.over) {
        return state.iWon ? '🏆 Tu gagnes !' : '😢 Ton adversaire gagne !';
    }
    return state.yourTurn ? '🎯 À toi de tirer !' : '⏳ Au tour de ton adversaire';
}
```

`bsStatusText` s'appuie sur les deux drapeaux dérivés déclarés au step 3 : `iAmReady` et `iWon`. `renderBsSnapshot` les consomme déjà, il n'y a rien à ajouter.

- [ ] **Step 6 : Câbler les boutons sur un état de démonstration**

Cette tâche ne parle pas au serveur. Les boutons modifient un état local, ce qui suffit à valider les trois phases à l'écran.

```js
// ------------------------------------------------------------
// État de démonstration — remplacé par la session en tâche 4.
// Il existe pour valider l'affichage, le responsive et le clavier sans serveur.
// ------------------------------------------------------------
function bsDemoState(phase) {
    const ships = [
        { name: 'Porte-avions', cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }], sunk: false },
        { name: 'Croiseur', cells: [{ row: 2, col: 5 }, { row: 3, col: 5 }, { row: 4, col: 5 }], sunk: false },
        { name: 'Sous-marin', cells: [{ row: 1, col: 2 }, { row: 2, col: 2 }, { row: 3, col: 2 }], sunk: false },
        { name: 'Torpilleur', cells: [{ row: 6, col: 6 }, { row: 7, col: 6 }], sunk: true }
    ];
    return {
        phase,
        you: { ships, hits: [{ row: 6, col: 6 }, { row: 7, col: 6 }], misses: [{ row: 5, col: 1 }] },
        enemy: { hits: [{ row: 3, col: 4 }, { row: 4, col: 4 }], misses: [{ row: 1, col: 1 }, { row: 6, col: 2 }], sunkShips: [], remaining: 4 },
        yourTurn: phase === 'battle',
        ready: [false, false],
        over: phase === 'over',
        winner: 0,
        lastShot: null,
        wins: [1, 0],
        rematch: [false, false],
        round: 1,
        iAmReady: false,
        iWon: true
    };
}

document.getElementById('btn-battleship-online').addEventListener('click', () => {
    bsAimed = null;
    bsFocusCell = null;
    renderBsSnapshot(bsDemoState('placement'));
    showScreen('battleship');
});

bsEl.shuffle.addEventListener('click', () => {
    // En tâche 4 : sessionSend({type:'shuffle'}).
    renderBsSnapshot(bsDemoState('placement'));
});

bsEl.ready.addEventListener('click', () => {
    // En tâche 4 : sessionSend({type:'ready'}).
    renderBsSnapshot(bsDemoState('battle'));
});

bsEl.fire.addEventListener('click', () => {
    // En tâche 4 : sessionSend({type:'fire', row, col}).
    bsAimed = null;
    renderBsSnapshot(bsDemoState('battle'));
});

bsEl.replay.addEventListener('click', () => {
    renderBsSnapshot(bsDemoState('placement'));
});

bsEl.back.addEventListener('click', () => {
    bsAimed = null;
    bsFocusCell = null;
    showScreen('games');
});

// La tâche 4 y ajoutera sessionClose().
screenCleanups.battleship = () => {
    bsAimed = null;
    bsFocusCell = null;
    bsCurrentState = null;
};
```

- [ ] **Step 7 : Écrire `battleship.css`**

```css
/* ============================================================
   BATAILLE NAVALE
   ============================================================ */

:root {
    --bs-water: #dceefb;
    --bs-water-dark: #b6ddf7;
    --bs-ship: #6b7a8f;
    --bs-hit: #ff4757;
    --bs-sunk: #2f3542;
    --bs-miss: #8fb8d8;
}

.bs-container {
    background: var(--card-bg);
    border-radius: 1.5rem;
    padding: clamp(0.75rem, 3vw, 1.5rem);
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.15),
        0 0 0 1px rgba(255, 255, 255, 0.5) inset;
    backdrop-filter: blur(10px);
}

.bs-score {
    display: block;
    text-align: center;
    font-weight: 700;
    margin-bottom: 0.5rem;
}

.bs-status {
    text-align: center;
    font-weight: 600;
    min-height: 1.75rem;
    margin-bottom: 0.75rem;
}

/* 9 colonnes : la gouttière des numéros de ligne, puis les 8 cases. */
.bs-grid {
    display: grid;
    grid-template-columns: auto repeat(8, 1fr);
    gap: 3px;
    padding: 4px;
    max-width: 420px;
    margin: 0 auto;
    background: linear-gradient(160deg, var(--bs-water), var(--bs-water-dark));
    border-radius: 0.9rem;
}

.bs-head {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-light);
    min-width: 1rem;
}

.bs-cell {
    aspect-ratio: 1;
    border: none;
    padding: 0;
    border-radius: 0.25rem;
    background: rgba(255, 255, 255, 0.75);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12);
}

.bs-cell-target {
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

/* Case non jouable : ni curseur ni indice, mais l'apparence de la grille ne
   change pas — un enfant doit continuer à lire le plateau. */
.bs-cell-target:disabled {
    cursor: default;
}

.bs-cell-target:focus-visible {
    outline: 3px solid var(--primary);
    outline-offset: 2px;
}

.bs-cell-ship { background: var(--bs-ship); }
.bs-cell-sunk { background: var(--bs-sunk); }
.bs-cell-hit  { background: var(--bs-hit); }
.bs-cell-miss { background: var(--bs-miss); }

.bs-cell-aimed {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
}

.bs-aim {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
    min-height: 44px;
}

.bs-aim-label {
    font-weight: 700;
    font-size: 1.1rem;
    min-width: 2.5rem;
    text-align: center;
}

.bs-fire-btn {
    min-height: 44px;
    padding: 0.5rem 1.25rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: white;
    background: linear-gradient(135deg, var(--c4-red, #ff4757), #ff6b81);
    border: none;
    border-radius: 0.75rem;
    cursor: pointer;
}

.bs-fire-btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.bs-minimap-wrap {
    text-align: center;
    margin-top: 0.75rem;
}

.bs-minimap-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-light);
}

.bs-minimap {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    max-width: 140px;
    margin: 0.25rem auto 0;
}

.bs-mini-cell {
    aspect-ratio: 1;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.7);
}

.bs-mini-ship { background: var(--bs-ship); }
.bs-mini-hit  { background: var(--bs-hit); }
.bs-mini-sunk { background: var(--bs-sunk); }
.bs-mini-miss { background: var(--bs-miss); }

.bs-actions {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
}

.bs-shuffle-btn,
.bs-ready-btn {
    min-height: 44px;
    padding: 0.5rem 1.25rem;
    font-size: 1rem;
    font-weight: 600;
    border: 2px solid var(--primary);
    border-radius: 0.75rem;
    background: var(--card-bg);
    color: var(--text);
    cursor: pointer;
}

.bs-rematch-status {
    min-height: 1.25rem;
    text-align: center;
    color: var(--text-light);
    font-size: 0.95rem;
    font-weight: 600;
}

/* Sur écran étroit, les 8 colonnes se disputent la largeur : on rend à la
   grille les pixels des paddings horizontaux plutôt que de rétrécir les cases.
   Le gap reste à 3px — en dessous, la grille cesse de se lire. */
@media (max-width: 480px) {
    .bs-container {
        padding-left: 0.5rem;
        padding-right: 0.5rem;
    }
}

/* ============================================================
   HOVER — pointeur fin uniquement (jamais sur tactile)
   ============================================================ */
@media (hover: hover) and (pointer: fine) {
    .bs-entry-btn:hover {
        border-color: var(--primary);
        transform: translateX(5px) scale(1.02);
    }

    /* :not(:disabled) : aucun indice sur une case déjà tirée ou hors tour. */
    .bs-cell-target:not(:disabled):hover {
        background: rgba(255, 255, 255, 1);
        box-shadow: 0 0 0 2px var(--accent) inset;
    }

    .bs-fire-btn:not(:disabled):hover {
        transform: translateY(-2px);
    }

    .bs-shuffle-btn:hover,
    .bs-ready-btn:hover {
        background: var(--primary-light);
    }
}
```

Aucune règle `prefers-reduced-motion` à écrire : `style.css:1849` est un reset **universel** (`*, *::before, *::after` avec `!important`) et couvre donc ce fichier.

- [ ] **Step 8 : Redémarrer, purger, et mesurer**

`//go:embed` fige `static/` à la compilation.

```bash
lsof -ti:8080 | xargs kill 2>/dev/null; go run .
```

Dans le navigateur : DevTools → Application → Storage → *Clear site data*, puis recharger.

Mesurer aux trois tailles imposées (320 px, 390 px, paysage 740×360) :

```js
const g = document.getElementById('bs-grid');
JSON.stringify({
  vw: innerWidth, vh: innerHeight,
  cell: +g.querySelector('.bs-cell').getBoundingClientRect().width.toFixed(1),
  fire: +document.getElementById('btn-bs-fire').getBoundingClientRect().height.toFixed(1),
  back: +document.getElementById('btn-bs-back').getBoundingClientRect().height.toFixed(1),
  overflowX: document.documentElement.scrollWidth > innerWidth
});
```

Attendu : `overflowX` **faux** aux trois tailles ; `fire` et `back` **≥ 44** ; `cell` autour de **35 px** à 375 px. Consigner les trois valeurs de `cell` dans le message de commit. Ne pas chercher à atteindre 44 px : le spec explique que c'est hors d'atteinte pour 8 colonnes.

- [ ] **Step 9 : Scénario navigateur**

⚠️ Un exécutant sans navigateur ne doit **jamais** cocher ce step ni écrire « vérifié » : il livre le code, signale que la vérification navigateur reste à faire, et laisse l'orchestrateur la dérouler.

1. Accueil → **🎮 Jeux** → le bouton **🚢 Bataille navale en ligne** est présent, après les deux du Puissance 4.
2. Le cliquer : l'écran s'affiche en phase placement — la grande grille montre une flotte, les en-têtes A–H et 1–8 sont lisibles, **« 🎲 Mélanger »** et **« ✓ Je suis prête »** sont visibles, la mini-carte est **masquée**, le bouton **« 🎯 Feu ! »** est masqué.
3. **« 🎲 Mélanger »** : la grille se redessine sans erreur console.
4. **« ✓ Je suis prête »** : passage en bataille — la grande grille devient cliquable, la **mini-carte apparaît** sous elle, « 🎯 Feu ! » apparaît **désactivé**.
5. Taper une case : elle se met en surbrillance, `bs-aim-label` affiche son repère (par exemple **« C4 »**), et **« 🎯 Feu ! »** devient actif.
6. Taper une autre case : la surbrillance suit, le repère change. C'est le rattrapage qui justifie « viser puis confirmer ».
7. **« 🎯 Feu ! »** : le tir est pris en compte, la visée se vide, le bouton redevient désactivé.
8. Une case déjà tirée (rouge ou bleue) est **non cliquable** : le vérifier au `disabled` dans l'inspecteur.
9. **Clavier** : `Tab` jusqu'à une case, `Espace` pour la viser, vérifier que le focus **reste sur la même case** après le rendu. C'est la raison d'être de la portée module de `bsFocusCell`.
10. **Survol tactile** : en mode *device toolbar*, aucun effet de survol ne doit apparaître au toucher, ni sur une case `disabled`.
11. **`prefers-reduced-motion`** : avec *Emulate CSS prefers-reduced-motion*, rien ne bouge.
12. **« ← Retour »** ramène au hub Jeux.
13. **Console vide** dans les deux sens : aucune erreur.

- [ ] **Step 10 : Commit**

```bash
git add static/battleship.js static/battleship.css static/index.html static/sw.js
git commit -m "feat: ecran et rendu de la bataille navale, sans reseau"
```

Le message de commit consigne les trois largeurs de case mesurées, et précise que le mode en ligne n'est pas encore branché.

---
### Task 4 : Brancher la bataille navale en ligne

**Files:**
- Modify: `static/battleship.js`
- Modify: `static/sw.js`

**Interfaces:**
- Consumes (tâche 3) : `BS_SIZE`, `BS_COLS`, `bsEl`, `bsCellLabel`, `renderBsSnapshot`, `bsAim`, `bsFocusCell`, `bsAimed`, `bsCurrentState`, `screens.battleship`, `screenCleanups.battleship`.
- Consumes (tâche 2, côté serveur) : jeu `battleship`, events `start` (avec `you`, `opponent`, `seat`, `state`) et `bsState` (avec `state`), actions `{type:'shuffle'}`, `{type:'ready'}`, `{type:'fire',row,col}`, `{type:'rematch'}`.
- Consumes (existant, **à ne pas modifier**) : `sessionJoin({game, operation, name, on, onLost, onError})`, `sessionSend(payload)`, `sessionClose()`, `showJoinScreen({...})`, `setWaitingStatus(texte)`, `getActiveScreen()`, `showScreen(nom)`.
- Produces : `bsOnline`, `joinBattleshipOnline(name)`, `applyBsState(state)`, `showBsLost(message)`.

**Critère d'acceptation : scénario navigateur à deux onglets** (step 7).

- [ ] **Step 1 : Remplacer l'entrée du hub par l'écran « rejoindre »**

Remplacer le gestionnaire de `btn-battleship-online` écrit en tâche 3 (qui affichait l'état de démonstration) par l'écran de jonction mutualisé.

⚠️ **Ne pas passer `waitingTilt`.** L'inclinaison à −45° de l'emoji d'attente est propre à la course de fusées ; la remonter sur `.waiting-icon` inclinerait l'emoji de tout futur jeu en ligne.

```js
document.getElementById('btn-battleship-online').addEventListener('click', () => {
    showJoinScreen({
        emojiLeft: '🚢',
        title: 'Bataille navale en ligne',
        emojiRight: '💥',
        subtitle: 'Trouve un adversaire !',
        waitingEmoji: '🚢',
        back: 'games',
        onSubmit: joinBattleshipOnline
    });
});
```

- [ ] **Step 2 : Écrire l'état en ligne et la jonction**

Remplacer le bloc « état de démonstration » de la tâche 3 par :

```js
// ------------------------------------------------------------
// MODE EN LIGNE
// Le serveur fait autorité : on envoie une case, on affiche le snapshot.
// ------------------------------------------------------------
const bsOnline = {
    seat: 0,            // 1 ou 2
    myName: '',
    opponentName: '',
    state: null,        // dernier snapshot rendu
    lost: ''            // message de fin anormale, '' si tout va bien
};

function joinBattleshipOnline(name) {
    bsOnline.seat = 0;
    bsOnline.myName = name;
    bsOnline.opponentName = '';
    bsOnline.state = null;
    bsOnline.lost = '';
    bsAimed = null;
    bsFocusCell = null;

    sessionJoin({
        game: 'battleship',
        name,
        on: {
            start: (msg) => {
                bsOnline.seat = msg.seat;
                bsOnline.opponentName = msg.opponent;
                showScreen('battleship');
                applyBsState(msg.state);
            },
            bsState: (msg) => applyBsState(msg.state),
            opponentLeft: () => showBsLost('🚪 Adversaire déconnecté')
        },
        onLost: () => showBsLost('📡 Connexion perdue'),
        onError: () => setWaitingStatus('Connexion impossible')
    });
}
```

- [ ] **Step 3 : Écrire `applyBsState` et la règle d'animation**

```js
// applyBsState pose les deux drapeaux dérivés que le snapshot symétrique ne
// porte pas, décide s'il y a lieu d'animer, puis rend.
//
// L'animation ne se déclenche que si les COORDONNÉES de lastShot ont changé
// depuis le snapshot précédemment rendu. Deux discriminants seraient faux :
//   - le nom de l'event : une demande de revanche rediffuse le même lastShot,
//     ce qui rejouerait l'explosion du tir de la manche déjà terminée ;
//   - state.round : il s'incrémente précisément sur le seul snapshot qui ne
//     doit PAS s'animer, le début d'une manche neuve.
// C'est la leçon du commit fd3cd29 sur le Puissance 4, transposée.
function applyBsState(state) {
    state.iAmReady = state.ready[bsOnline.seat - 1] === true;
    state.iWon = state.winner === bsOnline.seat;

    const previous = bsOnline.state;
    const animate = bsShotChanged(previous && previous.lastShot, state.lastShot);

    bsOnline.state = state;
    renderBsSnapshot(state);
    bsUpdateRematch(state);

    if (animate) bsAnimateShot(state.lastShot);
}

// bsShotChanged compare deux lastShot par leurs coordonnées et leur auteur.
function bsShotChanged(before, now) {
    if (!now) return false;
    if (!before) return true;
    return before.row !== now.row || before.col !== now.col || before.by !== now.by;
}

// bsAnimateShot marque brièvement la case touchée. La classe est posée sur la
// seule case du dernier tir, jamais sur toutes les cases : sinon chaque rendu
// rejouerait l'animation de l'ensemble de la grille.
function bsAnimateShot(shot) {
    const mine = shot.by === bsOnline.seat;
    const container = mine ? bsEl.grid : bsEl.minimap;
    const sel = mine
        ? `.bs-cell-target[data-row="${shot.row}"][data-col="${shot.col}"]`
        : `.bs-mini-cell:nth-child(${shot.row * BS_SIZE + shot.col + 1})`;
    const cell = container.querySelector(sel);
    if (cell) cell.classList.add('bs-cell-boom');
}
```

Ajouter à `static/battleship.css` :

```css
/* Posée sur la seule case du dernier tir. Le reset universel de style.css
   la neutralise sous prefers-reduced-motion. */
.bs-cell-boom {
    animation: bsBoom 0.4s ease-out;
}

@keyframes bsBoom {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.35); }
    100% { transform: scale(1); }
}
```

- [ ] **Step 4 : Écrire le statut de revanche et la perte de l'adversaire**

```js
// bsUpdateRematch affiche l'attente, en placement comme après la manche. Le
// snapshot porte ready[] et rematch[] pour les deux sièges : on peut donc dire
// précisément qui l'on attend.
function bsUpdateRematch(state) {
    const meIdx = bsOnline.seat - 1;
    const otherIdx = 1 - meIdx;
    const other = bsOnline.opponentName || 'ton adversaire';

    if (bsOnline.lost) {
        bsEl.replay.style.display = 'none';
        bsEl.rematchStatus.textContent = '';
        return;
    }

    if (state.phase === 'placement' && state.ready[meIdx] && !state.ready[otherIdx]) {
        bsEl.rematchStatus.textContent = `⏳ En attente de ${other}…`;
        return;
    }
    if (state.over && state.rematch[meIdx] && !state.rematch[otherIdx]) {
        bsEl.rematchStatus.textContent = `⏳ En attente de ${other}…`;
        return;
    }
    bsEl.rematchStatus.textContent = '';
}

// showBsLost verrouille la partie sur une fin anormale. Il affiche le MESSAGE
// REÇU et non un texte en dur : une déconnexion d'adversaire et une perte de
// connexion ne se disent pas de la même façon.
function showBsLost(message) {
    bsOnline.lost = message;
    sessionClose();

    if (getActiveScreen() !== 'battleship' || !bsOnline.state) {
        setWaitingStatus(message);
        return;
    }

    bsEl.status.textContent = message;
    bsEl.replay.style.display = 'none';
    bsEl.shuffle.style.display = 'none';
    bsEl.ready.style.display = 'none';
    bsEl.fire.style.display = 'none';
    bsEl.rematchStatus.textContent = '';
    // Le verrou reste porté par le DOM : on désactive toutes les cases.
    bsEl.grid.querySelectorAll('.bs-cell-target').forEach((c) => { c.disabled = true; });
}
```

- [ ] **Step 5 : Câbler les boutons sur le serveur**

Remplacer les gestionnaires de démonstration de la tâche 3. Le client n'applique **jamais** un coup lui-même : il envoie et attend le snapshot.

```js
bsEl.shuffle.addEventListener('click', () => sessionSend({ type: 'shuffle' }));
bsEl.ready.addEventListener('click', () => sessionSend({ type: 'ready' }));
bsEl.replay.addEventListener('click', () => sessionSend({ type: 'rematch' }));

bsEl.fire.addEventListener('click', () => {
    if (!bsAimed) return;
    const { row, col } = bsAimed;
    // On efface la visée tout de suite : le bouton se désactive, ce qui interdit
    // un double envoi pendant l'aller-retour, sans drapeau de lock.
    bsAimed = null;
    if (bsOnline.state) renderBsSnapshot(bsOnline.state);
    sessionSend({ type: 'fire', row, col });
});

bsEl.back.addEventListener('click', () => {
    sessionClose();
    bsAimed = null;
    bsFocusCell = null;
    showScreen('games');
});

// Nettoyage déclenché aussi par la navigation arrière du navigateur.
screenCleanups.battleship = () => {
    sessionClose();
    bsAimed = null;
    bsFocusCell = null;
    bsCurrentState = null;
    bsOnline.state = null;
};
```

Retirer aussi l'état de démonstration `bsDemoState` de la tâche 3 : il n'a plus d'usage, et le laisser laisserait croire qu'un chemin de rendu hors ligne subsiste.

- [ ] **Step 6 : Bumper le cache et redémarrer**

`static/sw.js` : `chronomaths-v12` → `chronomaths-v13`.

```bash
lsof -ti:8080 | xargs kill 2>/dev/null; go run .
```

Puis, dans **chaque** onglet : DevTools → Application → Storage → *Clear site data*, et recharger.

- [ ] **Step 7 : Scénario navigateur à deux onglets**

⚠️ Un exécutant sans navigateur ne doit **jamais** cocher ce step ni écrire « vérifié ».

**Partie normale**

1. Onglet A : Jeux → 🚢 Bataille navale en ligne → prénom « Inès » → Rejoindre. L'écran d'attente s'affiche. Vérifier dans l'inspecteur que l'emoji porte `waiting-icon` **sans** `waiting-rocket` — l'inclinaison reste propre à la fusée.
2. Onglet B : même chemin, prénom « Omar ». Les deux basculent sur le plateau en phase **placement**, chacune voyant **sa** flotte.
3. Onglet A : « 🎲 Mélanger » plusieurs fois — la flotte de A change, **celle de B est inchangée**.
4. Onglet A : « ✓ Je suis prête ». A affiche « ⏳ En attente d'Omar… », ses boutons Mélanger et Je suis prête disparaissent. B reste en placement et peut encore mélanger.
5. Onglet B : « ✓ Je suis prête ». Les deux passent en **bataille**. Une seule des deux a la main ; l'autre voit ses 64 cases `disabled`.
6. La joueuse qui a la main vise une case vide, « 🎯 Feu ! » : la case devient bleue, **la main passe** à l'autre. Vérifier que les deux onglets voient le même résultat.
7. L'autre vise une case d'un bateau (repérée sur sa mini-carte adverse par tâtonnement) : la case devient rouge et **elle garde la main**.
8. Couler un bateau entier : son nom apparaît, et la mini-carte de la victime montre ses cases en couleur « coulé ».
9. Continuer jusqu'à couler les 4 bateaux : la gagnante voit « 🏆 Tu gagnes ! », la perdante « 😢 … gagne ! ». Le score de manches s'incrémente.
10. **Revanche** : la première à cliquer « Nouvelle manche » voit « ⏳ En attente de … » ; rien ne repart. Quand la seconde clique, une manche neuve démarre en **placement**, avec des flottes **différentes**, le score conservé, et **l'autre joueuse qui ouvre** cette fois.
11. Vérifier qu'au démarrage de la manche neuve **aucune animation** de tir ne se rejoue, et qu'une simple demande de revanche n'en rejoue pas non plus.
12. **Déconnexion** : une joueuse clique « ← Retour ». L'autre voit « 🚪 Adversaire déconnecté », sa grille se verrouille, le bouton de revanche disparaît, « ← Retour » reste.

**Vérifications de sécurité — le cœur de ce jeu**

13. Dans la console de l'onglet qui **n'a pas** la main :

```js
sessionSend({type:'fire', row:0, col:0});
```

L'état ne doit **pas** bouger. Compter les cases colorées avant et après pour l'établir.

14. Dans la console de l'onglet qui **a** la main, tirer deux fois sur la même case : le second envoi doit être sans effet.

15. Émettre des actions hors phase et constater qu'aucune ne passe :

```js
sessionSend({type:'shuffle'});   // en bataille
sessionSend({type:'ready'});     // en bataille
sessionSend({type:'rematch'});   // avant la fin
```

16. **Confidentialité de la flotte.** Dans la console, avant de rejoindre, brancher l'espion SSE :

```js
window.__sse = [];
const Real = window.EventSource;
window.EventSource = function (...a) {
  const es = new Real(...a);
  const addL = es.addEventListener.bind(es);
  es.addEventListener = (type, fn, ...rest) =>
    addL(type, (e) => { window.__sse.push({type, data: e.data}); return fn(e); }, ...rest);
  return es;
};
window.EventSource.prototype = Real.prototype;
```

Puis, après quelques tirs :

```js
window.__sse.map(e => Object.keys(JSON.parse(e.data).state.enemy));
```

Attendu : **exactement** `["hits","misses","sunkShips","remaining"]` (dans un ordre quelconque) sur **tous** les snapshots. Aucune clé `ships`, `fleet` ou `cells` sous `enemy`.

Contre-vérification par comparaison : relever la flotte réelle de l'autre onglet (`bsOnline.state.you.ships`), et vérifier qu'aucune de ses cases **non encore touchée** n'apparaît dans les snapshots reçus ici.

17. **Console vide** dans les deux onglets, du début à la fin.

- [ ] **Step 8 : Commit**

```bash
git add static/battleship.js static/battleship.css static/sw.js
git commit -m "feat: bataille navale en ligne branchee, chacune son ecran"
```

Le message de commit doit rapporter le résultat du step 16 — le jeu de clés observé sous `state.enemy` — et confirmer que les actions invalides du step 13 au 15 sont restées sans effet.

---
### Task 5 : Audits sécurité et responsive, documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `static/battleship.css` (uniquement si l'audit responsive révèle un défaut)
- Modify: `static/sw.js:1` (`chronomaths-v13` → `chronomaths-v14`, **uniquement si `static/` est modifié**)

**Interfaces:**
- Consumes: l'ensemble des tâches 1 à 4.
- Produces: rien.

- [ ] **Step 1 : Audit sécurité — confidentialité de la flotte**

C'est l'audit qui compte le plus sur ce jeu. Serveur lancé (`go run .`), deux onglets, cache purgé, une partie en cours en phase `battle`.

Dans la console de l'onglet A, brancher un espion sur le flux SSE **avant** de rejoindre, pour lire les octets bruts et non l'état déjà digéré par le front :

```js
window.__sse = [];
const Real = window.EventSource;
window.EventSource = function (...a) {
  const es = new Real(...a);
  const addL = es.addEventListener.bind(es);
  es.addEventListener = (type, fn, ...rest) =>
    addL(type, (e) => { window.__sse.push({type, data: e.data}); return fn(e); }, ...rest);
  return es;
};
window.EventSource.prototype = Real.prototype;
```

Puis, une fois la bataille commencée, chasser **récursivement** toute clé suspecte à n'importe quelle profondeur :

```js
const hunt = (o, path = '') => {
  let hits = [];
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (k === 'ships' || k === 'fleet' || k === 'cells') hits.push(path + '.' + k);
    hits = hits.concat(hunt(v, path + '.' + k));
  }
  return hits;
};
window.__sse.filter(e => e.type === 'bsState')
  .map(e => hunt(JSON.parse(e.data).state.enemy));
```

Attendu : **tableau vide pour `state.enemy`** sur tous les snapshots. Les seules clés sous `enemy` doivent être `hits`, `misses`, `sunkShips` et `remaining`. `state.you.ships` porte légitimement des cellules : c'est ma flotte.

Contre-vérification par comparaison : relever la flotte réelle de l'onglet B (`state.you.ships`), puis vérifier qu'aucune de ses cellules **non encore touchée** n'apparaît nulle part dans les snapshots reçus par l'onglet A.

- [ ] **Step 2 : Audit sécurité — validation serveur**

Depuis la console, en contournant le verrou DOM, vérifier que le serveur refuse tout :

```js
sessionSend({type:'fire', row:0, col:0});      // hors de son tour
sessionSend({type:'fire', row:99, col:99});    // hors bornes
sessionSend({type:'fire', row:0, col:0});      // sur une case deja tiree
sessionSend({type:'shuffle'});                 // en phase battle
sessionSend({type:'ready'});                   // en phase battle
sessionSend({type:'rematch'});                 // avant la fin de la manche
sessionSend({type:'nawak'});                   // type inconnu
```

Attendu : **l'état ne bouge dans aucun des sept cas**. Relever le nombre de cases tirées avant et après pour l'établir, et non « à l'œil ».

- [ ] **Step 3 : Audit sécurité — sondes HTTP et surface générique**

```bash
# Coup sans identite.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/action \
  -H 'Content-Type: application/json' -d '{"type":"fire","row":0,"col":0}'
# Coup avec une identite inventee.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/action \
  -H 'X-Player-ID: deadbeefdeadbeef' -H 'Content-Type: application/json' \
  -d '{"type":"fire","row":0,"col":0}'
# Corps illisible.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d 'pas du json'
# Jeu inconnu, pour confirmer que resolveKey refuse toujours.
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/join \
  -H 'Content-Type: application/json' -d '{"game":"nawak","name":"X"}'
# Flux SSE d'un joueur inconnu.
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:8080/api/events?playerId=nawak'
```

Attendu : `400`, `400`, `400`, `400`, `404`.

Vérifier aussi par `grep` qu'aucun `innerHTML` n'est apparu dans `static/battleship.js`, et que le nom de l'adversaire est inséré par `textContent` :

```bash
grep -n "innerHTML\|outerHTML\|insertAdjacentHTML\|eval(\|new Function" static/battleship.js
```

Attendu : aucune sortie.

- [ ] **Step 4 : Audit responsive — mesures réelles**

Avec DevTools, à 320 px, 390 px et en paysage 740×360, **mesurer** et consigner les valeurs :

```js
const g = document.getElementById('bs-grid');
const c = g.querySelector('.bs-cell');
JSON.stringify({
  vw: innerWidth, vh: innerHeight,
  cell: +c.getBoundingClientRect().width.toFixed(1),
  fire: +document.getElementById('btn-bs-fire').getBoundingClientRect().height.toFixed(1),
  back: +document.getElementById('btn-bs-back').getBoundingClientRect().height.toFixed(1),
  overflowX: document.documentElement.scrollWidth > innerWidth
});
```

Attendu : `overflowX` faux aux trois tailles ; `fire` et `back` ≥ 44 px. La **case** sera autour de 37 px à 375 px : c'est documenté et assumé dans le spec, les 44 px exigeraient un écran de 429 px. **Ne pas** tenter de les atteindre en rétrécissant les gaps ou en débordant du padding du `body`. Consigner les trois valeurs mesurées dans le message de commit.

- [ ] **Step 5 : Audit responsive — le reste de la grille de contrôle**

- Tous les `:hover` sous `@media (hover: hover) and (pointer: fine)`, et jamais sur une case `disabled`. Vérifier en localisant les blocs :

```bash
grep -n "@media\|:hover" static/battleship.css
```

- `prefers-reduced-motion` : avec *Emulate CSS prefers-reduced-motion*, ni explosion ni clignotement. Rappel : `style.css:1849` est un reset **universel** (`*, *::before, *::after` en `!important`) et couvre donc `battleship.css` — il n'y a rien à re-déclarer, mais l'attente JS doit retourner 0.
- Safe-area : le bouton « ← Retour » reste atteignable en bas d'écran sur un profil iPhone.
- `grep -n "background-attachment: fixed" static/*.css` ne retourne rien.
- Focus clavier : mettre le focus sur une case, tirer, constater que le focus quitte légitimement la grille quand ce n'est plus son tour (toutes les cases passent `disabled`), puis **qu'il y revient sur la même case** quand la main revient. C'est la raison d'être de la portée module de `bsFocusCell`.

Corriger les défauts constatés dans `static/battleship.css`, puis bumper `CACHE_NAME` en `chronomaths-v14`.

- [ ] **Step 6 : Mettre à jour `README.md`**

Dans la section `### 🎮 Jeux`, après le Puissance 4, ajouter :

```markdown
#### Bataille navale en ligne

2 joueuses, chacune sur son écran. Le jeu n'existe qu'en ligne : chacune doit pouvoir cacher sa flotte à l'autre.

- Chaque joueuse saisit son prénom, la première arrivée attend une adversaire.
- Le serveur place les 4 bateaux au hasard — **Porte-avions** (4 cases), **Croiseur** (3), **Sous-marin** (3), **Torpilleur** (2). Le bouton **« 🎲 Mélanger »** retire une flotte autant de fois qu'on veut, puis **« ✓ Je suis prête »** la verrouille. La bataille commence quand les deux sont prêtes.
- On tape une case de la grille adverse, elle se met en surbrillance avec ses coordonnées, et le bouton **« 🎯 Feu ! »** tire. Cette confirmation évite qu'un doigt qui glisse gâche un tour.
- **Touché → on rejoue.** Dans l'eau → la main passe. Quand un bateau est coulé, son nom est annoncé.
- La première à couler les 4 bateaux adverses gagne. Le score de manches est conservé, et **les deux joueuses doivent cliquer sur « Nouvelle manche »** pour relancer ; la joueuse qui commence alterne.

Aucun calcul n'est demandé : c'est une récompense entre deux séries d'entraînement.
```

Vérifier aussi que l'arborescence de la section « Architecture technique » liste bien `battleship.go`, `battleship_test.go`, `static/battleship.js` et `static/battleship.css`, et que le tableau du frontend gagne ses deux lignes.

- [ ] **Step 7 : Mettre à jour `CLAUDE.md`**

Dans la section *Structure*, ajouter après `connect4_test.go` :

```
├── battleship.go     # Bataille navale : logique pure + jeu en ligne
├── battleship_test.go # Tests du plateau, du jeu en ligne et de la confidentialité
```

et dans `static/`, après `games.js` :

```
    ├── battleship.js  # Bataille navale en ligne : rendu par snapshot
    ├── battleship.css # Styles des grilles de la bataille navale
```

Dans la section *Session multijoueur générique*, ajouter :

```markdown
- ⚠️ **La bataille navale a de l'état caché**, contrairement au Puissance 4 dont le plateau est public. Son état de jeu part par `sendEvent(p, …)` avec une **vue par joueuse**, jamais par `broadcast`. La confidentialité est portée par le **typage** : `bsEnemyView` n'a aucun champ capable de contenir une case de bateau non touchée, donc réintroduire la fuite exigerait d'y ajouter un champ. C'est la leçon de `Question.Answer` dans `race.go`, où `json:"-"` fermait la fuite mais demandait de s'en souvenir. Un test de confidentialité parcourt récursivement le payload émis et échoue si une case non touchée de la flotte adverse y apparaît.
```

Créer une section *Bataille navale* sous *Section Jeux* :

```markdown
### Bataille navale

- `static/battleship.js` et `static/battleship.css` sont des fichiers **dédiés**, chargés après `app.js` dont ils résolvent les helpers par portée globale. Ils ajoutent deux entrées au precache de `sw.js` — c'est le coût assumé de ne pas gonfler `games.js`, qui atteignait déjà 509 lignes.
- Trois phases sur un seul écran `screen-battleship`, pilotées par `state.phase` (`placement` | `battle` | `over`). `renderBsSnapshot(state)` reconstruit tout depuis l'état complet.
- Le placement est **aléatoire côté serveur** : le serveur n'accepte jamais une flotte venue du client, ce qui supprime toute validation de placement triché.
- Les cases non jouables sont `disabled` : le verrou est porté par le DOM, sans drapeau de lock. Une case déjà tirée l'est aussi.
- `bsFocusCell` est en portée module, pour la même raison que `c4FocusCol` : la grille est entièrement reconstruite à chaque rendu.
- Un snapshot n'est animé que si les coordonnées de `lastShot` ont changé depuis le précédent rendu. Ni le nom de l'event (la revanche rediffuse le même `lastShot`) ni `Round` (il s'incrémente sur le snapshot qui ne doit pas s'animer) ne sont des discriminants valides.
- **Cases de ~37 px sur téléphone.** Les 44 px sont hors d'atteinte pour 8 colonnes : 352 px de cases + 21 de gaps + 24 de paddings = 397 px utiles, soit un écran de 429 px. La réponse retenue est **« viser puis confirmer »** — un tap sélectionne, le bouton « 🎯 Feu ! » de 44 px tire — et non un rétrécissement de la grille. À réévaluer si le geste s'avère pénible à l'usage.
- `bsStateMsg` reflète `bsRoom` à la main : tout nouveau champ doit y être reporté, et un champ ajouté à la légère peut révéler la flotte adverse.
```

- [ ] **Step 8 : Vérification finale complète**

Run: `gofmt -l . && go vet ./... && go clean -testcache && go test -race ./... -v`
Expected: `gofmt` et `go vet` silencieux, tous les tests `PASS`.

Puis, serveur relancé et cache purgé, dérouler une dernière fois les **six** parcours, en confirmant qu'aucune erreur n'apparaît dans la console d'aucun onglet : solo (une opération au choix), posée, course de fusées à deux onglets, Puissance 4 local, Puissance 4 en ligne à deux onglets, bataille navale à deux onglets.

Vérifier explicitement les non-régressions que ce plan promet :
- l'écran d'attente de la bataille navale porte `waiting-icon` **sans** `waiting-rocket` (l'inclinaison reste propre à la fusée) ;
- le Puissance 4 en ligne et la course fonctionnent toujours, coups joués et scores propagés ;
- `git diff main --stat` ne montre **aucune** modification de `session.go`, `race.go`, `connect4.go`, `static/app.js`, `static/games.js`, `static/games.css` ni `static/style.css`.

- [ ] **Step 9 : Commit**

```bash
git add README.md CLAUDE.md static/
git commit -m "doc: bataille navale en ligne dans README et CLAUDE.md, audits securite et responsive"
```

Le message de commit doit consigner : les codes réels des cinq sondes HTTP, les trois largeurs de case mesurées, le résultat de la chasse récursive sur `state.enemy`, et le résultat des sept refus de validation serveur.

---
## Récapitulatif des tâches

| # | Tâche | Livrable testable |
|---|---|---|
| 1 | Logique pure de la bataille navale en Go | `go test -race` vert sur `battleship_test.go` |
| 2 | Bataille navale en ligne côté Go | `go test -race` vert, dont le test de confidentialité et son contrôle négatif |
| 3 | Écran et rendu par snapshot, sans réseau | Les 3 phases à l'écran depuis un état de démonstration, cases mesurées |
| 4 | Mode en ligne branché | Partie complète à deux onglets, revanche, déconnexion, EventStream audité |
| 5 | Audits + documentation | Audits consignés, `README.md` et `CLAUDE.md` à jour |
