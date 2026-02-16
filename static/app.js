// ============================================================
// CONFIGURATION GLOBALE
// ============================================================
const config = {
    operation: 'multiplication' // 'multiplication' | 'addition' | 'subtraction' | 'division'
};

function getOperatorSymbol() {
    return { multiplication: '×', addition: '+', subtraction: '−', division: '÷' }[config.operation] || '×';
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================
// SOLO MODE - État du jeu
// ============================================================
const state = {
    totalTime: 0,
    totalQuestions: 0,
    currentQuestion: 0,
    timeRemaining: 0,
    startTime: null,
    timerInterval: null,
    questions: [],
    answers: [],
    correct: 0,
    wrong: 0
};

// Éléments DOM - Solo
const screens = {
    home: document.getElementById('screen-home'),
    modes: document.getElementById('screen-modes'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results'),
    poseeDifficulty: document.getElementById('screen-posee-difficulty'),
    posee: document.getElementById('screen-posee'),
    poseeResults: document.getElementById('screen-posee-results'),
    tableSelect: document.getElementById('screen-table-select'),
    multiJoin: document.getElementById('screen-multi-join'),
    multiWaiting: document.getElementById('screen-multi-waiting'),
    multiRace: document.getElementById('screen-multi-race'),
    multiWin: document.getElementById('screen-multi-win')
};

const elements = {
    timerDisplay: document.getElementById('timer-display'),
    timer: document.querySelector('.timer'),
    currentQuestion: document.getElementById('current-question'),
    totalQuestions: document.getElementById('total-questions'),
    progressFill: document.getElementById('progress-fill'),
    num1: document.getElementById('num1'),
    num2: document.getElementById('num2'),
    soloOperator: document.getElementById('solo-operator'),
    answerInput: document.getElementById('answer-input'),
    answerForm: document.getElementById('answer-form'),
    feedback: document.getElementById('feedback'),
    resultsHeader: document.getElementById('results-header'),
    statCorrect: document.getElementById('stat-correct'),
    statWrong: document.getElementById('stat-wrong'),
    statTime: document.getElementById('stat-time'),
    statScore: document.getElementById('stat-score'),
    errorsSection: document.getElementById('errors-section'),
    errorsList: document.getElementById('errors-list'),
    playAgain: document.getElementById('play-again')
};

// ============================================================
// GÉNÉRATION DE QUESTIONS
// ============================================================

// Multiplications : toutes combinaisons tables 2-10
function generateMultiplicationQuestions(count) {
    const questions = [];
    const tables = [2, 3, 4, 5, 6, 7, 8, 9, 10];

    const allCombinations = [];
    for (const a of tables) {
        for (const b of tables) {
            allCombinations.push({ a, b, answer: a * b });
        }
    }

    shuffleArray(allCombinations);

    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...allCombinations.slice(0, remaining));
        shuffleArray(allCombinations);
    }

    return questions;
}

// Additions : difficulté mixte
function generateAdditionQuestions(count) {
    const pool = [];

    // 20% facile (2-20 + 2-20)
    for (let i = 0; i < 20; i++) {
        const a = randInt(2, 20), b = randInt(2, 20);
        pool.push({ a, b, answer: a + b });
    }
    // 50% moyen (10-99 + 2-50)
    for (let i = 0; i < 50; i++) {
        const a = randInt(10, 99), b = randInt(2, 50);
        pool.push({ a, b, answer: a + b });
    }
    // 30% difficile (50-99 + 50-99)
    for (let i = 0; i < 30; i++) {
        const a = randInt(50, 99), b = randInt(50, 99);
        pool.push({ a, b, answer: a + b });
    }

    shuffleArray(pool);

    const questions = [];
    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...pool.slice(0, remaining));
        shuffleArray(pool);
    }
    return questions;
}

// Soustractions : résultat toujours positif
function generateSubtractionQuestions(count) {
    const pool = [];
    // 20% facile
    for (let i = 0; i < 20; i++) {
        const b = randInt(2, 10);
        const result = randInt(1, 10);
        pool.push({ a: result + b, b, answer: result });
    }
    // 50% moyen
    for (let i = 0; i < 50; i++) {
        const a = randInt(20, 99);
        const b = randInt(2, Math.min(a - 1, 50));
        pool.push({ a, b, answer: a - b });
    }
    // 30% difficile
    for (let i = 0; i < 30; i++) {
        const a = randInt(50, 99);
        const b = randInt(20, a - 1);
        pool.push({ a, b, answer: a - b });
    }
    shuffleArray(pool);
    const questions = [];
    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...pool.slice(0, remaining));
        shuffleArray(pool);
    }
    return questions;
}

// Divisions : basées sur les tables de multiplication (résultat exact)
function generateDivisionQuestions(count) {
    const tables = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const allCombinations = [];
    for (const divisor of tables) {
        for (const quotient of tables) {
            allCombinations.push({ a: divisor * quotient, b: divisor, answer: quotient });
        }
    }
    shuffleArray(allCombinations);
    const questions = [];
    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...allCombinations.slice(0, remaining));
        shuffleArray(allCombinations);
    }
    return questions;
}

function generateQuestions(count) {
    switch (config.operation) {
        case 'multiplication': return generateMultiplicationQuestions(count);
        case 'addition': return generateAdditionQuestions(count);
        case 'subtraction': return generateSubtractionQuestions(count);
        case 'division': return generateDivisionQuestions(count);
        default: return generateMultiplicationQuestions(count);
    }
}

// Révision par table (multiplications) — tables: array de nombres
function generateTableQuestions(tables, count) {
    const factors = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const combinations = [];
    tables.forEach(t => factors.forEach(f => {
        combinations.push({ a: t, b: f, answer: t * f });
        if (t !== f) combinations.push({ a: f, b: t, answer: t * f });
    }));
    shuffleArray(combinations);

    const questions = [];
    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...combinations.slice(0, remaining));
        shuffleArray(combinations);
    }
    return questions;
}

// Révision par nombre (additions) — numbers: array de nombres
function generateNumberQuestions(numbers, count) {
    const addends = [2, 3, 4, 5, 6, 7, 8, 9];
    const combinations = [];
    numbers.forEach(n => addends.forEach(b => {
        combinations.push({ a: n, b, answer: n + b });
        if (n !== b) combinations.push({ a: b, b: n, answer: n + b });
    }));
    shuffleArray(combinations);

    const questions = [];
    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...combinations.slice(0, remaining));
        shuffleArray(combinations);
    }
    return questions;
}

