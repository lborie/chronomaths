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
