// ============================================================
// CONFIGURATION GLOBALE
// ============================================================
const config = {
    operation: 'multiplication' // 'multiplication' | 'addition'
};

function getOperatorSymbol() {
    return config.operation === 'multiplication' ? '×' : '+';
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

function generateQuestions(count) {
    return config.operation === 'multiplication'
        ? generateMultiplicationQuestions(count)
        : generateAdditionQuestions(count);
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

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Met à jour l'écran des modes selon l'opération choisie
function updateModesScreen() {
    const isMulti = config.operation === 'multiplication';

    document.getElementById('modes-emoji').textContent = isMulti ? '🧮' : '➕';
    document.getElementById('modes-title-text').textContent = isMulti ? 'Multiplications' : 'Additions';
    document.getElementById('modes-subtitle').textContent = isMulti
        ? 'Deviens une championne des multiplications!'
        : 'Deviens une championne des additions!';

    // Bouton posée
    document.getElementById('posee-btn-title').textContent = isMulti
        ? 'Multiplications posées' : 'Additions posées';
    document.getElementById('posee-btn-desc').textContent = isMulti
        ? 'Apprends à poser les multiplications avec retenue'
        : 'Apprends à poser les additions avec retenue';

    // Bouton révision
    document.getElementById('practice-btn-title').textContent = isMulti
        ? 'Révision par table' : 'Révision par nombre';
    document.getElementById('practice-btn-desc').textContent = isMulti
        ? 'Entraîne-toi sur une table au choix'
        : 'Entraîne-toi avec un nombre au choix';

    // Écran posée difficulté
    document.getElementById('posee-diff-title').textContent = isMulti
        ? 'Multiplication posée' : 'Addition posée';
    document.getElementById('posee-screen-title').textContent = isMulti
        ? 'Multiplication posée' : 'Addition posée';

    if (isMulti) {
        document.getElementById('posee-easy-details').textContent = '× 1 chiffre';
        document.getElementById('posee-easy-example').textContent = 'ex: 47 × 3';
        document.getElementById('posee-medium-details').textContent = '× 2 chiffres';
        document.getElementById('posee-medium-example').textContent = 'ex: 47 × 23';
        document.getElementById('posee-hard-details').textContent = '× 3 chiffres';
        document.getElementById('posee-hard-example').textContent = 'ex: 234 × 123';
    } else {
        document.getElementById('posee-easy-details').textContent = '2 chiffres';
        document.getElementById('posee-easy-example').textContent = 'ex: 47 + 38';
        document.getElementById('posee-medium-details').textContent = '3 chiffres';
        document.getElementById('posee-medium-example').textContent = 'ex: 247 + 385';
        document.getElementById('posee-hard-details').textContent = '4 chiffres';
        document.getElementById('posee-hard-example').textContent = 'ex: 2345 + 1678';
    }

    // Écran table/nombre select
    updateTableSelectScreen();
}

function updateTableSelectScreen() {
    const isMulti = config.operation === 'multiplication';
    const grid = document.getElementById('table-grid');
    const startBtn = document.getElementById('btn-table-start');
    const selected = new Set();

    document.getElementById('table-select-title').textContent = isMulti
        ? 'Révision par table' : 'Révision par nombre';
    document.getElementById('table-select-subtitle').textContent = isMulti
        ? 'Quelles tables veux-tu réviser ?' : 'Quels nombres veux-tu travailler ?';
    document.getElementById('table-select-heading').textContent = isMulti
        ? 'Choisis tes tables :' : 'Choisis tes nombres :';

    const values = isMulti
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
        const questions = isMulti
            ? generateTableQuestions(vals, totalQuestions)
            : generateNumberQuestions(vals, totalQuestions);
        startGame(totalTime, totalQuestions, questions);
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
    const isMulti = config.operation === 'multiplication';

    if (isMulti) {
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
    } else {
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

    if (isMulti) {
        renderMultiplicationPosee();
    } else {
        renderAdditionPosee();
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

function renderAdditionPosee() {
    const a = poseeState.a;
    const b = poseeState.b;
    const aStr = String(a);
    const bStr = String(b);
    const result = a + b;
    const resultStr = String(result);

    const maxLen = Math.max(aStr.length + 1, bStr.length + 1, resultStr.length);

    const grid = poseeEl.grid;
    grid.textContent = '';
    grid.style.setProperty('--posee-cols', maxLen);

    const padA = maxLen - aStr.length;
    const padB = maxLen - bStr.length;

    // Carry row
    const carryStart = Math.max(0, padA - 1);
    const carryEnd = maxLen - 2;
    grid.appendChild(createCarryRow(maxLen, carryStart, carryEnd, 0));

    // First number
    grid.appendChild(createDigitRow(maxLen, aStr, padA));

    // Second number with + operator
    const rowB = document.createElement('div');
    rowB.className = 'posee-row';
    for (let i = 0; i < maxLen; i++) {
        const cell = document.createElement('div');
        cell.className = 'posee-cell';
        if (i === padB - 1) {
            cell.textContent = '+';
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
        validateAdditionPosee();
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

function validateAdditionPosee() {
    const result = poseeState.a + poseeState.b;
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
    validateAdditionCarries();
}

function finishPoseeValidation(allCorrect) {
    const a = poseeState.a;
    const b = poseeState.b;
    const op = getOperatorSymbol();
    const result = config.operation === 'multiplication' ? a * b : a + b;

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
    ws: null,
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
    if (multi.ws) {
        multi.ws.close();
        multi.ws = null;
    }
    showScreen('modes');
});

function joinGame() {
    const name = multiEl.playerName.value.trim();
    if (!name) return;

    multi.playerName = name;
    multi.myScore = 0;
    multi.opponentScore = 0;

    connectWebSocket(name);
}

document.getElementById('btn-join').addEventListener('click', joinGame);
multiEl.playerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinGame();
});

const waitingStatusEl = document.getElementById('waiting-status');

function connectWebSocket(name) {
    if (multi.ws) {
        multi.ws.onclose = null;
        multi.ws.close();
        multi.ws = null;
    }

    multiEl.waitingName.textContent = name;
    waitingStatusEl.textContent = 'Connexion...';
    showScreen('multiWaiting');

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    multi.ws = ws;

    ws.onopen = () => {
        waitingStatusEl.textContent = '';
        ws.send(JSON.stringify({ type: 'join', data: { name, operation: config.operation } }));
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
    };

    ws.onerror = () => {
        waitingStatusEl.textContent = 'Erreur de connexion';
    };

    ws.onclose = () => {
        multi.ws = null;
    };
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case 'waiting':
            multiEl.waitingName.textContent = multi.playerName;
            showScreen('multiWaiting');
            break;

        case 'start':
            multi.opponentName = msg.opponent;
            multi.myScore = 0;
            multi.opponentScore = 0;
            startMultiRace(msg);
            break;

        case 'scoreUpdate':
            multi.myScore = msg.yourScore;
            multi.opponentScore = msg.opponentScore;
            handleScoreUpdate(msg);
            break;

        case 'opponentScore':
            multi.opponentScore = msg.opponentScore;
            updateRaceTrack();
            break;

        case 'win':
            showWinScreen(msg.winner);
            break;

        case 'opponentLeft':
            showOpponentLeft();
            break;
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
    if (isNaN(answer) || !multi.ws) return;

    multi.ws.send(JSON.stringify({ type: 'answer', data: { answer } }));
});

multiEl.btnPlayAgainMulti.addEventListener('click', () => {
    if (multi.ws) {
        multi.ws.close();
        multi.ws = null;
    }
    showScreen('modes');
});