// Révision par nombre (soustractions) — numbers: array de nombres
function generateSubtractionNumberQuestions(numbers, count) {
    const combinations = [];
    numbers.forEach(n => {
        for (let a = n + 2; a <= n + 20; a++) {
            combinations.push({ a, b: n, answer: a - n });
        }
        for (let b = 2; b < n; b++) {
            combinations.push({ a: n, b, answer: n - b });
        }
    });
    shuffleArray(combinations);
    const questions = [];
    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...combinations.slice(0, remaining));
        shuffleArray(combinations);
    }
    return questions;
}

// Révision par table (divisions) — tables: array de nombres
function generateDivisionTableQuestions(tables, count) {
    const factors = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const combinations = [];
    tables.forEach(t => factors.forEach(f => {
        combinations.push({ a: t * f, b: t, answer: f });
        if (t !== f) combinations.push({ a: t * f, b: f, answer: t });
    }));
    shuffleArray(combinations);
    const questions = [];
    while (questions.length < count) {
        const remaining = count - questions.length;
        questions.push(...combinations.slice(0, remaining));
        shuffleArray(combinations);
    }
    return questions;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ============================================================
// NAVIGATION & ÉCRANS
// ============================================================

function showScreen(screenName, pushToHistory = true) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
    if (pushToHistory) {
        history.pushState({ screen: screenName }, '', '#' + screenName);
    }
}

function getActiveScreen() {
    for (const [name, el] of Object.entries(screens)) {
        if (el.classList.contains('active')) return name;
    }
    return 'home';
}

function cleanupScreen(screenName) {
    switch (screenName) {
        case 'game':
            clearInterval(state.timerInterval);
            break;
        case 'multiWaiting':
        case 'multiRace':
        case 'multiWin':
            if (multi.eventSource) {
                multi.eventSource.close();
                multi.eventSource = null;
            }
            multi.playerId = null;
            break;
    }
}

window.addEventListener('popstate', (event) => {
    const target = event.state && event.state.screen ? event.state.screen : 'home';
    cleanupScreen(getActiveScreen());
    showScreen(target, false);
});

history.replaceState({ screen: 'home' }, '', '#home');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Met à jour l'écran des modes selon l'opération choisie
function updateModesScreen() {
    const op = config.operation;
    const labels = {
        addition: { emoji: '➕', title: 'Additions', subtitle: 'Deviens une championne des additions!' },
        subtraction: { emoji: '➖', title: 'Soustractions', subtitle: 'Deviens une championne des soustractions!' },
        multiplication: { emoji: '🧮', title: 'Multiplications', subtitle: 'Deviens une championne des multiplications!' },
        division: { emoji: '➗', title: 'Divisions', subtitle: 'Deviens une championne des divisions!' }
    };
    const l = labels[op];
    document.getElementById('modes-emoji').textContent = l.emoji;
    document.getElementById('modes-title-text').textContent = l.title;
    document.getElementById('modes-subtitle').textContent = l.subtitle;

    // Posée section (hidden for division)
    const showPosee = op !== 'division';
    document.getElementById('posee-section').style.display = showPosee ? '' : 'none';

    if (showPosee) {
        const poseeLabels = {
            multiplication: { title: 'Multiplications posées', desc: 'Apprends à poser les multiplications avec retenue', singular: 'Multiplication posée' },
            addition: { title: 'Additions posées', desc: 'Apprends à poser les additions avec retenue', singular: 'Addition posée' },
            subtraction: { title: 'Soustractions posées', desc: 'Apprends à poser les soustractions avec retenue', singular: 'Soustraction posée' }
        };
        const pl = poseeLabels[op];
        document.getElementById('posee-btn-title').textContent = pl.title;
        document.getElementById('posee-btn-desc').textContent = pl.desc;
        document.getElementById('posee-diff-title').textContent = pl.singular;
        document.getElementById('posee-screen-title').textContent = pl.singular;
    }

    // Posée difficulty details
    const poseeDetails = {
        multiplication: {
            easy: { details: '× 1 chiffre', example: 'ex: 47 × 3' },
            medium: { details: '× 2 chiffres', example: 'ex: 47 × 23' },
            hard: { details: '× 3 chiffres', example: 'ex: 234 × 123' }
        },
        addition: {
            easy: { details: '2 chiffres', example: 'ex: 47 + 38' },
            medium: { details: '3 chiffres', example: 'ex: 247 + 385' },
            hard: { details: '4 chiffres', example: 'ex: 2345 + 1678' }
        },
        subtraction: {
            easy: { details: '2 chiffres', example: 'ex: 74 − 28' },
            medium: { details: '3 chiffres', example: 'ex: 547 − 283' },
            hard: { details: '4 chiffres', example: 'ex: 5432 − 2876' }
        }
    };
    if (poseeDetails[op]) {
        const pd = poseeDetails[op];
        document.getElementById('posee-easy-details').textContent = pd.easy.details;
        document.getElementById('posee-easy-example').textContent = pd.easy.example;
        document.getElementById('posee-medium-details').textContent = pd.medium.details;
        document.getElementById('posee-medium-example').textContent = pd.medium.example;
        document.getElementById('posee-hard-details').textContent = pd.hard.details;
        document.getElementById('posee-hard-example').textContent = pd.hard.example;
    }

    // Bouton révision
    const isTableBased = op === 'multiplication' || op === 'division';
    document.getElementById('practice-btn-title').textContent = isTableBased
        ? 'Révision par table' : 'Révision par nombre';
    document.getElementById('practice-btn-desc').textContent = isTableBased
        ? 'Entraîne-toi sur une table au choix'
        : 'Entraîne-toi avec un nombre au choix';

    updateTableSelectScreen();
}

