# 🧮 Chronomaths

Application web ludique pour apprendre les 4 opérations (additions, soustractions, multiplications, divisions), destinée aux élèves de CM1.

## Aperçu

Chronomaths propose des sessions chronométrées de calcul mental où l'enfant doit résoudre des additions, soustractions, multiplications ou divisions contre la montre. L'interface colorée et les animations rendent l'apprentissage amusant et motivant.

## Fonctionnalités

### Choix de l'opération

L'enfant commence par choisir l'opération qu'il souhaite travailler :
- **Additions** (+) — Calcul mental avec difficulté mixte
- **Soustractions** (−) — Calcul mental, résultat toujours positif
- **Multiplications** (×) — Tables de 2 à 10
- **Divisions** (÷) — Tables de 2 à 10, résultat exact

### Modes de jeu

Tous les modes sont disponibles pour les quatre opérations (sauf opérations posées, non disponibles pour la division).

| Mode | Durée | Calculs | Difficulté |
|------|-------|---------|------------|
| 🚀 Sprint | 5 min | 24 | Rapide |
| 🏃 Course | 10 min | 48 | Modéré |
| 🏆 Marathon | 15 min | 72 | Endurance |
| 📐 Opérations posées | — | 10 | 3 niveaux |
| 📖 Révision par table/nombre | 2 min | 18 | Ciblé |
| 🏁 Multi joueur | — | 20 pts | Course |

Le mode **🏁 Multi joueur** oppose deux joueurs, chacun sur son écran : on saisit son prénom, puis on attend un adversaire — le bouton **« ← Annuler »** permet de quitter l'attente à tout moment. La course de calcul démarre dès qu'un second joueur rejoint.

### Déroulement d'une partie

1. **Choix de l'opération** : Additions, Soustractions, Multiplications ou Divisions
2. **Choix du mode** : L'enfant sélectionne son défi (ou une table/nombre spécifique en mode Révision)
3. **Calculs** : Les opérations s'affichent une par une
4. **Feedback immédiat** : Chaque réponse est validée avec un retour visuel
5. **Fin de partie** : Quand tous les calculs sont faits OU quand le temps est écoulé

### 🎮 Jeux

Une section détente, accessible depuis l'accueil via le bouton **🎮 Jeux**.

#### Puissance 4

On clique (ou on touche) une colonne pour y laisser tomber son jeton. Le premier à aligner **4 jetons** — horizontalement, verticalement ou en diagonale — gagne : l'alignement gagnant se met à clignoter. Si le plateau se remplit sans alignement, c'est **match nul**. Deux façons d'y jouer :

- **🔴 Puissance 4** — 2 joueurs sur le même appareil, chacun son tour. Score de manches conservé, le joueur qui commence alterne à chaque nouvelle partie.
- **🌍 Puissance 4 en ligne** — 2 joueurs, chacun sur son écran. Chaque joueur saisit son prénom, le premier arrivé attend un adversaire. Le premier connecté joue 🔴 Rouge, le second 🟡 Jaune. Le score de manches est conservé et, pour relancer une manche, **les deux joueurs doivent cliquer sur « Nouvelle manche »** ; le joueur qui commence alterne.

Si un joueur quitte la partie, l'autre est prévenu et peut revenir au hub Jeux. Un joueur qui laisse simplement son onglet ouvert sans jouer bloque la partie : il n'y a pas de minuteur de tour.

#### Bataille navale en ligne

2 joueuses, chacune sur son écran. Le jeu n'existe qu'en ligne : chacune doit pouvoir cacher sa flotte à l'autre.

- Chaque joueuse saisit son prénom, la première arrivée attend une adversaire.
- Le serveur place les 4 bateaux au hasard — **Porte-avions** (4 cases), **Croiseur** (3), **Sous-marin** (3), **Torpilleur** (2). Le bouton **« 🎲 Mélanger »** retire une flotte autant de fois qu'on veut, puis **« ✓ Je suis prête »** la verrouille. La bataille commence quand les deux sont prêtes.
- On tape une case de la grille adverse, elle se met en surbrillance avec ses coordonnées, et le bouton **« 🎯 Feu ! »** tire. Cette confirmation évite qu'un doigt qui glisse gâche un tour.
- **Touché → on rejoue.** Dans l'eau → la main passe. Quand un bateau est coulé, son nom est annoncé.
- Le retour visuel du tir a **trois niveaux** : dans l'eau, la case tressaute simplement ; touché, un petit 💥 éclate dans la case ; **coulé, un 💥 déborde largement sur la grille et une ☠️ s'envole** — la même tête de mort que celle du message. Quand c'est un de tes bateaux qui coule, la ☠️ **sombre** au lieu de monter, et une salve d'explosions court le long de la coque sur ta mini-carte. Tout s'arrête si le système est réglé sur « animations réduites ».
- Chaque grille porte son compteur : **« Flotte adverse — *n* bateaux à flot »** au-dessus de la grille de tir, **« Ta flotte — *n* bateaux coulés »** au-dessus de la mini-carte. Des dégâts de l'adversaire on ne sait rien tant qu'un bateau n'est pas coulé, d'où deux compteurs qui ne comptent pas la même chose.
- La première à couler les 4 bateaux adverses gagne. Le score de manches est conservé et affiche les deux prénoms, dans le même ordre sur les deux écrans. **Les deux joueuses doivent cliquer sur « Nouvelle manche »** pour relancer ; celle qui a déjà cliqué voit son bouton grisé et « ⏳ En attente de … », l'autre voit « 🔄 … veut rejouer ». La joueuse qui commence alterne.

Aucun calcul n'est demandé : c'est une récompense entre deux séries d'entraînement.

### Écran de résultats

