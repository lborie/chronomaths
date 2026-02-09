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
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results'),
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

// Génère les questions de multiplication
function generateQuestions(count) {
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
        const toAdd = allCombinations.slice(0, remaining);
        questions.push(...toAdd);
        shuffleArray(allCombinations);
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

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startGame(totalTime, totalQuestions) {
    state.totalTime = totalTime;
    state.totalQuestions = totalQuestions;
    state.currentQuestion = 0;
    state.timeRemaining = totalTime;
    state.startTime = Date.now();
    state.questions = generateQuestions(totalQuestions);
    state.answers = [];
    state.correct = 0;
    state.wrong = 0;

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

    state.answers.push({ question, userAnswer, isCorrect });

    if (isCorrect) {
        state.correct++;
        elements.feedback.textContent = 'Bravo ! 🎉';
        elements.feedback.className = 'feedback correct';
    } else {
        state.wrong++;
        elements.feedback.textContent = `${question.a} \u00d7 ${question.b} = ${question.answer}`;
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

    const timeElapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const displayTime = timeout ? state.totalTime : timeElapsed;

    elements.statCorrect.textContent = state.correct;
    elements.statWrong.textContent = state.wrong;
    elements.statTime.textContent = formatTime(displayTime);

    const score = Math.round((state.correct / state.totalQuestions) * 100);
    elements.statScore.textContent = `${score}%`;

    // Update results header using DOM methods
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
            span.textContent = `${e.question.a} \u00d7 ${e.question.b} = ${e.question.answer}`;
            elements.errorsList.appendChild(span);
        });
    } else {
        elements.errorsSection.classList.remove('visible');
    }

    showScreen('results');
}

// Solo events
document.querySelectorAll('.mode-btn').forEach(btn => {
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
    showScreen('home');
});

document.addEventListener('touchstart', () => {}, { passive: true });

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

// Navigate to multiplayer join screen
multiEl.btnMulti.addEventListener('click', () => {
    showScreen('multiJoin');
    multiEl.playerName.focus();
});

multiEl.btnBackHome.addEventListener('click', () => {
    if (multi.ws) {
        multi.ws.close();
        multi.ws = null;
    }
    showScreen('home');
});

// Join game
multiEl.joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = multiEl.playerName.value.trim();
    if (!name) return;

    multi.playerName = name;
    multi.myScore = 0;
    multi.opponentScore = 0;

    connectWebSocket(name);
});

const waitingStatusEl = document.getElementById('waiting-status');

function connectWebSocket(name) {
    // Close any existing connection first
    if (multi.ws) {
        multi.ws.onclose = null;
        multi.ws.close();
        multi.ws = null;
    }

    // Show waiting screen with "Connexion..." status
    multiEl.waitingName.textContent = name;
    waitingStatusEl.textContent = 'Connexion...';
    showScreen('multiWaiting');

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    console.log('[WS] connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);
    multi.ws = ws;

    ws.onopen = () => {
        console.log('[WS] connected, sending join');
        waitingStatusEl.textContent = '';
        ws.send(JSON.stringify({ type: 'join', data: { name } }));
    };

    ws.onmessage = (event) => {
        console.log('[WS] received:', event.data);
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
    };

    ws.onerror = (err) => {
        console.error('[WS] error:', err);
        waitingStatusEl.textContent = 'Erreur de connexion';
    };

    ws.onclose = () => {
        console.log('[WS] closed');
        multi.ws = null;
    };
}

function handleServerMessage(msg) {
    console.log('[MSG] handling:', msg.type);
    switch (msg.type) {
        case 'waiting':
            multiEl.waitingName.textContent = multi.playerName;
            showScreen('multiWaiting');
            break;

        case 'start':
            console.log('[MSG] start received, opponent:', msg.opponent);
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

    multiEl.multiNum1.textContent = msg.question.a;
    multiEl.multiNum2.textContent = msg.question.b;

    multiEl.multiFeedback.textContent = '';
    multiEl.multiFeedback.className = 'feedback';

    multiEl.multiAnswerInput.value = '';
    console.log('[RACE] showing multiRace screen');
    showScreen('multiRace');
    console.log('[RACE] multiRace screen active:', screens.multiRace.classList.contains('active'));

    // Defer focus to next frame - Safari/iPad blocks .focus() outside user gestures
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

// Multi answer submit
multiEl.multiAnswerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const answer = parseInt(multiEl.multiAnswerInput.value);
    if (isNaN(answer) || !multi.ws) return;

    multi.ws.send(JSON.stringify({ type: 'answer', data: { answer } }));
});

// Play again multi
multiEl.btnPlayAgainMulti.addEventListener('click', () => {
    if (multi.ws) {
        multi.ws.close();
        multi.ws = null;
    }
    showScreen('home');
});