function updateTableSelectScreen() {
    const op = config.operation;
    const isTableBased = op === 'multiplication' || op === 'division';
    const grid = document.getElementById('table-grid');
    const startBtn = document.getElementById('btn-table-start');
    const selected = new Set();

    document.getElementById('table-select-title').textContent = isTableBased
        ? 'Révision par table' : 'Révision par nombre';
    document.getElementById('table-select-subtitle').textContent = isTableBased
        ? 'Quelles tables veux-tu réviser ?' : 'Quels nombres veux-tu travailler ?';
    document.getElementById('table-select-heading').textContent = isTableBased
        ? 'Choisis tes tables :' : 'Choisis tes nombres :';

    const values = isTableBased
        ? [2, 3, 4, 5, 6, 7, 8, 9, 10]
        : [2, 3, 4, 5, 6, 7, 8, 9];

    function updateStartBtn() {
        startBtn.disabled = selected.size === 0;
    }

    grid.textContent = '';
    values.forEach(val => {
        const btn = document.createElement('button');
        btn.className = 'table-btn';
        btn.dataset.table = val;
        const span = document.createElement('span');
        span.className = 'table-number';
        span.textContent = val;
        btn.appendChild(span);
        btn.addEventListener('click', () => {
            if (selected.has(val)) {
                selected.delete(val);
                btn.classList.remove('selected');
            } else {
                selected.add(val);
                btn.classList.add('selected');
            }
            updateStartBtn();
        });
        grid.appendChild(btn);
    });

    startBtn.disabled = true;
    startBtn.onclick = () => {
        if (selected.size === 0) return;
        const vals = Array.from(selected);
        const totalQuestions = 18;
        const totalTime = 120;
        const generators = {
            multiplication: () => generateTableQuestions(vals, totalQuestions),
            addition: () => generateNumberQuestions(vals, totalQuestions),
            subtraction: () => generateSubtractionNumberQuestions(vals, totalQuestions),
            division: () => generateDivisionTableQuestions(vals, totalQuestions)
        };
        startGame(totalTime, totalQuestions, generators[op]());
    };
}

// ============================================================
// SOLO GAME LOGIC
// ============================================================

function startGame(totalTime, totalQuestions, customQuestions) {
    state.totalTime = totalTime;
    state.totalQuestions = totalQuestions;
    state.currentQuestion = 0;
    state.timeRemaining = totalTime;
    state.startTime = Date.now();
    state.questions = customQuestions || generateQuestions(totalQuestions);
    state.answers = [];
    state.correct = 0;
    state.wrong = 0;

    elements.soloOperator.textContent = getOperatorSymbol();
    elements.totalQuestions.textContent = totalQuestions;
    elements.timerDisplay.textContent = formatTime(totalTime);
    elements.timer.classList.remove('warning', 'danger');
    elements.feedback.textContent = '';
    elements.feedback.className = 'feedback';

    showScreen('game');
    showQuestion();
    state.timerInterval = setInterval(updateTimer, 1000);
    elements.answerInput.focus();
}

function updateTimer() {
    state.timeRemaining--;
    elements.timerDisplay.textContent = formatTime(state.timeRemaining);

    if (state.timeRemaining <= 30) {
        elements.timer.classList.add('danger');
        elements.timer.classList.remove('warning');
    } else if (state.timeRemaining <= 60) {
        elements.timer.classList.add('warning');
    }

    if (state.timeRemaining <= 0) {
        endGame(true);
    }
}

function showQuestion() {
    const question = state.questions[state.currentQuestion];
    elements.num1.textContent = question.a;
    elements.num2.textContent = question.b;
    elements.currentQuestion.textContent = state.currentQuestion + 1;

    const progress = (state.currentQuestion / state.totalQuestions) * 100;
    elements.progressFill.style.width = `${progress}%`;

    elements.answerInput.value = '';
    elements.answerInput.focus();
}

function checkAnswer(userAnswer) {
    const question = state.questions[state.currentQuestion];
    const isCorrect = userAnswer === question.answer;
    const op = getOperatorSymbol();

    state.answers.push({ question, userAnswer, isCorrect });

    if (isCorrect) {
        state.correct++;
        elements.feedback.textContent = 'Bravo ! 🎉';
        elements.feedback.className = 'feedback correct';
    } else {
        state.wrong++;
        elements.feedback.textContent = `${question.a} ${op} ${question.b} = ${question.answer}`;
        elements.feedback.className = 'feedback wrong';
    }

    setTimeout(() => {
        elements.feedback.textContent = '';
        elements.feedback.className = 'feedback';

        state.currentQuestion++;

        if (state.currentQuestion >= state.totalQuestions) {
            endGame(false);
        } else {
            showQuestion();
        }
    }, isCorrect ? 500 : 1200);
}

function endGame(timeout) {
    clearInterval(state.timerInterval);
    const op = getOperatorSymbol();

    const timeElapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const displayTime = timeout ? state.totalTime : timeElapsed;

    elements.statCorrect.textContent = state.correct;
    elements.statWrong.textContent = state.wrong;
    elements.statTime.textContent = formatTime(displayTime);

    const score = Math.round((state.correct / state.totalQuestions) * 100);
    elements.statScore.textContent = `${score}%`;

    const resultsIcon = elements.resultsHeader.querySelector('.results-icon');
    const resultsTitle = elements.resultsHeader.querySelector('h2');

    if (timeout) {
        resultsIcon.textContent = '\u23F1\uFE0F';
        resultsTitle.textContent = 'Temps \u00e9coul\u00e9!';
    } else if (score >= 80) {
        resultsIcon.textContent = '\uD83C\uDFC6';
        resultsTitle.textContent = 'Excellent!';
    } else if (score >= 50) {
        resultsIcon.textContent = '\uD83D\uDC4D';
        resultsTitle.textContent = 'Bien jou\u00e9!';
    } else {
        resultsIcon.textContent = '\uD83D\uDCAA';
        resultsTitle.textContent = 'Continue!';
    }

    const errors = state.answers.filter(a => !a.isCorrect);
    if (errors.length > 0) {
        elements.errorsSection.classList.add('visible');
        elements.errorsList.textContent = '';
        errors.forEach(e => {
            const span = document.createElement('span');
            span.className = 'error-item';
            span.textContent = `${e.question.a} ${op} ${e.question.b} = ${e.question.answer}`;
            elements.errorsList.appendChild(span);
        });
    } else {
        elements.errorsSection.classList.remove('visible');
    }

    showScreen('results');
}

// ============================================================
// SOLO EVENTS
// ============================================================

// Choix d'opération
document.querySelectorAll('.operation-card').forEach(card => {
    card.addEventListener('click', () => {
        config.operation = card.dataset.operation;
        updateModesScreen();
        showScreen('modes');
    });
});

// Retour depuis les modes
document.getElementById('btn-modes-back').addEventListener('click', () => {
    showScreen('home');
});

// Modes chronométrés
document.querySelectorAll('.mode-btn[data-time][data-questions]').forEach(btn => {
    btn.addEventListener('click', () => {
        const time = parseInt(btn.dataset.time);
        const questions = parseInt(btn.dataset.questions);
        startGame(time, questions);
    });
});

elements.answerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const answer = parseInt(elements.answerInput.value);
    if (!isNaN(answer)) {
        checkAnswer(answer);
    }
});

elements.playAgain.addEventListener('click', () => {
    showScreen('modes');
});

document.getElementById('btn-stop-game').addEventListener('click', () => {
    clearInterval(state.timerInterval);
    showScreen('modes');
});

