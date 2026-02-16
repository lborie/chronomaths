# 🧮 Chronomaths

Application web ludique pour apprendre les 4 opérations (additions, soustractions, multiplications, divisions), destinée aux élèves de CE2.

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

### Déroulement d'une partie

1. **Choix de l'opération** : Additions, Soustractions, Multiplications ou Divisions
2. **Choix du mode** : L'enfant sélectionne son défi (ou une table/nombre spécifique en mode Révision)
3. **Calculs** : Les opérations s'affichent une par une
4. **Feedback immédiat** : Chaque réponse est validée avec un retour visuel
5. **Fin de partie** : Quand tous les calculs sont faits OU quand le temps est écoulé

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
go run main.go

# Ou avec le binaire
./chronomaths
```

L'application est accessible sur http://localhost:8080

## Architecture technique

```
chronomaths/
├── main.go              # Serveur HTTP Go
├── go.mod               # Module Go
├── README.md
└── static/
    ├── index.html       # Structure HTML
    ├── style.css        # Styles CSS
    └── app.js           # Logique JavaScript
```

### Backend (Go)

Le serveur gère les fichiers statiques et le mode multijoueur via SSE (Server-Sent Events) :
- `embed.FS` pour embarquer les fichiers statiques dans le binaire
- `http.FileServer` pour servir les fichiers
- SSE (`GET /api/events`) pour les mises à jour serveur→client en temps réel
- `POST /api/join` et `POST /api/answer` pour les actions client→serveur
- Support des quatre opérations (addition, soustraction, multiplication, division) côté serveur
- Zéro dépendance externe (standard library uniquement)
- Port par défaut : 8080

```go
//go:embed static/*
var staticFiles embed.FS
```

### Frontend (Vanilla JS)

**Pas de framework, pas de dépendances.**

| Fichier | Rôle |
|---------|------|
| `index.html` | Écrans : accueil, modes, jeu, résultats, posée, multi |
| `style.css` | Variables CSS, responsive, animations |
| `app.js` | Machine à états, génération questions (+, −, ×, ÷), timer |

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
