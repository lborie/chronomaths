package main

import (
	"encoding/json"
	"log"
	"math/rand"
)

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

// bsShot décrit le dernier tir. SunkName ne porte un nom que sur
// Result == "sunk", et il est calculé par bsFire au moment où le tir s'applique.
//
// CE CHAMP NE RÉVÈLE RIEN, dans aucun des deux sens où bsShot part — car il part
// tel quel aux DEUX joueuses :
//   - à la tireuse, parce qu'un bateau coulé a toutes ses cases dans
//     enemy.hits : elle les a tirées une à une, elles lui sont déjà connues ;
//   - à la victime, parce que c'est son propre bateau, déjà lisible dans
//     you.ships[i] avec son nom et son drapeau sunk.
//
// Toute AUTRE addition à ce struct doit refaire cet argument pour les deux
// destinataires, sans quoi elle fuite. Pas de json:"omitempty" : le test de
// confidentialité verrouille le jeu de clés de lastShot, il ne doit pas
// dépendre du résultat du tir.
type bsShot struct {
	Row      int    `json:"row"`
	Col      int    `json:"col"`
	By       int    `json:"by"`       // siège de la tireuse : p.Index + 1
	Result   string `json:"result"`   // "miss" | "hit" | "sunk"
	SunkName string `json:"sunkName"` // bateau coulé par ce tir, "" sinon
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
	result, sunkName, ok := bsFire(them.Fleet, &me.Shots, c)
	if !ok {
		return // hors bornes ou case déjà tirée
	}

	// sunkName voyage dans le snapshot plutôt que d'être redéduit par le client.
	// Enemy.SunkShips ne peut pas servir à ça : il est construit en parcourant la
	// flotte, donc dans l'ordre de bsFleetSpec et jamais dans l'ordre
	// chronologique des coulages. Un client qui le comparerait au snapshot
	// précédent annoncerait un nom FAUX — pas seulement une annonce avalée — dès
	// qu'un snapshot intermédiaire est abandonné, ce que sendEvent fait sur canal
	// plein. Le snapshot reste ainsi absolu, sans delta.
	s.LastShot = &bsShot{Row: c.Row, Col: c.Col, By: seat, Result: result, SunkName: sunkName}

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