document.addEventListener('touchstart', () => {}, { passive: true });

// ============================================================
// TABLE/NUMBER PRACTICE MODE
// ============================================================

document.getElementById('btn-table-practice').addEventListener('click', () => {
    updateTableSelectScreen();
    showScreen('tableSelect');
});

document.getElementById('btn-table-back').addEventListener('click', () => {
    showScreen('modes');
});

// ============================================================
// OP\u00c9RATION POS\u00c9E MODE
// ============================================================

const poseeState = {
    a: 0,
    b: 0,
    difficulty: 'easy',
    correctCount: 0,
    wrongCount: 0,
    history: [],
    validated: false
};

const poseeEl = {
    btnPosee: document.getElementById('btn-posee'),
    btnPoseeBack: document.getElementById('btn-posee-back'),
    difficultyBtns: document.querySelectorAll('.difficulty-btn'),
    grid: document.getElementById('posee-grid'),
    feedback: document.getElementById('posee-feedback'),
    btnValidate: document.getElementById('btn-posee-validate'),
    btnNext: document.getElementById('btn-posee-next'),
    btnStop: document.getElementById('btn-posee-stop'),
    correctCount: document.getElementById('posee-correct-count'),
    wrongCount: document.getElementById('posee-wrong-count'),
    resultsIcon: document.getElementById('posee-results-icon'),
    resultsTitle: document.getElementById('posee-results-title'),
    statCorrect: document.getElementById('posee-stat-correct'),
    statWrong: document.getElementById('posee-stat-wrong'),
    errorsSection: document.getElementById('posee-errors-section'),
    errorsList: document.getElementById('posee-errors-list'),
    btnReplay: document.getElementById('btn-posee-replay')
};

poseeEl.btnPosee.addEventListener('click', () => {
    showScreen('poseeDifficulty');
});

poseeEl.btnPoseeBack.addEventListener('click', () => {
    showScreen('modes');
});

poseeEl.difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        poseeState.difficulty = btn.dataset.difficulty;
        poseeState.correctCount = 0;
        poseeState.wrongCount = 0;
        poseeState.history = [];
        poseeEl.correctCount.textContent = '0';
        poseeEl.wrongCount.textContent = '0';
        generatePosee();
        showScreen('posee');
    });
});

function generatePosee() {
    const diff = poseeState.difficulty;
    const op = config.operation;

    if (op === 'multiplication') {
        if (diff === 'easy') {
            poseeState.a = randInt(10, 99);
            poseeState.b = randInt(2, 9);
        } else if (diff === 'medium') {
            poseeState.a = randInt(10, 99);
            poseeState.b = randInt(11, 99);
        } else {
            poseeState.a = randInt(100, 999);
            poseeState.b = randInt(101, 999);
        }
    } else if (op === 'subtraction') {
        if (diff === 'easy') {
            poseeState.a = randInt(20, 99);
            poseeState.b = randInt(10, poseeState.a - 1);
        } else if (diff === 'medium') {
            poseeState.a = randInt(200, 999);
            poseeState.b = randInt(100, poseeState.a - 1);
        } else {
            poseeState.a = randInt(2000, 9999);
            poseeState.b = randInt(1000, poseeState.a - 1);
        }
    } else {
        // addition
        if (diff === 'easy') {
            poseeState.a = randInt(10, 99);
            poseeState.b = randInt(10, 99);
        } else if (diff === 'medium') {
            poseeState.a = randInt(100, 999);
            poseeState.b = randInt(100, 999);
        } else {
            poseeState.a = randInt(1000, 9999);
            poseeState.b = randInt(1000, 9999);
        }
    }

    poseeState.validated = false;
    poseeEl.feedback.textContent = '';
    poseeEl.feedback.className = 'feedback';
    poseeEl.btnValidate.style.display = '';
    poseeEl.btnNext.style.display = 'none';

    if (op === 'multiplication') {
        renderMultiplicationPosee();
    } else {
        renderSimplePosee();
    }
}

// Helpers pour créer les éléments de la grille
function createCarryRow(maxLen, carryStart, carryEnd, groupIdx) {
    const row = document.createElement('div');
    row.className = 'posee-row posee-carry-row';
    row.dataset.group = groupIdx;
    for (let i = 0; i < maxLen; i++) {
        const cell = document.createElement('div');
        cell.className = 'posee-cell posee-carry-cell';
        if (i >= carryStart && i <= carryEnd) {
            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'numeric';
            input.maxLength = 1;
            input.className = 'posee-carry-input';
            input.autocomplete = 'off';
            input.dataset.col = i;
            input.dataset.group = groupIdx;
            cell.appendChild(input);
        }
        row.appendChild(cell);
    }
    return row;
}

function createDigitRow(maxLen, numStr, padLeft, extraClass) {
    const row = document.createElement('div');
    row.className = 'posee-row' + (extraClass ? ' ' + extraClass : '');
    for (let i = 0; i < maxLen; i++) {
        const cell = document.createElement('div');
        cell.className = 'posee-cell';
        if (i >= padLeft && (i - padLeft) < numStr.length) {
            cell.textContent = numStr[i - padLeft];
            cell.classList.add('posee-digit');
        }
        row.appendChild(cell);
    }
    return row;
}

function createInputRow(maxLen, numStr, padLeft, inputClass, groupIdx, trailingZeros) {
    const row = document.createElement('div');
    row.className = 'posee-row posee-result-row';
    row.dataset.group = groupIdx;
    for (let i = 0; i < maxLen; i++) {
        const cell = document.createElement('div');
        cell.className = 'posee-cell';
        if (i >= padLeft) {
            const pos = i - padLeft;
            if (pos < numStr.length) {
                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 1;
                input.className = inputClass;
                input.autocomplete = 'off';
                input.dataset.pos = pos;
                input.dataset.col = i;
                input.dataset.group = groupIdx;
                if (trailingZeros && pos >= numStr.length - trailingZeros) {
                    input.value = '0';
                    input.readOnly = true;
                    input.classList.add('posee-input-prefilled');
                }
                cell.appendChild(input);
            }
        }
        row.appendChild(cell);
    }
    return row;
}