- ✅ Nombre de bonnes réponses
- ❌ Nombre d'erreurs
- ⏱️ Temps total (si terminé avant la limite)
- 🎯 Score en pourcentage
- 📝 Liste des erreurs à réviser

### Interface

- Design moderne et coloré adapté aux enfants
- Alertes visuelles pour le temps (orange < 1 min, rouge < 30 sec)
- Barre de progression
- Responsive : fonctionne sur ordinateur, tablette et téléphone
- **Progressive Web App** : installable sur l'écran d'accueil, fonctionne hors ligne (modes solo)

## Installation

### Prérequis

- Go 1.21 ou supérieur

### Compilation

```bash
# Cloner le projet
git clone <repo-url>
cd chronomaths

# Compiler
go build -o chronomaths .
```

### Lancement

```bash
# Avec go run
go run .

# Ou avec le binaire
./chronomaths
```

L'application est accessible sur http://localhost:8080

## Architecture technique

```
chronomaths/
├── main.go              # Serveur HTTP : embed, routes, main()
├── session.go           # Session générique 2 joueurs : matchmaking, SSE, déconnexion
├── session_test.go      # Tests de la session générique
├── race.go              # Course de fusées : génération des questions + jeu
├── connect4.go          # Puissance 4 : logique pure + jeu en ligne
├── connect4_test.go     # Tests de la logique de plateau et du jeu en ligne
├── battleship.go        # Bataille navale : logique pure + jeu en ligne
├── battleship_test.go   # Tests du plateau, du jeu en ligne et de la confidentialité
├── go.mod               # Module Go
├── README.md
└── static/
    ├── index.html       # Structure HTML
    ├── style.css        # Styles CSS
    ├── games.css        # Styles du hub Jeux et du Puissance 4
    ├── app.js           # Logique JavaScript
    ├── games.js         # Section Jeux : logique pure + rendu du Puissance 4
    ├── battleship.js    # Bataille navale en ligne : rendu par snapshot
    ├── battleship.css   # Styles des grilles de la bataille navale
    ├── manifest.json    # Web App Manifest (PWA)
    ├── sw.js            # Service Worker
    └── icon.svg         # Icône application
```

### Backend (Go)

Le serveur gère les fichiers statiques et les jeux à deux joueurs via SSE (Server-Sent Events) :
- `embed.FS` pour embarquer les fichiers statiques dans le binaire
- `http.FileServer` pour servir les fichiers
- SSE (`GET /api/events`) pour les mises à jour serveur→client en temps réel
- `POST /api/join` et `POST /api/action` pour les actions client→serveur
- Support des quatre opérations (addition, soustraction, multiplication, division) côté serveur
- Zéro dépendance externe (standard library uniquement)
- Port par défaut : 8080

`session.go` porte le matchmaking et le flux SSE sans connaître aucune règle de jeu : il délègue aux jeux, qui s'y enregistrent chacun de leur côté. Trois jeux l'utilisent aujourd'hui : la **course de fusées** (`race.go`, une file d'attente par opération), le **Puissance 4 en ligne** (`connect4.go`, une seule file) et la **bataille navale en ligne** (`battleship.go`, une seule file). Pour le Puissance 4, le plateau qui fait foi est celui du serveur : le client envoie la colonne jouée et n'affiche que l'état complet renvoyé, ce qui rend impossible de jouer hors de son tour depuis un client modifié. La bataille navale va plus loin : le serveur place la flotte au hasard et n'envoie à chaque joueuse qu'une **vue partielle** de l'état — la sienne au complet, celle de l'adversaire réduite aux tirs déjà joués — ce qui rend la flotte adverse invisible même en lisant le flux SSE brut.

```go
//go:embed static/*
var staticFiles embed.FS
```

### Frontend (Vanilla JS)

**Pas de framework, pas de dépendances.**

| Fichier | Rôle |
|---------|------|
| `index.html` | Écrans : accueil, modes, jeu, résultats, posée, multi, jeux |
| `style.css` | Variables CSS, responsive, animations |
| `games.css` | Styles du hub Jeux et du plateau Puissance 4 |
| `app.js` | Machine à états, génération questions (+, −, ×, ÷), timer |
| `games.js` | Puissance 4 : logique pure (sans DOM), rendu et interactions, mode en ligne |
| `battleship.js` | Bataille navale en ligne : rendu par snapshot, interactions |
| `battleship.css` | Styles des grilles de la bataille navale |

`games.css` et `games.js` sont chargés **après** `style.css` et `app.js` : ce sont des scripts classiques, et `games.js` résout `screens`, `showScreen` et `screenCleanups` par portée lexicale globale.

#### Génération des questions

- **Additions** : difficulté mixte — 20% facile (2-20 + 2-20), 50% moyen (10-99 + 2-50), 30% difficile (50-99 + 50-99).
- **Soustractions** : difficulté mixte, résultat toujours positif — 20% facile, 50% moyen, 30% difficile.
- **Multiplications** : générées aléatoirement parmi les tables de 2 à 10 (81 combinaisons). Mélange Fisher-Yates.
- **Divisions** : basées sur les tables de multiplication inversées (résultat toujours exact, sans reste).

#### Gestion du temps

- `setInterval` pour le décompte (1 seconde)
- Alertes visuelles progressives
- Arrêt automatique à 0

## Personnalisation

### Modifier les tables

Dans `app.js`, ligne 20 :
```javascript
const tables = [2, 3, 4, 5, 6, 7, 8, 9, 10];
```

### Modifier les modes

Dans `index.html`, attributs `data-time` (secondes) et `data-questions` :
```html
<button class="mode-btn" data-time="300" data-questions="24">
```

### Modifier le port

Dans `main.go`, ligne 20 :
```go
port := "8080"
```

## Licence

MIT
