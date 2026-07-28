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