function setupInputNavigation(grid) {
    const allInputs = Array.from(grid.querySelectorAll('input:not([readonly])'));

    allInputs.forEach((inp) => {
        inp.addEventListener('input', () => {
            inp.value = inp.value.replace(/[^0-9]/g, '').slice(-1);
            if (inp.value) {
                const sameGroup = allInputs.filter(i => i.dataset.group === inp.dataset.group && i.className === inp.className);
                const idxInGroup = sameGroup.indexOf(inp);
                if (idxInGroup > 0) sameGroup[idxInGroup - 1].focus();
            }
        });
        inp.addEventListener('keydown', (e) => {
            const sameGroup = allInputs.filter(i => i.dataset.group === inp.dataset.group && i.className === inp.className);
            const idxInGroup = sameGroup.indexOf(inp);
            if (e.key === 'Backspace' && !inp.value && idxInGroup > 0) {
                sameGroup[idxInGroup - 1].focus();
            }
            if (e.key === 'ArrowLeft' && idxInGroup > 0) {
                sameGroup[idxInGroup - 1].focus();
            }
            if (e.key === 'ArrowRight' && idxInGroup < sameGroup.length - 1) {
                sameGroup[idxInGroup + 1].focus();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (poseeState.validated) nextPosee();
                else validatePosee();
            }
        });
    });
}

// ============================================================
// MULTIPLICATION POS\u00c9E - Rendu
// ============================================================

function renderMultiplicationPosee() {
    const a = poseeState.a;
    const b = poseeState.b;
    const bStr = String(b);
    const aStr = String(a);
    const result = a * b;
    const resultStr = String(result);
    const bDigits = bStr.split('').map(Number);
    const isMultiDigit = bDigits.length > 1;

    const partials = [];
    for (let d = 0; d < bDigits.length; d++) {
        const digit = bDigits[bDigits.length - 1 - d];
        const partial = a * digit;
        const shiftedStr = String(partial) + '0'.repeat(d);
        partials.push({ digit, partial, shifted: partial * Math.pow(10, d), shiftedStr, zeros: d });
    }

    const allWidths = [aStr.length + 1, bStr.length + 1, resultStr.length];
    partials.forEach(p => allWidths.push(p.shiftedStr.length));
    const maxLen = Math.max(...allWidths);

    const grid = poseeEl.grid;
    grid.textContent = '';
    grid.style.setProperty('--posee-cols', maxLen);

    const padA = maxLen - aStr.length;
    const padB = maxLen - bStr.length;

    if (!isMultiDigit) {
        const carryStart = Math.max(0, padA - 1);
        const carryEnd = padA + aStr.length - 2;
        grid.appendChild(createCarryRow(maxLen, carryStart, carryEnd, 0));
    }

    grid.appendChild(createDigitRow(maxLen, aStr, padA));

    const rowB = document.createElement('div');
    rowB.className = 'posee-row';
    for (let i = 0; i < maxLen; i++) {
        const cell = document.createElement('div');
        cell.className = 'posee-cell';
        if (i === padB - 1) {
            cell.textContent = '\u00d7';
            cell.classList.add('posee-operator');
        } else if (i >= padB) {
            cell.textContent = bStr[i - padB];
            cell.classList.add('posee-digit');
        }
        rowB.appendChild(cell);
    }
    grid.appendChild(rowB);

    const sep1 = document.createElement('div');
    sep1.className = 'posee-separator';
    grid.appendChild(sep1);

    if (!isMultiDigit) {
        const padResult = maxLen - resultStr.length;
        grid.appendChild(createInputRow(maxLen, resultStr, padResult, 'posee-input', 0, 0));
    } else {
        partials.forEach((p, idx) => {
            const carryStart = Math.max(0, padA - 1);
            const carryEnd = padA + aStr.length - 2;
            grid.appendChild(createCarryRow(maxLen, carryStart, carryEnd, idx));

            const padPartial = maxLen - p.shiftedStr.length;
            grid.appendChild(createInputRow(maxLen, p.shiftedStr, padPartial, 'posee-input posee-partial', idx, p.zeros));
        });

        const sep2 = document.createElement('div');
        sep2.className = 'posee-separator';
        grid.appendChild(sep2);

        const padResult = maxLen - resultStr.length;
        grid.appendChild(createInputRow(maxLen, resultStr, padResult, 'posee-input posee-final', 'final', 0));
    }

    setupInputNavigation(grid);

    const firstRowInputs = grid.querySelectorAll('[data-group="0"].posee-input:not([readonly])');
    if (firstRowInputs.length > 0) {
        firstRowInputs[firstRowInputs.length - 1].focus();
    }
}

// ============================================================
// ADDITION POS\u00c9E - Rendu
// ============================================================

function renderSimplePosee() {
    const a = poseeState.a;
    const b = poseeState.b;
    const op = getOperatorSymbol();
    const aStr = String(a);
    const bStr = String(b);
    const result = config.operation === 'subtraction' ? a - b : a + b;
    const resultStr = String(result);

    const maxLen = Math.max(aStr.length + 1, bStr.length + 1, resultStr.length);

    const grid = poseeEl.grid;
    grid.textContent = '';
    grid.style.setProperty('--posee-cols', maxLen);

    const padA = maxLen - aStr.length;
    const padB = maxLen - bStr.length;

    // Carry/borrow row
    const carryStart = Math.max(0, padA - 1);
    const carryEnd = maxLen - 2;
    grid.appendChild(createCarryRow(maxLen, carryStart, carryEnd, 0));

    // First number
    grid.appendChild(createDigitRow(maxLen, aStr, padA));

    // Second number with operator
    const rowB = document.createElement('div');
    rowB.className = 'posee-row';
    for (let i = 0; i < maxLen; i++) {
        const cell = document.createElement('div');
        cell.className = 'posee-cell';
        if (i === padB - 1) {
            cell.textContent = op;
            cell.classList.add('posee-operator');
        } else if (i >= padB) {
            cell.textContent = bStr[i - padB];
            cell.classList.add('posee-digit');
        }
        rowB.appendChild(cell);
    }
    grid.appendChild(rowB);

    // Separator
    const sep = document.createElement('div');
    sep.className = 'posee-separator';
    grid.appendChild(sep);

    // Result input row
    const padResult = maxLen - resultStr.length;
    grid.appendChild(createInputRow(maxLen, resultStr, padResult, 'posee-input', 0, 0));

    setupInputNavigation(grid);

    const inputs = grid.querySelectorAll('.posee-input:not([readonly])');
    if (inputs.length > 0) {
        inputs[inputs.length - 1].focus();
    }
}

// ============================================================
// VALIDATION POS\u00c9E
// ============================================================

function validatePosee() {
    if (poseeState.validated) return;

    if (config.operation === 'multiplication') {
        validateMultiplicationPosee();
    } else {
        validateSimplePosee();
    }
}

