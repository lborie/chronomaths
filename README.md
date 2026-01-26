# 🧮 Chronomaths

Application web ludique pour apprendre les tables de multiplication, destinée aux élèves de CE2.

## Aperçu

Chronomaths propose des sessions chronométrées de calcul mental où l'enfant doit résoudre des multiplications contre la montre. L'interface colorée et les animations rendent l'apprentissage amusant et motivant.

## Fonctionnalités

### Modes de jeu

| Mode | Durée | Calculs | Difficulté |
|------|-------|---------|------------|
| 🚀 Sprint | 5 min | 24 | Rapide |
| 🏃 Course | 10 min | 48 | Modéré |
| 🏆 Marathon | 15 min | 72 | Endurance |

### Déroulement d'une partie

1. **Choix du mode** : L'enfant sélectionne son défi
2. **Calculs** : Les multiplications s'affichent une par une (tables de 2 à 10)
3. **Feedback immédiat** : Chaque réponse est validée avec un retour visuel
4. **Fin de partie** : Quand tous les calculs sont faits OU quand le temps est écoulé

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

Le serveur est minimaliste :
- Utilise `embed.FS` pour embarquer les fichiers statiques dans le binaire
- Sert les fichiers via `http.FileServer`
- Aucune dépendance externe
- Port par défaut : 8080

```go
//go:embed static/*
var staticFiles embed.FS
```

### Frontend (Vanilla JS)

**Pas de framework, pas de dépendances.**

| Fichier | Rôle |
|---------|------|
| `index.html` | 3 écrans : accueil, jeu, résultats |
| `style.css` | Variables CSS, responsive, animations |
| `app.js` | Machine à états, génération des questions, timer |

#### Génération des questions

Les multiplications sont générées aléatoirement parmi toutes les combinaisons des tables de 2 à 10 (81 combinaisons possibles). L'algorithme Fisher-Yates assure un mélange équitable.

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
