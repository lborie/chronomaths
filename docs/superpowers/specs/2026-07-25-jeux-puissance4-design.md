# Section « Jeux » + Puissance 4 local — Design

**Date** : 2026-07-25
**Statut** : validé

## Objectif

Ajouter à Chronomaths une section « Jeux », distincte des modes d'entraînement au calcul, et y implémenter un Puissance 4 pour 2 joueurs en tour par tour.

## Décisions cadrées

| Question | Décision |
|---|---|
| Local ou en ligne | **Local** : les 2 joueurs partagent le même appareil et se passent la main. Aucune modification du serveur Go. |
| Ressort mathématique | **Aucun** : règles classiques du Puissance 4. La section « Jeux » est une pause / récompense après les sessions de calcul. |
| Organisation du code | **Fichiers séparés** `static/games.js` et `static/games.css`, chargés après `app.js` / `style.css`. |
| Identité des joueurs | Noms fixes **« Rouge » (🔴)** et **« Jaune » (🟡)**. Pas de saisie de prénom. |
| Score | **Score de manches** conservé tant que l'utilisateur reste sur l'écran (`Rouge 2 – 1 Jaune`). Le joueur qui commence alterne à chaque nouvelle partie. |

Le mode en ligne n'est pas dans le périmètre, mais la logique de plateau est écrite en fonctions pures sans DOM pour qu'un portage serveur ultérieur reste mécanique.

## Hors périmètre

- Mode contre l'ordinateur (IA).
- Puissance 4 en ligne / multijoueur réseau.
- Persistance du score entre sessions (`localStorage`).
- Autres jeux que le Puissance 4.

## Architecture

### Organisation des fichiers

`app.js` fait déjà 1631 lignes et `style.css` 1836 : les jeux vivent dans leurs propres fichiers.

| Fichier | Nature | Contenu |
|---|---|---|
| `static/games.js` | **nouveau** | Logique pure du Puissance 4, rendu, gestion des écrans Jeux |
| `static/games.css` | **nouveau** | Styles `.c4-*` et du hub Jeux |
| `static/index.html` | modifié | Bouton d'accès, 2 écrans, balises `<link>` et `<script>` |
| `static/app.js` | modifié | Enregistrement des écrans, registre de cleanup |
| `static/sw.js` | modifié | Bump du cache, precache des 2 nouveaux fichiers |
| `README.md`, `CLAUDE.md` | modifiés | Documentation (consignes 1 et 2) |

`main.go` n'est **pas** modifié : `//go:embed static/*` embarque automatiquement les nouveaux fichiers.

Les scripts sont des scripts classiques (pas de modules ES). `games.js` étant chargé **après** `app.js`, il résout par portée lexicale globale les liaisons top-level d'`app.js` (`screens`, `showScreen`, `screenCleanups`). L'ordre des balises `<script>` est donc structurant et doit être respecté.

### Flux de navigation

```
Accueil ──┬─ (+, −, ×, ÷) → Modes → Jeu / Posée / Révision / Multi
          └─ 🎮 Jeux → Hub Jeux → 🔴 Puissance 4
```