function validateMultiplicationPosee() {
    const a = poseeState.a;
    const b = poseeState.b;
    const result = a * b;
    const resultStr = String(result);
    const bStr = String(b);
    const bDigits = bStr.split('').map(Number);
    const isMultiDigit = bDigits.length > 1;
    const grid = poseeEl.grid;

    let allCorrect = true;

    if (!isMultiDigit) {
        const inputs = grid.querySelectorAll('.posee-input');
        let userAnswer = '';
        inputs.forEach(inp => { userAnswer += inp.value || ''; });
        if (userAnswer !== resultStr) allCorrect = false;

        inputs.forEach((inp, idx) => {
            inp.readOnly = true;
            if (inp.value === resultStr[idx]) {
                inp.classList.add('posee-input-correct');
            } else {
                inp.classList.add('posee-input-wrong');
            }
        });
    } else {
        const partials = [];
        for (let d = 0; d < bDigits.length; d++) {
            const digit = bDigits[bDigits.length - 1 - d];
            const partial = a * digit;
            const shiftedStr = String(partial) + '0'.repeat(d);
            partials.push(shiftedStr);
        }

        partials.forEach((expected, idx) => {
            const inputs = grid.querySelectorAll(`.posee-partial[data-group="${idx}"]`);
            let userVal = '';
            inputs.forEach(inp => { userVal += inp.value || ''; });
            if (userVal !== expected) allCorrect = false;

            inputs.forEach((inp, i) => {
                inp.readOnly = true;
                if (inp.value === expected[i]) {
                    inp.classList.add('posee-input-correct');
                } else if (!inp.classList.contains('posee-input-prefilled')) {
                    inp.classList.add('posee-input-wrong');
                }
            });
        });

        const finalInputs = grid.querySelectorAll('.posee-final');
        let userFinal = '';
        finalInputs.forEach(inp => { userFinal += inp.value || ''; });
        if (userFinal !== resultStr) allCorrect = false;

        finalInputs.forEach((inp, idx) => {
            inp.readOnly = true;
            if (inp.value === resultStr[idx]) {
                inp.classList.add('posee-input-correct');
            } else {
                inp.classList.add('posee-input-wrong');
            }
        });
    }

    finishPoseeValidation(allCorrect);
    validateMultiplicationCarries();
}

function validateSimplePosee() {
    const a = poseeState.a;
    const b = poseeState.b;
    const result = config.operation === 'subtraction' ? a - b : a + b;
    const resultStr = String(result);
    const grid = poseeEl.grid;

    let allCorrect = true;

    const inputs = grid.querySelectorAll('.posee-input');
    let userAnswer = '';
    inputs.forEach(inp => { userAnswer += inp.value || ''; });
    if (userAnswer !== resultStr) allCorrect = false;

    inputs.forEach((inp, idx) => {
        inp.readOnly = true;
        if (inp.value === resultStr[idx]) {
            inp.classList.add('posee-input-correct');
        } else {
            inp.classList.add('posee-input-wrong');
        }
    });

    finishPoseeValidation(allCorrect);
    if (config.operation === 'subtraction') {
        validateSubtractionCarries();
    } else {
        validateAdditionCarries();
    }
}

function finishPoseeValidation(allCorrect) {
    const a = poseeState.a;
    const b = poseeState.b;
    const op = getOperatorSymbol();
    const result = config.operation === 'multiplication' ? a * b
        : config.operation === 'subtraction' ? a - b : a + b;

    poseeState.validated = true;
    poseeState.history.push({ a, b, result, isCorrect: allCorrect });

    if (allCorrect) {
        poseeState.correctCount++;
        poseeEl.correctCount.textContent = poseeState.correctCount;
        poseeEl.feedback.textContent = 'Bravo ! \uD83C\uDF89';
        poseeEl.feedback.className = 'feedback correct';
    } else {
        poseeState.wrongCount++;
        poseeEl.wrongCount.textContent = poseeState.wrongCount;
        poseeEl.feedback.textContent = `La bonne r\u00e9ponse est ${a} ${op} ${b} = ${result}`;
        poseeEl.feedback.className = 'feedback wrong';
    }

    poseeEl.btnValidate.style.display = 'none';
    poseeEl.btnNext.style.display = '';
    poseeEl.btnNext.focus();
}

function validateMultiplicationCarries() {
    const a = poseeState.a;
    const b = poseeState.b;
    const aStr = String(a);
    const bStr = String(b);
    const bDigits = bStr.split('').map(Number);
    const maxLen = parseInt(poseeEl.grid.style.getPropertyValue('--posee-cols'));
    const padA = maxLen - aStr.length;

    const groups = bDigits.length > 1 ? bDigits.length : 1;
    for (let g = 0; g < groups; g++) {
        const digit = bDigits.length > 1 ? bDigits[bDigits.length - 1 - g] : b;
        const carryInputs = poseeEl.grid.querySelectorAll(`.posee-carry-input[data-group="${g}"]`);

        const expectedCarries = {};
        let carry = 0;
        for (let i = aStr.length - 1; i >= 0; i--) {
            const d = parseInt(aStr[i]);
            const product = d * digit + carry;
            carry = Math.floor(product / 10);
            if (carry > 0) {
                const col = padA + i - 1;
                if (col >= 0) expectedCarries[col] = carry;
            }
        }

        carryInputs.forEach(inp => {
            inp.readOnly = true;
            const col = parseInt(inp.dataset.col);
            const expected = expectedCarries[col];
            const userVal = inp.value.trim();

            if (expected) {
                if (userVal === String(expected)) {
                    inp.classList.add('posee-carry-correct');
                } else {
                    inp.value = expected;
                    inp.classList.add('posee-carry-shown');
                }
            } else {
                if (userVal && userVal !== '0') {
                    inp.value = '';
                    inp.classList.add('posee-carry-wrong');
                }
            }
        });
    }
}

function validateAdditionCarries() {
    const a = poseeState.a;
    const b = poseeState.b;
    const aStr = String(a);
    const bStr = String(b);
    const maxLen = parseInt(poseeEl.grid.style.getPropertyValue('--posee-cols'));

    const carryInputs = poseeEl.grid.querySelectorAll('.posee-carry-input[data-group="0"]');

    // Compute expected carries for addition
    const expectedCarries = {};
    let carry = 0;
    const maxDigits = Math.max(aStr.length, bStr.length);
    for (let i = 0; i < maxDigits; i++) {
        const dA = i < aStr.length ? parseInt(aStr[aStr.length - 1 - i]) : 0;
        const dB = i < bStr.length ? parseInt(bStr[bStr.length - 1 - i]) : 0;
        const sum = dA + dB + carry;
        carry = Math.floor(sum / 10);
        if (carry > 0) {
            const col = maxLen - 2 - i;
            if (col >= 0) expectedCarries[col] = carry;
        }
    }

    carryInputs.forEach(inp => {
        inp.readOnly = true;
        const col = parseInt(inp.dataset.col);
        const expected = expectedCarries[col];
        const userVal = inp.value.trim();

        if (expected) {
            if (userVal === String(expected)) {
                inp.classList.add('posee-carry-correct');
            } else {
                inp.value = expected;
                inp.classList.add('posee-carry-shown');
            }
        } else {
            if (userVal && userVal !== '0') {
                inp.value = '';
                inp.classList.add('posee-carry-wrong');
            }
        }
    });
}

