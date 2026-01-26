// État du jeu
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

// Éléments DOM
const screens = {
    home: document.getElementById('screen-home'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results')
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

    // Crée toutes les combinaisons possibles
    const allCombinations = [];
    for (const a of tables) {
        for (const b of tables) {
            allCombinations.push({ a, b, answer: a * b });
        }
    }

    // Mélange et sélectionne le nombre requis
    shuffleArray(allCombinations);

    // Si on a besoin de plus de questions que de combinaisons, on répète
    while (questions.length < count) {
        const remaining = count - questions.length;
        const toAdd = allCombinations.slice(0, remaining);
        questions.push(...toAdd);
        shuffleArray(allCombinations);
    }

    return questions;
}

// Mélange un tableau (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Affiche un écran
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Formate le temps en MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Démarre une partie
function startGame(totalTime, totalQuestions) {
    // Réinitialise l'état
    state.totalTime = totalTime;
    state.totalQuestions = totalQuestions;
    state.currentQuestion = 0;
    state.timeRemaining = totalTime;
    state.startTime = Date.now();
    state.questions = generateQuestions(totalQuestions);
    state.answers = [];
    state.correct = 0;
    state.wrong = 0;

    // Met à jour l'interface
    elements.totalQuestions.textContent = totalQuestions;
    elements.timerDisplay.textContent = formatTime(totalTime);
    elements.timer.classList.remove('warning', 'danger');
    elements.feedback.textContent = '';
    elements.feedback.className = 'feedback';

    // Affiche l'écran de jeu
    showScreen('game');

    // Affiche la première question
    showQuestion();

    // Démarre le timer
    state.timerInterval = setInterval(updateTimer, 1000);

    // Focus sur l'input
    elements.answerInput.focus();
}

// Met à jour le timer
function updateTimer() {
    state.timeRemaining--;
    elements.timerDisplay.textContent = formatTime(state.timeRemaining);

    // Couleurs d'alerte
    if (state.timeRemaining <= 30) {
        elements.timer.classList.add('danger');
        elements.timer.classList.remove('warning');
    } else if (state.timeRemaining <= 60) {
        elements.timer.classList.add('warning');
    }

    // Temps écoulé
    if (state.timeRemaining <= 0) {
        endGame(true);
    }
}

// Affiche la question actuelle
function showQuestion() {
    const question = state.questions[state.currentQuestion];
    elements.num1.textContent = question.a;
    elements.num2.textContent = question.b;
    elements.currentQuestion.textContent = state.currentQuestion + 1;

    // Met à jour la barre de progression
    const progress = (state.currentQuestion / state.totalQuestions) * 100;
    elements.progressFill.style.width = `${progress}%`;

    // Vide l'input
    elements.answerInput.value = '';
    elements.answerInput.focus();
}

// Vérifie la réponse
function checkAnswer(userAnswer) {
    const question = state.questions[state.currentQuestion];
    const isCorrect = userAnswer === question.answer;

    // Enregistre la réponse
    state.answers.push({
        question,
        userAnswer,
        isCorrect
    });

    if (isCorrect) {
        state.correct++;
        elements.feedback.textContent = 'Bravo ! 🎉';
        elements.feedback.className = 'feedback correct';
    } else {
        state.wrong++;
        elements.feedback.textContent = `${question.a} × ${question.b} = ${question.answer}`;
        elements.feedback.className = 'feedback wrong';
    }

    // Passe à la question suivante après un court délai
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

// Termine la partie
function endGame(timeout) {
    // Arrête le timer
    clearInterval(state.timerInterval);

    // Calcule le temps écoulé
    const timeElapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const displayTime = timeout ? state.totalTime : timeElapsed;

    // Met à jour les statistiques
    elements.statCorrect.textContent = state.correct;
    elements.statWrong.textContent = state.wrong;
    elements.statTime.textContent = formatTime(displayTime);

    const score = Math.round((state.correct / state.totalQuestions) * 100);
    elements.statScore.textContent = `${score}%`;

    // En-tête selon le résultat
    if (timeout) {
        elements.resultsHeader.innerHTML = `
            <span class="results-icon">⏱️</span>
            <h2>Temps écoulé!</h2>
        `;
    } else if (score >= 80) {
        elements.resultsHeader.innerHTML = `
            <span class="results-icon">🏆</span>
            <h2>Excellent!</h2>
        `;
    } else if (score >= 50) {
        elements.resultsHeader.innerHTML = `
            <span class="results-icon">👍</span>
            <h2>Bien joué!</h2>
        `;
    } else {
        elements.resultsHeader.innerHTML = `
            <span class="results-icon">💪</span>
            <h2>Continue!</h2>
        `;
    }

    // Affiche les erreurs à réviser
    const errors = state.answers.filter(a => !a.isCorrect);
    if (errors.length > 0) {
        elements.errorsSection.classList.add('visible');
        elements.errorsList.innerHTML = errors.map(e =>
            `<span class="error-item">${e.question.a} × ${e.question.b} = ${e.question.answer}</span>`
        ).join('');
    } else {
        elements.errorsSection.classList.remove('visible');
    }

    // Affiche l'écran de résultats
    showScreen('results');
}

// Événements
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

// Empêche le zoom sur iOS lors du focus sur l'input
document.addEventListener('touchstart', () => {}, { passive: true });