L'accueil conserve sa grille 2×2 de cartes d'opération. En dessous : un séparateur `ou` (motif `.multi-separator` déjà utilisé sur l'écran modes) puis un bouton pleine largeur `🎮 Jeux`.

Le hub Jeux est un écran intermédiaire même s'il ne contient qu'une entrée : il accueillera les jeux suivants sans retoucher l'accueil.

### Contrainte : la classe `.operation-card` est piégée

`app.js:594` binde **toutes** les `.operation-card` vers :

```js
config.operation = card.dataset.operation;
updateModesScreen();   // labels[op] undefined → l.emoji lève une TypeError
```

Le bouton « Jeux » utilise donc une classe distincte (`games-entry-btn`) et son propre handler.

### Contrainte : enregistrement des écrans

`showScreen()` (`app.js:277`) fait `Object.values(screens).forEach(s => s.classList.remove('active'))` puis `screens[name].classList.add('active')`. Un écran absent de l'objet `screens` lève une TypeError ou reste affiché. `games.js` enregistre donc, avant tout usage :

```js
screens.games    = document.getElementById('screen-games');
screens.connect4 = document.getElementById('screen-connect4');
```

L'historique (`pushState` / `popstate`) fonctionne alors sans code supplémentaire.

### Registre de cleanup

`cleanupScreen()` (`app.js:292`) est un `switch` fermé dans `app.js` ; `games.js` ne peut pas y ajouter de cas. Deux lignes sont ajoutées à `app.js` :

```js
const screenCleanups = {};                       // près de la déclaration de `screens`

function cleanupScreen(screenName) {
    if (screenCleanups[screenName]) screenCleanups[screenName]();
    switch (screenName) { /* … inchangé … */ }
}
```

`games.js` y enregistre l'annulation du `setTimeout` d'animation de chute et le déverrouillage du plateau. Les prochains jeux s'y branchent sans retoucher `app.js`.

## Logique du jeu — fonctions pures

Regroupées en tête de `games.js`, sans aucun accès au DOM. Représentation : `board[row][col]`, 6 lignes × 7 colonnes, `row 0` = haut du plateau, valeurs `0` (vide), `1` (Rouge), `2` (Jaune).

| Fonction | Contrat |
|---|---|
| `createBoard()` | Retourne une grille 6×7 remplie de `0`. |
| `dropDisc(board, col, player)` | Écrit `player` dans la case libre la plus basse de `col` et retourne son index de ligne. Retourne `-1` si la colonne est pleine (le plateau n'est alors pas modifié). |
| `findWin(board, row, col)` | À partir du dernier jeton posé, teste les 4 directions (horizontale, verticale, 2 diagonales). Retourne le tableau des 4 cellules alignées `[{row, col}, …]`, ou `null`. Si plus de 4 jetons sont alignés, retourne les 4 premières trouvées dans le sens du parcours. |
| `isDraw(board)` | `true` si la ligne du haut (`board[0]`) ne contient plus aucun `0`. |

Ces quatre fonctions constituent l'unité portable : un futur mode en ligne les transpose en Go côté serveur sans toucher au rendu.

## État de l'écran Puissance 4

```js
const c4 = {
    board: null,        // grille 6×7
    current: 1,         // joueur dont c'est le tour : 1 | 2
    starter: 1,         // joueur qui a commencé la manche en cours
    locked: false,      // true pendant l'animation de chute et après la fin de partie
    over: false,
    wins: { 1: 0, 2: 0 },
    dropTimer: null     // handle setTimeout, annulé par le cleanup
};
```

Le score de manches (`wins`) survit à un « Rejouer » mais est réinitialisé à chaque entrée sur l'écran depuis le hub.

## Rendu et interactions

### Structure DOM

```
.c4-board
  └── button.c4-col  ×7        ← cible de clic
        └── .c4-cell ×6
              └── .c4-disc     ← ajouté à la pose, classes .p1 / .p2
```

La **cible de clic est la colonne entière**, pas la cellule. À 320 px de viewport, une colonne mesure ≈ 38 × 230 px : très au-delà du minimum tactile sur l'axe vertical, et sans ambiguïté de visée. `touch-action: manipulation` évite le délai de double-tap.

### Dimensionnement responsive

- `grid-template-columns: repeat(7, 1fr)` sur `.c4-board`, `aspect-ratio: 1` sur `.c4-cell`.
- Largeur du plateau bornée par `clamp()` pour ne pas devenir démesurée sur grand écran.
- Le plateau ne provoque jamais de scroll horizontal : il se contracte avec le viewport.
- `safe-area-inset-*` respectés via le conteneur existant.

### Feedback visuel

| Élément | Comportement |
|---|---|
| Bandeau de tour | `🔴 À Rouge de jouer` / `🟡 À Jaune de jouer`, avec la couleur du joueur courant |
| Score de manches | `Rouge 2 – 1 Jaune`, mis à jour en fin de partie |
| Aperçu de colonne | Jeton fantôme en haut de la colonne survolée, **uniquement sous `@media (hover: hover)`** |
| Chute du jeton | Animation `translateY` ~350 ms ; plateau verrouillé (`c4.locked`) pendant la chute |
| Victoire | Les 4 jetons alignés pulsent ; bandeau `🏆 Rouge gagne !` |
| Match nul | Bandeau `🤝 Match nul !` |
| Fin de partie | Boutons `🔄 Rejouer` et `← Retour` |

`prefers-reduced-motion: reduce` neutralise la chute et la pulsation : le jeton apparaît directement à sa place, la victoire est signalée par un contour statique.

### Règles d'enchaînement

- Clic sur une colonne pleine : sans effet, aucun changement de tour.
- Clic pendant l'animation ou après la fin de partie (`c4.locked`) : ignoré.
- Après une victoire ou un nul, `wins` est incrémenté (victoire seulement) et le plateau reste affiché jusqu'au « Rejouer ».
- « Rejouer » : `starter` bascule (1 ↔ 2), `current = starter`, nouveau plateau, `wins` conservé.

## Service Worker

`sw.js` sert en cache-first (`cached || fetchPromise`) : sans intervention, un utilisateur ayant déjà installé la PWA continuerait à recevoir l'ancien `index.html`. Deux changements :

```js
const CACHE_NAME = 'chronomaths-v2';                       // bump → purge de v1 à l'activate
const STATIC_ASSETS = [ …, '/games.js', '/games.css' ];    // ajout au precache
```

## Gestion des erreurs

Le jeu est purement local et déterministe ; il n'y a ni I/O, ni parsing, ni entrée utilisateur libre. Les seuls cas dégradés sont des états de jeu invalides, traités par des gardes silencieuses :

- Colonne pleine → `dropDisc` retourne `-1`, le coup est ignoré sans message d'erreur.
- Interaction pendant le verrou → ignorée.
- Sortie de l'écran en pleine animation → `screenCleanups.connect4` annule le `setTimeout` et remet `locked` à `false`.

Aucun message d'erreur utilisateur n'est nécessaire.

## Sécurité

Le jeu ne fait aucun appel réseau, n'expose aucune route et ne persiste aucune donnée : la surface d'attaque est nulle. L'audit formel (consigne 5) vérifiera :

- Aucun `innerHTML` / `insertAdjacentHTML` — uniquement `createElement` et `textContent`, conformément au reste du projet.
- Aucune donnée utilisateur saisie, donc aucune validation d'entrée ni risque d'injection.
- Aucune nouvelle route Go, aucune surface réseau ajoutée.
- Pas de `localStorage` ni de cookie.

## Vérification

Le projet n'a aucun test et zéro dépendance ; aucun framework de test n'est introduit.

1. **Fonctions pures** : script `node` jetable (scratchpad, non commité) couvrant les 4 directions de victoire, la victoire sur le dernier coup possible, la colonne pleine (`-1`), et le match nul.
2. **Test manuel navigateur** : partie complète pour chaque joueur, match nul, rejouer avec alternance du starter, retour arrière navigateur depuis chaque écran, clic sur colonne pleine, clic pendant l'animation.
3. **Audit responsive** (consigne 6) : 320 px / 375 px / tablette / desktop, absence de scroll horizontal, `prefers-reduced-motion`, hover désactivé sur tactile.

## Documentation

- `README.md` : nouvelle section « Jeux » décrivant le Puissance 4 et son accès.
- `CLAUDE.md` : arborescence mise à jour (`games.js`, `games.css`), flux de navigation étendu, note sur l'ordre de chargement des scripts et le registre `screenCleanups`.