function validateSubtractionCarries() {
    const a = poseeState.a;
    const b = poseeState.b;
    const aStr = String(a);
    const bStr = String(b);
    const maxLen = parseInt(poseeEl.grid.style.getPropertyValue('--posee-cols'));

    const carryInputs = poseeEl.grid.querySelectorAll('.posee-carry-input[data-group="0"]');

    const expectedBorrows = {};
    let borrow = 0;
    const maxDigits = Math.max(aStr.length, bStr.length);
    for (let i = 0; i < maxDigits; i++) {
        const dA = i < aStr.length ? parseInt(aStr[aStr.length - 1 - i]) : 0;
        const dB = i < bStr.length ? parseInt(bStr[bStr.length - 1 - i]) : 0;
        const diff = dA - dB - borrow;
        if (diff < 0) {
            borrow = 1;
            const col = maxLen - 2 - i;
            if (col >= 0) expectedBorrows[col] = 1;
        } else {
            borrow = 0;
        }
    }

    carryInputs.forEach(inp => {
        inp.readOnly = true;
        const col = parseInt(inp.dataset.col);
        const expected = expectedBorrows[col];
        const userVal = inp.value.trim();

        if (expected) {
            if (userVal === String(expected)) {
                inp.classList.add('posee-carry-correct');
            } else {
                inp.value = expected;
                inp.classList.add('posee-carry-shown');
            }
        } else {
            if (userVal && userVal !== '0') {
                inp.value = '';
                inp.classList.add('posee-carry-wrong');
            }
        }
    });
}

function nextPosee() {
    generatePosee();
}

poseeEl.btnValidate.addEventListener('click', validatePosee);
poseeEl.btnNext.addEventListener('click', nextPosee);

poseeEl.btnStop.addEventListener('click', () => {
    showPoseeResults();
});

function showPoseeResults() {
    const total = poseeState.correctCount + poseeState.wrongCount;
    const op = getOperatorSymbol();

    poseeEl.statCorrect.textContent = poseeState.correctCount;
    poseeEl.statWrong.textContent = poseeState.wrongCount;

    if (total === 0) {
        poseeEl.resultsIcon.textContent = '\uD83D\uDC4B';
        poseeEl.resultsTitle.textContent = '\u00c0 bient\u00f4t !';
    } else if (poseeState.wrongCount === 0) {
        poseeEl.resultsIcon.textContent = '\uD83C\uDFC6';
        poseeEl.resultsTitle.textContent = 'Parfait !';
    } else if (poseeState.correctCount >= poseeState.wrongCount) {
        poseeEl.resultsIcon.textContent = '\uD83D\uDC4D';
        poseeEl.resultsTitle.textContent = 'Bien jou\u00e9 !';
    } else {
        poseeEl.resultsIcon.textContent = '\uD83D\uDCAA';
        poseeEl.resultsTitle.textContent = 'Continue !';
    }

    const errors = poseeState.history.filter(h => !h.isCorrect);
    if (errors.length > 0) {
        poseeEl.errorsSection.classList.add('visible');
        poseeEl.errorsList.textContent = '';
        errors.forEach(e => {
            const span = document.createElement('span');
            span.className = 'error-item';
            span.textContent = `${e.a} ${op} ${e.b} = ${e.result}`;
            poseeEl.errorsList.appendChild(span);
        });
    } else {
        poseeEl.errorsSection.classList.remove('visible');
    }

    showScreen('poseeResults');
}

poseeEl.btnReplay.addEventListener('click', () => {
    showScreen('modes');
});

// ============================================================
// MULTIPLAYER MODE
// ============================================================

const WIN_SCORE = 20;

const multi = {
    eventSource: null,
    playerId: null,
    playerName: '',
    opponentName: '',
    myScore: 0,
    opponentScore: 0
};

const multiEl = {
    btnMulti: document.getElementById('btn-multi'),
    btnBackHome: document.getElementById('btn-back-home'),
    joinForm: document.getElementById('join-form'),
    playerName: document.getElementById('player-name'),
    waitingName: document.getElementById('waiting-name'),
    player1Name: document.getElementById('player1-name'),
    player2Name: document.getElementById('player2-name'),
    player1Score: document.getElementById('player1-score'),
    player2Score: document.getElementById('player2-score'),
    player1Progress: document.getElementById('player1-progress'),
    player2Progress: document.getElementById('player2-progress'),
    multiNum1: document.getElementById('multi-num1'),
    multiNum2: document.getElementById('multi-num2'),
    multiOperator: document.getElementById('multi-operator'),
    multiAnswerForm: document.getElementById('multi-answer-form'),
    multiAnswerInput: document.getElementById('multi-answer-input'),
    multiFeedback: document.getElementById('multi-feedback'),
    winIcon: document.getElementById('win-icon'),
    winTitle: document.getElementById('win-title'),
    winMessage: document.getElementById('win-message'),
    winYourName: document.getElementById('win-your-name'),
    winYourScore: document.getElementById('win-your-score'),
    winOpponentName: document.getElementById('win-opponent-name'),
    winOpponentScore: document.getElementById('win-opponent-score'),
    btnPlayAgainMulti: document.getElementById('btn-play-again-multi')
};

multiEl.btnMulti.addEventListener('click', () => {
    showScreen('multiJoin');
    multiEl.playerName.focus();
});

multiEl.btnBackHome.addEventListener('click', () => {
    if (multi.eventSource) {
        multi.eventSource.close();
        multi.eventSource = null;
    }
    multi.playerId = null;
    showScreen('modes');
});

function joinGame() {
    const name = multiEl.playerName.value.trim();
    if (!name) return;

    multi.playerName = name;
    multi.myScore = 0;
    multi.opponentScore = 0;

    connectSSE(name);
}

document.getElementById('btn-join').addEventListener('click', joinGame);
multiEl.playerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinGame();
});

const waitingStatusEl = document.getElementById('waiting-status');

