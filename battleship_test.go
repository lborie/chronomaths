package main

import (
	"encoding/json"
	"reflect"
	"sort"
	"testing"
)

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

// ============================================================
// BATAILLE NAVALE EN LIGNE — TEST DE CONFIDENTIALITÉ
//
// Ce test vient AVANT toute implémentation du jeu en ligne : c'est la
// contrainte qui définit le design, pas une vérification ajoutée après coup.
// ============================================================

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

	// NOTE : le brief listait "wins" avant "winner" ; sort.Strings (bsKeys) les
	// trie par octet, et "winner"[3]='n' < "wins"[3]='s' place winner avant
	// wins. Ordre corrigé pour correspondre au tri réel — un typo dans la
	// spec, sans lien avec la confidentialité auditée par ce test.
	wantRoot := []string{"enemy", "lastShot", "over", "phase", "ready", "rematch", "round", "winner", "wins", "you", "yourTurn"}
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

// ============================================================
// BATAILLE NAVALE EN LIGNE — PLACEMENT
// ============================================================

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

// ============================================================
// BATAILLE NAVALE EN LIGNE — BATAILLE
// ============================================================

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

// ============================================================
// BATAILLE NAVALE EN LIGNE — REVANCHE ET ACTIONS INVALIDES
// ============================================================

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