async function connectSSE(name) {
    if (multi.eventSource) {
        multi.eventSource.close();
        multi.eventSource = null;
    }

    multiEl.waitingName.textContent = name;
    waitingStatusEl.textContent = 'Connexion...';
    showScreen('multiWaiting');

    try {
        const res = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, operation: config.operation })
        });

        if (!res.ok) {
            waitingStatusEl.textContent = 'Erreur de connexion';
            return;
        }

        const { playerId } = await res.json();
        multi.playerId = playerId;

        const es = new EventSource(`/api/events?playerId=${playerId}`);
        multi.eventSource = es;

        es.addEventListener('waiting', (e) => {
            multiEl.waitingName.textContent = multi.playerName;
            waitingStatusEl.textContent = '';
            showScreen('multiWaiting');
        });

        es.addEventListener('start', (e) => {
            const msg = JSON.parse(e.data);
            multi.opponentName = msg.opponent;
            multi.myScore = 0;
            multi.opponentScore = 0;
            startMultiRace(msg);
        });

        es.addEventListener('scoreUpdate', (e) => {
            const msg = JSON.parse(e.data);
            multi.myScore = msg.yourScore;
            multi.opponentScore = msg.opponentScore;
            handleScoreUpdate(msg);
        });

        es.addEventListener('opponentScore', (e) => {
            const msg = JSON.parse(e.data);
            multi.opponentScore = msg.opponentScore;
            updateRaceTrack();
        });

        es.addEventListener('win', (e) => {
            const msg = JSON.parse(e.data);
            showWinScreen(msg.winner);
        });

        es.addEventListener('opponentLeft', () => {
            showOpponentLeft();
        });

        es.onerror = () => {
            if (es.readyState === EventSource.CLOSED) {
                multi.eventSource = null;
                multi.playerId = null;
                const screen = getActiveScreen();
                if (screen === 'multiRace') {
                    showOpponentLeft();
                }
            }
        };
    } catch (err) {
        waitingStatusEl.textContent = 'Erreur de connexion';
    }
}

function startMultiRace(msg) {
    multiEl.player1Name.textContent = multi.playerName;
    multiEl.player2Name.textContent = multi.opponentName;

    multiEl.player1Score.textContent = '0';
    multiEl.player2Score.textContent = '0';
    multiEl.player1Progress.style.width = '0%';
    multiEl.player2Progress.style.width = '0%';

    multiEl.multiOperator.textContent = getOperatorSymbol();
    multiEl.multiNum1.textContent = msg.question.a;
    multiEl.multiNum2.textContent = msg.question.b;

    multiEl.multiFeedback.textContent = '';
    multiEl.multiFeedback.className = 'feedback';

    multiEl.multiAnswerInput.value = '';
    showScreen('multiRace');

    requestAnimationFrame(() => {
        multiEl.multiAnswerInput.focus();
    });
}

function handleScoreUpdate(msg) {
    const feedbackEl = multiEl.multiFeedback;

    if (msg.correct) {
        feedbackEl.textContent = '+1 Bravo ! \uD83D\uDE80';
        feedbackEl.className = 'feedback correct';
        animateRocket('player1');
    } else {
        feedbackEl.textContent = `-3 ! La r\u00e9ponse \u00e9tait ${msg.correctAnswer}`;
        feedbackEl.className = 'feedback wrong';
        animateRocketBack('player1');
    }

    updateRaceTrack();

    multiEl.multiNum1.textContent = msg.question.a;
    multiEl.multiNum2.textContent = msg.question.b;

    multiEl.multiAnswerInput.value = '';
    multiEl.multiAnswerInput.focus();

    setTimeout(() => {
        feedbackEl.textContent = '';
        feedbackEl.className = 'feedback';
    }, msg.correct ? 600 : 1200);
}

function updateRaceTrack() {
    const myPct = Math.min((multi.myScore / WIN_SCORE) * 100, 100);
    const oppPct = Math.min((multi.opponentScore / WIN_SCORE) * 100, 100);

    multiEl.player1Progress.style.width = `${myPct}%`;
    multiEl.player2Progress.style.width = `${oppPct}%`;

    multiEl.player1Score.textContent = multi.myScore;
    multiEl.player2Score.textContent = multi.opponentScore;
}

function animateRocket(player) {
    const el = player === 'player1' ? multiEl.player1Progress : multiEl.player2Progress;
    el.classList.add('rocket-boost');
    setTimeout(() => el.classList.remove('rocket-boost'), 400);
}

function animateRocketBack(player) {
    const el = player === 'player1' ? multiEl.player1Progress : multiEl.player2Progress;
    el.classList.add('rocket-retreat');
    setTimeout(() => el.classList.remove('rocket-retreat'), 400);
}

function showWinScreen(winnerName) {
    const isMe = winnerName === multi.playerName;

    multiEl.winIcon.textContent = isMe ? '\uD83C\uDFC6' : '\uD83D\uDE22';
    multiEl.winTitle.textContent = isMe ? 'Victoire !' : 'D\u00e9faite...';
    multiEl.winMessage.textContent = isMe
        ? 'Tu as gagn\u00e9 la course de fus\u00e9es !'
        : `${winnerName} a gagn\u00e9 la course !`;

    multiEl.winYourName.textContent = multi.playerName;
    multiEl.winYourScore.textContent = multi.myScore;
    multiEl.winOpponentName.textContent = multi.opponentName;
    multiEl.winOpponentScore.textContent = multi.opponentScore;

    showScreen('multiWin');
}

function showOpponentLeft() {
    multiEl.winIcon.textContent = '\uD83D\uDEAA';
    multiEl.winTitle.textContent = 'Adversaire d\u00e9connect\u00e9';
    multiEl.winMessage.textContent = `${multi.opponentName} a quitt\u00e9 la partie.`;

    multiEl.winYourName.textContent = multi.playerName;
    multiEl.winYourScore.textContent = multi.myScore;
    multiEl.winOpponentName.textContent = multi.opponentName;
    multiEl.winOpponentScore.textContent = multi.opponentScore;

    showScreen('multiWin');
}

multiEl.multiAnswerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const answer = parseInt(multiEl.multiAnswerInput.value);
    if (isNaN(answer) || !multi.playerId) return;

    fetch('/api/answer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Player-ID': multi.playerId
        },
        body: JSON.stringify({ answer })
    });
});

multiEl.btnPlayAgainMulti.addEventListener('click', () => {
    if (multi.eventSource) {
        multi.eventSource.close();
        multi.eventSource = null;
    }
    multi.playerId = null;
    showScreen('modes');
});
