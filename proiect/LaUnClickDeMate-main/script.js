// ==========================================================================
// MathInfo 9 H2H — Learn & Arena
// Liceul Teoretic „Emil Racoviță” Vaslui — Erasmus+ DIGI-EQUAL
// Core Application Logic & Interactive Engines
// ==========================================================================

// --- GLOBAL APPLICATION STATE ---
let localChapters = [];
let localH2HQuestions = [];
let currentCategoryFilter = 'all';
let currentSearchQuery = '';

let currentUser = JSON.parse(localStorage.getItem('mathinfo9_user')) || {
    username: 'Boboc_LER',
    role: 'student',
    school: 'Liceul Teoretic „Emil Racoviță” Vaslui',
    grade: '9A',
    token: 'local_token_' + Date.now()
};

let userProgress = JSON.parse(localStorage.getItem('mathinfo9_progress')) || {
    chaptersExplored: [],
    exercisesCorrect: 0,
    duelWins: 0,
    duelLosses: 0,
    xp: 120,
    level: 1,
    badges: ['Boboc LER'],
    lastChallengeDate: null,
    highestStreak: 0,
    history: []
};

let soundEnabled = localStorage.getItem('mathinfo9_sound') !== 'false';
let ttsEnabled = localStorage.getItem('mathinfo9_tts') === 'true';

// --- WEB AUDIO API SYNTHESIZER (ZERO EXTERNAL ASSETS NEEDED) ---
let audioCtx = null;

function initAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!soundEnabled) return;
    try {
        initAudioContext();
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'correct') {
            // Arpeggio / Chord
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'wrong') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(140, now + 0.2);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'tick') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.03);
            osc.start(now);
            osc.stop(now + 0.03);
        } else if (type === 'victory') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.12);
            osc.frequency.setValueAtTime(783.99, now + 0.24);
            osc.frequency.setValueAtTime(1046.50, now + 0.36);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.65);
            osc.start(now);
            osc.stop(now + 0.65);
        }
    } catch (e) {
        // Fallback quiet
    }
}

function toggleSoundFX() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('mathinfo9_sound', String(soundEnabled));
    const btn = document.getElementById('btn-audio-fx');
    if (btn) {
        btn.textContent = soundEnabled ? '🔊 ON' : '🔇 OFF';
    }
    if (soundEnabled) playSound('click');
}

// --- PERSISTENCE & TOAST ---
function saveProgress() {
    localStorage.setItem('mathinfo9_progress', JSON.stringify(userProgress));
    updateHeaderStats();
}

function showToast(msg) {
    const toast = document.getElementById('auth-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
}

function updateHeaderStats() {
    const levelEl = document.getElementById('header-user-level');
    const xpEl = document.getElementById('header-user-xp');
    const winsEl = document.getElementById('header-duel-wins');
    
    // Calculate level: every 200 XP = 1 Level
    const calculatedLevel = Math.max(1, Math.floor(userProgress.xp / 200) + 1);
    userProgress.level = calculatedLevel;

    if (levelEl) levelEl.textContent = `Nivel ${calculatedLevel}`;
    if (xpEl) xpEl.textContent = `${userProgress.xp} XP`;
    if (winsEl) winsEl.textContent = `${userProgress.duelWins} W`;

    const authBtn = document.getElementById('btn-header-auth');
    if (authBtn && currentUser && currentUser.username) {
        authBtn.textContent = `👤 ${currentUser.username}`;
    }
}

// --- CONFETTI LAUNCHER ---
function launchConfetti() {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 120,
            spread: 75,
            origin: { y: 0.6 },
            colors: ['#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']
        });
    }
}

// ==========================================================================
// 1. FUNDAL INTERACTIV CU PARTICULE (MATEMATICĂ & COD C++)
// ==========================================================================
function initInteractiveBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width, height;
    let particles = [];

    const mathSymbols = ['Δ = b² - 4ac', 'sin²x + cos²x = 1', 'a_n = a₁ + (n-1)r', 'x₁,₂ = (-b±√Δ)/2a', 'V(-b/2a, -Δ/4a)', 'A = p·r', 'AB + BC = AC', '||v|| = √(x²+y²)', 'b_n = b₁·qⁿ⁻¹', 'f: R → R', '∀x ∈ R', '∃x, P(x)', 'A ∪ B', 'A ∩ B'];
    const cppTokens = ['#include <iostream>', 'using namespace std;', 'int main()', 'cin >> n;', 'cout << "LER";', 'for (int i=1; i<=n; i++)', 'while (n > 0)', 'n % 10', 'swap(a, b);', 'vector<int> v;', 'bool prim = true;', 'd * d <= n', 'a % b', 'return 0;'];
    const allTokens = [...mathSymbols, ...cppTokens];
    const colors = ['#6366F1', '#06B6D4', '#10B981', '#818CF8', '#38BDF8', '#F59E0B'];

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    class TokenParticle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.text = allTokens[Math.floor(Math.random() * allTokens.length)];
            this.size = Math.floor(Math.random() * 5) + 11;
            this.speedX = (Math.random() - 0.5) * 0.35;
            this.speedY = (Math.random() - 0.5) * 0.35;
            this.opacity = Math.random() * 0.35 + 0.1;
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x < -80) this.x = width + 80;
            if (this.x > width + 80) this.x = -80;
            if (this.y < -40) this.y = height + 40;
            if (this.y > height + 40) this.y = -40;
        }

        draw() {
            ctx.save();
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity;
            ctx.font = `600 ${this.size}px "JetBrains Mono", monospace`;
            ctx.fillText(this.text, this.x, this.y);
            ctx.restore();
        }
    }

    function init() {
        resize();
        particles = [];
        const count = Math.min(45, Math.floor(width / 30));
        for (let i = 0; i < count; i++) {
            particles.push(new TokenParticle());
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize);
    init();
    animate();
}

// ==========================================================================
// 2. NAVIGARE & SCHIMBARE SECȚIUNI (SPA ROUTING)
// ==========================================================================
function changeView(viewId) {
    playSound('click');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update active state in nav
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-section') === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    if (viewId === 'home') {
        renderGreeting();
        fetchDailyChallenge();
    } else if (viewId === 'lectii') {
        renderCurriculumList();
    } else if (viewId === 'profil') {
        renderProfile();
    } else if (viewId === 'laborator') {
        runAlgorithmSimulation();
        updateFunctionPlot();
    } else if (viewId === 'competitie') {
        resetArenaToLobby();
    }
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.getAttribute('data-section');
        if (section) changeView(section);
    });
});

function renderGreeting() {
    const card = document.getElementById('user-greeting-card');
    const title = document.getElementById('user-greeting-title');
    if (!card || !title) return;

    if (currentUser && currentUser.username) {
        card.classList.remove('hidden');
        title.textContent = `Salut, ${currentUser.username}! 👋 Pregătit de duel?`;
    }
}

// ==========================================================================
// 3. CURRICULĂ & LECȚII (MATEMATICĂ & INFORMATICĂ IX)
// ==========================================================================
async function loadCurriculumData() {
    try {
        const res = await fetch('data/chapters.json');
        if (res.ok) {
            localChapters = await res.json();
        } else {
            throw new Error("HTTP error " + res.status);
        }
    } catch (e) {
        console.warn("Folosim datele curriculare implicite.");
        if (typeof DEFAULT_CHAPTERS !== 'undefined') {
            localChapters = DEFAULT_CHAPTERS;
        }
    }
    renderCurriculumList();
}

function filterCurriculum(subject) {
    playSound('click');
    currentCategoryFilter = subject;
    document.querySelectorAll('.curriculum-tabs-bar .btn-filter-tab').forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    renderCurriculumList();
}

function handleCurriculumSearch(query) {
    currentSearchQuery = (query || '').toLowerCase().trim();
    renderCurriculumList();
}

function renderCurriculumList() {
    const container = document.getElementById('chapter-list');
    if (!container) return;

    let filtered = localChapters;
    if (currentCategoryFilter !== 'all') {
        filtered = filtered.filter(ch => ch.subject === currentCategoryFilter);
    }
    if (currentSearchQuery) {
        filtered = filtered.filter(ch => 
            ch.title.toLowerCase().includes(currentSearchQuery) ||
            ch.summary.toLowerCase().includes(currentSearchQuery) ||
            (ch.keywords && ch.keywords.some(k => k.toLowerCase().includes(currentSearchQuery)))
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-500);">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🔍</div>
                <h3>Niciun capitol găsit conform căutării.</h3>
                <p>Încearcă alte cuvinte cheie precum: 'Viete', 'Euclid', 'vectori', 'sinus'.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(ch => {
        const isMath = ch.subject === 'math';
        const badgeClass = isMath ? 'math' : 'info';
        const badgeLabel = isMath ? '🧮 Matematică IX' : '💻 Informatică C++';

        return `
            <div class="chapter-card" onclick="showChapterDetail('${ch.id}')">
                <div class="chapter-card-top">
                    <div class="chapter-icon-wrap">${ch.icon || (isMath ? '📐' : '💻')}</div>
                    <span class="chapter-badge-chip ${badgeClass}">${badgeLabel}</span>
                </div>
                <h3>${ch.title}</h3>
                <p class="chapter-desc">${ch.summary}</p>
                <div class="chapter-card-footer">
                    <span>Nivel: <strong>${ch.difficulty || 'Mediu'}</strong></span>
                    <span class="chapter-action-cta">Citește Lecția →</span>
                </div>
            </div>
        `;
    }).join('');
}

function showChapterDetail(chId) {
    playSound('click');
    const ch = localChapters.find(c => c.id === chId);
    if (!ch) return;

    changeView('chapter-detail');
    const container = document.getElementById('detail-content');

    // Înregistrează explorarea capitolului pentru XP și ecusoane
    if (!userProgress.chaptersExplored.includes(chId)) {
        userProgress.chaptersExplored.push(chId);
        userProgress.xp += 15;
        saveProgress();
        checkBadges();
    }

    const lessonsHtml = "<ul>" + ch.lessons.map(l => `<li>${l}</li>`).join('') + "</ul>";

    // Formule / Teorie
    let formulasHtml = "";
    if (ch.formulas && ch.formulas.length > 0) {
        formulasHtml = `
            <div class="lesson-node">
                <h4>📐 Formule & Relații Cheie</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px;">
                    ${ch.formulas.map(f => `<span style="font-family:'JetBrains Mono', monospace; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); padding: 6px 14px; border-radius: var(--r-md); color: #E0E7FF; font-size: 0.9rem;">${f}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Exemple / Snippet-uri de Cod C++
    let examplesHtml = "";
    if (ch.examples && ch.examples.length > 0) {
        examplesHtml = `
            <div class="lesson-node">
                <h4>💡 Exemple & Aplicații Practice</h4>
                ${ch.examples.map(ex => {
                    const isCode = ex.includes('#include') || ex.includes('int main') || ex.includes('for (') || ex.includes('while (');
                    if (isCode) {
                        const escapedCode = ex.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        return `
                            <div class="code-snippet-box">
                                <div class="code-header-bar">
                                    <span>C++ Source</span>
                                    <button class="btn-copy-code" onclick="copyCode(this, \`${escapedCode}\`)">Copiază Codul</button>
                                </div>
                                <pre><code>${escapedCode}</code></pre>
                            </div>
                        `;
                    }
                    return `<div style="background: rgba(0,0,0,0.25); padding: 12px 16px; border-radius: var(--r-md); margin-bottom: 8px;">${ex}</div>`;
                }).join('')}
            </div>
        `;
    }

    // Exerciții cu autoverificare
    let exercisesHtml = "";
    if (ch.exercises && ch.exercises.length > 0) {
        exercisesHtml = `
            <div class="lesson-node">
                <h4>🎯 Exerciții de Verificare</h4>
                ${ch.exercises.map((ex, idx) => `
                    <div style="background: rgba(0,0,0,0.25); padding: 14px 18px; border-radius: var(--r-md); margin-bottom: 10px;">
                        <p style="font-weight: 600; color: #FFF; margin-bottom: 8px;">${idx + 1}. ${ex.question}</p>
                        <div style="display: flex; gap: 10px; max-width: 400px;">
                            <input type="text" id="ex-input-${chId}-${idx}" placeholder="Răspunsul tău..." style="padding: 8px 12px; border-radius: var(--r-sm); background: #000; border: 1px solid var(--border-glass); color: #FFF; flex: 1;">
                            <button onclick="checkLessonExercise('${chId}', ${idx}, '${ex.answer}')" class="btn-primary" style="padding: 8px 14px; font-size: 0.85rem;">Verifică</button>
                        </div>
                        <div id="ex-fb-${chId}-${idx}" style="margin-top: 6px; font-size: 0.85rem; font-weight: 600;"></div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Dicționar de Termeni
    let dictHtml = "";
    if (ch.dictionary) {
        const terms = Object.entries(ch.dictionary).map(([term, def]) => `<li><strong>${term}:</strong> ${def}</li>`).join('');
        dictHtml = `
            <div class="lesson-node">
                <h4>📖 Dicționar & Glosar Teoretic</h4>
                <ul>${terms}</ul>
            </div>
        `;
    }

    // Curiozități
    let funHtml = "";
    if (ch.fun_facts && ch.fun_facts.length > 0) {
        funHtml = `
            <div class="lesson-node" style="border-left: 4px solid var(--accent-amber);">
                <h4 style="color: #FBBF24;">✨ Știai că?</h4>
                <ul>${ch.fun_facts.map(f => `<li>${f}</li>`).join('')}</ul>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
            <h2 style="font-size: 2rem; color: #FFF;">${ch.icon || '📘'} ${ch.title}</h2>
            <span class="chapter-badge-chip ${ch.subject === 'math' ? 'math' : 'info'}">${ch.category} • Clasa a IX-a</span>
        </div>
        <div class="lesson-node">
            <h4>📋 Sinteză Teoretică</h4>
            ${lessonsHtml}
        </div>
        ${formulasHtml}
        ${examplesHtml}
        ${exercisesHtml}
        ${dictHtml}
        ${funHtml}
        <div style="text-align: center; margin-top: 30px;">
            <button onclick="startChapterDuel('${ch.title}')" class="btn-primary" style="padding: 12px 28px; font-size: 1rem;">⚔️ Provoacă-te la Quiz din Acest Capitol!</button>
        </div>
    `;
}

function copyCode(btn, codeText) {
    playSound('click');
    const decoded = codeText.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    navigator.clipboard.writeText(decoded).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copiat! ✓";
        btn.style.background = "var(--accent-emerald)";
        setTimeout(() => {
            btn.textContent = orig;
            btn.style.background = "";
        }, 2000);
    });
}

function checkLessonExercise(chId, idx, correctAnswer) {
    const input = document.getElementById(`ex-input-${chId}-${idx}`);
    const fb = document.getElementById(`ex-fb-${chId}-${idx}`);
    if (!input || !fb) return;

    const val = input.value.trim().toLowerCase();
    const correct = correctAnswer.trim().toLowerCase();

    if (val === correct) {
        playSound('correct');
        launchConfetti();
        fb.textContent = "🎉 Excelent! Răspuns corect (+10 XP)";
        fb.style.color = "var(--accent-emerald)";
        userProgress.exercisesCorrect++;
        userProgress.xp += 10;
        saveProgress();
        checkBadges();
    } else {
        playSound('wrong');
        fb.textContent = `❌ Mai încearcă! (Sugestie: răspunsul este '${correctAnswer}')`;
        fb.style.color = "var(--accent-crimson)";
    }
}

// ==========================================================================
// 4. ⚔️ H2H ARENA ENGINE (BOT AI, 1V1 LOCAL & MULTIPLAYER LOBBY)
// ==========================================================================
let arenaState = {
    mode: 'bot', // 'bot', 'split', 'online'
    subject: 'all', // 'all', 'math', 'info'
    botDifficulty: 'easy', // 'easy', 'medium', 'hard'
    player1Name: 'Tu (Boboc LER)',
    player2Name: 'Bot LER',
    score1: 0,
    score2: 0,
    questions: [],
    currentQIndex: 0,
    timerInterval: null,
    timeLeft: 20,
    roundActive: false,
    botAnswerTimeout: null
};

async function loadH2HQuestions() {
    try {
        const res = await fetch('data/h2h_questions.json');
        if (res.ok) {
            localH2HQuestions = await res.json();
        }
    } catch (e) {
        console.warn("Folosim întrebări implicite pentru arena.");
    }
}

function setDuelSubject(subj) {
    playSound('click');
    arenaState.subject = subj;
    ['all', 'math', 'info'].forEach(s => {
        const btn = document.getElementById(`btn-subject-${s}`);
        if (btn) btn.classList.toggle('active', s === subj);
    });
}

function resetArenaToLobby() {
    if (arenaState.timerInterval) clearInterval(arenaState.timerInterval);
    if (arenaState.botAnswerTimeout) clearTimeout(arenaState.botAnswerTimeout);
    arenaState.roundActive = false;

    document.getElementById('arena-lobby-screen')?.classList.remove('hidden');
    document.getElementById('battle-active-screen')?.classList.add('hidden');
    document.getElementById('battle-results-screen')?.classList.add('hidden');
    document.getElementById('mp-waiting')?.classList.add('hidden');
}

// Prompt bot duel difficulty
function startBotDuelPrompt() {
    playSound('click');
    const diff = prompt("Alege dificultatea Botului LER:\n1 = Boboc LER (Ușor)\n2 = Elev Silitor (Mediu)\n3 = Olimpic Racoviță (Dificil)", "2");
    let chosen = 'medium';
    let botName = 'Elev Silitor LER';

    if (diff === '1') { chosen = 'easy'; botName = 'Boboc LER Bot'; }
    else if (diff === '3') { chosen = 'hard'; botName = 'Olimpic Racoviță Bot'; }

    startBotBattle(chosen, botName);
}

function startBotBattle(diff, botName) {
    arenaState.mode = 'bot';
    arenaState.botDifficulty = diff;
    arenaState.player1Name = currentUser.username || 'Tu (Boboc LER)';
    arenaState.player2Name = botName;
    arenaState.score1 = 0;
    arenaState.score2 = 0;
    arenaState.currentQIndex = 0;

    prepareQuestionsAndLaunch();
}

function startLocalSplitDuel() {
    playSound('click');
    const p1 = prompt("Numele Jucătorului 1 (Stânga):", "Jucător 1") || "Jucător 1";
    const p2 = prompt("Numele Jucătorului 2 (Dreapta):", "Jucător 2") || "Jucător 2";

    arenaState.mode = 'split';
    arenaState.player1Name = p1;
    arenaState.player2Name = p2;
    arenaState.score1 = 0;
    arenaState.score2 = 0;
    arenaState.currentQIndex = 0;

    prepareQuestionsAndLaunch();
}

function prepareQuestionsAndLaunch() {
    // Select questions
    let pool = localH2HQuestions;
    if (arenaState.subject !== 'all') {
        pool = pool.filter(q => q.subject === arenaState.subject);
    }
    if (pool.length < 5) pool = localH2HQuestions;

    // Shuffle and pick 5
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    arenaState.questions = shuffled.slice(0, 5);

    document.getElementById('arena-lobby-screen')?.classList.add('hidden');
    document.getElementById('battle-results-screen')?.classList.add('hidden');
    document.getElementById('battle-active-screen')?.classList.remove('hidden');

    document.getElementById('battle-p1-name').textContent = arenaState.player1Name;
    document.getElementById('battle-p2-name').textContent = arenaState.player2Name;
    document.getElementById('battle-p1-score').textContent = '0';
    document.getElementById('battle-p2-score').textContent = '0';

    if (arenaState.mode === 'split') {
        document.getElementById('battle-options-container')?.classList.add('hidden');
        document.getElementById('battle-split-inputs')?.classList.remove('hidden');
        document.getElementById('split-p1-label').textContent = `${arenaState.player1Name} (Stânga)`;
        document.getElementById('split-p2-label').textContent = `${arenaState.player2Name} (Dreapta)`;
        
        // Listeners for split screen
        const inp0 = document.getElementById('split-input-0');
        const inp1 = document.getElementById('split-input-1');
        if (inp0) inp0.onkeypress = (e) => { if (e.key === 'Enter') checkSplitAnswer(0); };
        if (inp1) inp1.onkeypress = (e) => { if (e.key === 'Enter') checkSplitAnswer(1); };
    } else {
        document.getElementById('battle-options-container')?.classList.remove('hidden');
        document.getElementById('battle-split-inputs')?.classList.add('hidden');
    }

    launchArenaRound();
}

function launchArenaRound() {
    if (arenaState.currentQIndex >= arenaState.questions.length) {
        finishArenaBattle();
        return;
    }

    arenaState.roundActive = true;
    const q = arenaState.questions[arenaState.currentQIndex];

    document.getElementById('battle-round-badge').textContent = `Runda ${arenaState.currentQIndex + 1}/5 • ${q.category || 'MathInfo'}`;
    document.getElementById('battle-question-text').textContent = q.question;
    document.getElementById('battle-feedback-msg').textContent = '';

    // Render Multiple Choice Options for Bot Mode
    if (arenaState.mode === 'bot') {
        const optContainer = document.getElementById('battle-options-container');
        if (optContainer && q.options) {
            optContainer.innerHTML = q.options.map((opt, i) => `
                <button class="btn-battle-option" onclick="handleBotBattleOption('${opt}', '${q.answer}')">${opt}</button>
            `).join('');
        }

        // Simulate Bot Response Timer based on difficulty
        let botDelay = 7000; // ms
        let botAccuracy = 0.5;

        if (arenaState.botDifficulty === 'medium') {
            botDelay = 5500;
            botAccuracy = 0.75;
        } else if (arenaState.botDifficulty === 'hard') {
            botDelay = 3500;
            botAccuracy = 0.95;
        }

        if (arenaState.botAnswerTimeout) clearTimeout(arenaState.botAnswerTimeout);
        arenaState.botAnswerTimeout = setTimeout(() => {
            if (arenaState.roundActive) {
                // Bot answers
                const botIsCorrect = Math.random() < botAccuracy;
                if (botIsCorrect) {
                    arenaState.roundActive = false;
                    clearInterval(arenaState.timerInterval);
                    arenaState.score2 += 10 + Math.floor(arenaState.timeLeft / 2);
                    document.getElementById('battle-p2-score').textContent = arenaState.score2;
                    playSound('wrong');
                    document.getElementById('battle-feedback-msg').innerHTML = `<span style="color: var(--accent-rose);">⚡ ${arenaState.player2Name} a răspuns primul corect!</span>`;
                    highlightCorrectOption(q.answer);
                    nextRoundDelayed();
                }
            }
        }, botDelay);
    } else if (arenaState.mode === 'split') {
        const inp0 = document.getElementById('split-input-0');
        const inp1 = document.getElementById('split-input-1');
        if (inp0) { inp0.value = ''; inp0.disabled = false; inp0.focus(); }
        if (inp1) { inp1.value = ''; inp1.disabled = false; }
    }

    // Countdown Timer
    arenaState.timeLeft = 20;
    const timerText = document.getElementById('battle-timer-text');
    const timerBar = document.getElementById('battle-timer-bar');

    if (arenaState.timerInterval) clearInterval(arenaState.timerInterval);
    arenaState.timerInterval = setInterval(() => {
        arenaState.timeLeft--;
        if (timerText) {
            timerText.textContent = `${arenaState.timeLeft}s`;
            timerText.classList.toggle('urgent', arenaState.timeLeft <= 5);
        }
        if (timerBar) {
            timerBar.style.width = `${(arenaState.timeLeft / 20) * 100}%`;
        }
        if (arenaState.timeLeft <= 5 && arenaState.timeLeft > 0) {
            playSound('tick');
        }
        if (arenaState.timeLeft <= 0) {
            clearInterval(arenaState.timerInterval);
            arenaState.roundActive = false;
            playSound('wrong');
            document.getElementById('battle-feedback-msg').innerHTML = `<span style="color: var(--accent-amber);">⌛ Timp expirat! Răspunsul corect era: ${q.answer}</span>`;
            highlightCorrectOption(q.answer);
            nextRoundDelayed();
        }
    }, 1000);
}

function handleBotBattleOption(selected, correct) {
    if (!arenaState.roundActive) return;

    if (selected === correct) {
        arenaState.roundActive = false;
        clearInterval(arenaState.timerInterval);
        if (arenaState.botAnswerTimeout) clearTimeout(arenaState.botAnswerTimeout);

        const bonus = Math.floor(arenaState.timeLeft / 2);
        const pts = 10 + bonus;
        arenaState.score1 += pts;
        document.getElementById('battle-p1-score').textContent = arenaState.score1;

        playSound('correct');
        launchConfetti();
        document.getElementById('battle-feedback-msg').innerHTML = `<span style="color: var(--accent-emerald);">🎉 Corect! Ai câștigat runda (+${pts} pts)!</span>`;
        highlightCorrectOption(correct);
        nextRoundDelayed();
    } else {
        playSound('wrong');
        document.getElementById('battle-feedback-msg').innerHTML = `<span style="color: var(--accent-crimson);">❌ Greșit! Mai încearcă rapid!</span>`;
    }
}

function checkSplitAnswer(playerIdx) {
    if (!arenaState.roundActive) return;

    const inp = document.getElementById(`split-input-${playerIdx}`);
    if (!inp) return;
    const val = inp.value.trim().toLowerCase();
    const q = arenaState.questions[arenaState.currentQIndex];
    const correct = (q.answer || '').trim().toLowerCase();

    if (val === correct) {
        arenaState.roundActive = false;
        clearInterval(arenaState.timerInterval);

        const pts = 10 + arenaState.timeLeft;
        if (playerIdx === 0) {
            arenaState.score1 += pts;
            document.getElementById('battle-p1-score').textContent = arenaState.score1;
        } else {
            arenaState.score2 += pts;
            document.getElementById('battle-p2-score').textContent = arenaState.score2;
        }

        playSound('correct');
        launchConfetti();
        const winnerName = playerIdx === 0 ? arenaState.player1Name : arenaState.player2Name;
        document.getElementById('battle-feedback-msg').innerHTML = `<span style="color: var(--cyber-cyan);">🎉 ${winnerName} a câștigat runda (+${pts} pts)!</span>`;
        nextRoundDelayed();
    } else {
        playSound('wrong');
        inp.style.borderColor = 'var(--accent-crimson)';
        setTimeout(() => inp.style.borderColor = '', 600);
    }
}

function highlightCorrectOption(answer) {
    document.querySelectorAll('.btn-battle-option').forEach(btn => {
        if (btn.textContent.trim() === answer.trim()) {
            btn.classList.add('correct');
        }
    });
}

function nextRoundDelayed() {
    arenaState.currentQIndex++;
    setTimeout(launchArenaRound, 2200);
}

function finishArenaBattle() {
    if (arenaState.timerInterval) clearInterval(arenaState.timerInterval);
    document.getElementById('battle-active-screen')?.classList.add('hidden');
    document.getElementById('battle-results-screen')?.classList.remove('hidden');

    const s1 = arenaState.score1;
    const s2 = arenaState.score2;
    const title = document.getElementById('results-winner-title');
    const sub = document.getElementById('results-winner-subtitle');
    const icon = document.getElementById('results-winner-icon');

    if (s1 > s2) {
        playSound('victory');
        launchConfetti();
        icon.textContent = "🏆";
        title.textContent = `Victorie! ${arenaState.player1Name} a Câștigat!`;
        userProgress.duelWins++;
        userProgress.xp += 50;
    } else if (s2 > s1) {
        playSound('wrong');
        icon.textContent = "⚔️";
        title.textContent = `${arenaState.player2Name} a Câștigat!`;
        userProgress.duelLosses++;
        userProgress.xp += 15;
    } else {
        icon.textContent = "🤝";
        title.textContent = "Egalitate Perfectă!";
        userProgress.xp += 25;
    }

    sub.textContent = `Scor Final: ${s1} - ${s2} puncte`;
    saveProgress();
    checkBadges();
}

function startChapterDuel(chapterTitle) {
    changeView('competitie');
    startBotBattle('medium', 'Bot ' + chapterTitle.slice(0, 15));
}

// Multiplayer Online Code Mock / API integration
function createRoom() {
    playSound('click');
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    document.getElementById('arena-lobby-screen')?.classList.add('hidden');
    document.getElementById('mp-waiting')?.classList.remove('hidden');
    document.getElementById('mp-room-code-display').textContent = roomCode;

    // Simulate opponent joining in 6 seconds if running standalone
    setTimeout(() => {
        if (!document.getElementById('mp-waiting').classList.contains('hidden')) {
            showToast("Un coleg s-a conectat la codul tău!");
            document.getElementById('mp-waiting').classList.add('hidden');
            startBotBattle('medium', 'Coleg Racoviță (' + roomCode + ')');
        }
    }, 6000);
}

function promptJoinRoom() {
    playSound('click');
    const code = prompt("Introdu codul camerei (ex: X9K2L1):");
    if (!code) return;
    showToast(`Conectat cu succes la camera ${code.toUpperCase()}!`);
    startBotBattle('medium', 'Oponent Camera ' + code.toUpperCase());
}

function cancelWaitingRoom() {
    playSound('click');
    resetArenaToLobby();
}

// ==========================================================================
// 5. 🤖 MATHINFO AI ASSISTANT (INTELIGENCE & MENTOR)
// ==========================================================================
const aiResponsesKnowledge = [
    {
        triggers: ['gradul 2', 'ecuație', 'viete', 'delta', 'parabola', 'discriminant'],
        answer: `🎯 <strong>Ecuația și Funcția de Gradul II:</strong><br>
        Forma generală: <code>ax² + bx + c = 0</code> (a ≠ 0).<br>
        1. <strong>Discriminantul:</strong> <code>Δ = b² - 4ac</code>.<br>
        • Dacă Δ &gt; 0: două rădăcini reale <code>x₁,₂ = (-b ± √Δ) / 2a</code>.<br>
        • Dacă Δ = 0: rădăcină dublă <code>x₁ = x₂ = -b / (2a)</code>.<br>
        • Dacă Δ &lt; 0: fără soluții reale.<br>
        2. <strong>Relațiile lui Viète:</strong> Suma <code>S = x₁ + x₂ = -b/a</code> și Produsul <code>P = x₁ · x₂ = c/a</code>.<br>
        3. <strong>Vârful Parabolei:</strong> <code>V(-b / 2a, -Δ / 4a)</code>.`
    },
    {
        triggers: ['prim', 'primalitate', 'numar prim', 'radical'],
        answer: `✨ <strong>Verificare Număr Prim în C++ O(√n):</strong><br>
        Un număr n ≥ 2 este prim dacă nu are divizori proprii până la √n.<br>
        <div class="code-snippet-box">
            <div class="code-header-bar"><span>C++ Primalitate</span></div>
            <pre><code>bool estePrim(int n) {
    if (n < 2) return false;
    if (n == 2) return true;
    if (n % 2 == 0) return false;
    for (int d = 3; d * d <= n; d += 2) {
        if (n % d == 0) return false;
    }
    return true;
}</code></pre>
        </div>`
    },
    {
        triggers: ['progresie', 'sir', 'aritmetica', 'suma'],
        answer: `📈 <strong>Progresii Aritmetice (Clasa a IX-a):</strong><br>
        Fiecare termen se obține adunând rația r: <code>a_(n+1) = a_n + r</code>.<br>
        • <strong>Termenul general:</strong> <code>a_n = a_1 + (n - 1) · r</code>.<br>
        • <strong>Suma primilor n termeni:</strong> <code>S_n = n · (a_1 + a_n) / 2</code>.<br>
        • <strong>Proprietate:</strong> <code>a_k = (a_(k-1) + a_(k+1)) / 2</code>.`
    },
    {
        triggers: ['euclid', 'cmmdc', 'cmmmc', 'divizor'],
        answer: `⚡ <strong>Algoritmul lui Euclid (CMMDC prin împărțiri repetate):</strong><br>
        <div class="code-snippet-box">
            <div class="code-header-bar"><span>C++ Euclid</span></div>
            <pre><code>int cmmdc(int a, int b) {
    while (b != 0) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}</code></pre>
        </div>
        Relația CMMMC: <code>cmmmc = (a * b) / cmmdc(a, b);</code>`
    },
    {
        triggers: ['trigonometrie', 'sin', 'cos', 'cercul', 'radiani'],
        answer: `🔄 <strong>Trigonometrie Fundamentală:</strong><br>
        • <strong>Formula fundamentală:</strong> <code>sin² x + cos² x = 1</code>.<br>
        • <strong>Valori remarcabile:</strong><br>
        sin(30°) = 1/2, cos(30°) = √3/2, tg(30°) = √3/3<br>
        sin(45°) = √2/2, cos(45°) = √2/2, tg(45°) = 1<br>
        sin(60°) = √3/2, cos(60°) = 1/2, tg(60°) = √3<br>
        • <strong>Unghi dublu:</strong> <code>sin(2x) = 2 sin x cos x</code>, <code>cos(2x) = cos² x - sin² x</code>.`
    },
    {
        triggers: ['oglindit', 'palindrom', 'cifre', 'cifra'],
        answer: `🔢 <strong>Prelucrarea Cifrelor în C++:</strong><br>
        <div class="code-snippet-box">
            <div class="code-header-bar"><span>C++ Oglindit</span></div>
            <pre><code>int ogl = 0, copie = n;
while (n > 0) {
    int c = n % 10;
    ogl = ogl * 10 + c;
    n /= 10;
}
if (copie == ogl) cout << "Palindrom!";</code></pre>
        </div>`
    }
];

function askAiPreset(questionText) {
    playSound('click');
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = questionText;
        handleChat();
    }
}

async function handleChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    playSound('click');
    addChatMessage(text, 'user');
    input.value = '';

    const typing = document.getElementById('ai-typing');
    typing?.classList.remove('hidden');

    // Simulate smart matching
    setTimeout(() => {
        typing?.classList.add('hidden');
        let answer = null;
        const lower = text.toLowerCase();

        for (const item of aiResponsesKnowledge) {
            if (item.triggers.some(t => lower.includes(t))) {
                answer = item.answer;
                break;
            }
        }

        if (!answer) {
            answer = `Am analizat întrebarea ta legată de '<em>${text}</em>'. La clasa a IX-a în Liceul Teoretic „Emil Racoviță”, acest concept se leagă direct de raționamentul deductiv și algoritmică! Te invit să explorezi și capitolele noastre din secțiunea <strong>Lecții IX</strong> sau să exersezi în <strong>Laboratorul C++</strong>! 🚀`;
        }

        addChatMessage(answer, 'ai');
        if (ttsEnabled) speakText(answer);
    }, 700);
}

function addChatMessage(htmlContent, sender) {
    const stream = document.getElementById('chat-messages');
    if (!stream) return;

    const div = document.createElement('div');
    div.className = `message ${sender}-message`;
    div.innerHTML = htmlContent;
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
}

document.getElementById('btn-chat-send')?.addEventListener('click', handleChat);
document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
});

// Voice TTS & Mic
function speakText(htmlText) {
    if (!('speechSynthesis' in window)) return;
    const plain = htmlText.replace(/<[^>]*>/g, '').trim();
    const utt = new SpeechSynthesisUtterance(plain);
    utt.lang = 'ro-RO';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
}

document.getElementById('btn-tts-toggle')?.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    localStorage.setItem('mathinfo9_tts', String(ttsEnabled));
    playSound('click');
    showToast(ttsEnabled ? "Citire vocală activată 🔊" : "Citire vocală dezactivată 🔇");
});

// ==========================================================================
// 6. 💻 C++ & MATH INTERACTIVE LAB
// ==========================================================================
function switchLabSubtab(subtabId) {
    playSound('click');
    ['visualizer', 'graph', 'geometry'].forEach(s => {
        document.getElementById(`lab-subtab-${s}`)?.classList.toggle('hidden', s !== subtabId);
    });
    document.querySelectorAll('.lab-navigation-tabs .btn-lab-tab').forEach((btn, idx) => {
        btn.classList.toggle('active', (idx === 0 && subtabId === 'visualizer') || (idx === 1 && subtabId === 'graph') || (idx === 2 && subtabId === 'geometry'));
    });
}

// Subtab 1: Visualizer C++
let visArray = [64, 34, 25, 12, 22, 11, 90];

function changeVisAlgorithm(algKey) {
    playSound('click');
    resetAlgorithmSimulation();
}

function resetAlgorithmSimulation() {
    visArray = [64, 34, 25, 12, 22, 11, 90];
    renderVisBars(visArray);
    const info = document.getElementById('vis-info-panel');
    if (info) info.innerHTML = "Vector reinițializat: {64, 34, 25, 12, 22, 11, 90}. Gata de rulare!";
}

function renderVisBars(arr, activeIndices = [], isSorted = false) {
    const container = document.getElementById('vis-canvas-container');
    if (!container) return;

    container.innerHTML = arr.map((val, idx) => {
        let cls = 'vis-bar';
        if (activeIndices.includes(idx)) cls += ' comparing';
        if (isSorted) cls += ' sorted';
        const height = Math.max(30, val * 2.5);
        return `<div class="${cls}" style="height: ${height}px;">${val}</div>`;
    }).join('');
}

function runAlgorithmSimulation() {
    playSound('click');
    const alg = document.getElementById('vis-algorithm-select')?.value || 'bubblesort';
    const info = document.getElementById('vis-info-panel');

    if (alg === 'bubblesort') {
        let i = 0, j = 0;
        let arr = [...visArray];
        let n = arr.length;

        function step() {
            if (i < n - 1) {
                if (j < n - i - 1) {
                    renderVisBars(arr, [j, j + 1]);
                    if (arr[j] > arr[j + 1]) {
                        let temp = arr[j];
                        arr[j] = arr[j + 1];
                        arr[j + 1] = temp;
                        playSound('tick');
                        if (info) info.innerHTML = `Bubble Sort: Interschimbăm <code>swap(${arr[j+1]}, ${arr[j]})</code> deoarece ${arr[j+1]} &gt; ${arr[j]}.`;
                    }
                    j++;
                    setTimeout(step, 400);
                } else {
                    j = 0;
                    i++;
                    setTimeout(step, 400);
                }
            } else {
                renderVisBars(arr, [], true);
                playSound('correct');
                if (info) info.innerHTML = "🎉 <strong>Bubble Sort Finalizat!</strong> Toate elementele sunt ordonate crescător.";
            }
        }
        step();
    } else if (alg === 'prime') {
        const testNum = 29;
        if (info) info.innerHTML = `Verificăm primalitatea lui ${testNum} căutând divizori impari până la √29 ≈ 5...`;
        setTimeout(() => {
            playSound('correct');
            if (info) info.innerHTML = `🎉 29 nu se divide cu 3 sau 5. Rezultat: <strong>29 este NUMĂR PRIM!</strong>`;
        }, 1200);
    } else if (alg === 'reverse') {
        let n = 4589;
        let ogl = 0;
        if (info) info.innerHTML = `Pas 1: Ultima cifră = 4589 % 10 = 9 | ogl = 9<br>Pas 2: 458 % 10 = 8 | ogl = 98<br>Pas 3: 45 % 10 = 5 | ogl = 985<br>Pas 4: 4 % 10 = 4 | <strong>oglindit = 9854</strong>!`;
        playSound('correct');
    } else if (alg === 'euclid') {
        if (info) info.innerHTML = `Algoritmul lui Euclid pentru (56, 24):<br>56 = 24·2 + 8 (rest 8)<br>24 = 8·3 + 0 (rest 0)<br>👉 <strong>CMMDC este 8!</strong>`;
        playSound('correct');
    }
}

// Subtab 2: Grafice Funcții (Parabola ax² + bx + c)
function updateFunctionPlot() {
    const a = parseFloat(document.getElementById('slider-a')?.value || 1);
    const b = parseFloat(document.getElementById('slider-b')?.value || -2);
    const c = parseFloat(document.getElementById('slider-c')?.value || -3);

    document.getElementById('val-a').textContent = a;
    document.getElementById('val-b').textContent = b;
    document.getElementById('val-c').textContent = c;

    const delta = b * b - 4 * a * c;
    const xv = -b / (2 * a);
    const yv = -delta / (4 * a);

    let rootsText = "Fără rădăcini reale";
    if (delta > 0) {
        const x1 = (-b - Math.sqrt(delta)) / (2 * a);
        const x2 = (-b + Math.sqrt(delta)) / (2 * a);
        rootsText = `x₁ = ${x1.toFixed(2)}, x₂ = ${x2.toFixed(2)}`;
    } else if (delta === 0) {
        rootsText = `x₁ = x₂ = ${xv.toFixed(2)}`;
    }

    const stats = document.getElementById('function-math-stats');
    if (stats) {
        stats.innerHTML = `Funcția: <code>f(x) = ${a}x² + (${b})x + (${c})</code> | <strong>Δ = ${delta.toFixed(2)}</strong> | Rădăcini: <strong>${rootsText}</strong> | Vârf: <strong>V(${xv.toFixed(2)}, ${yv.toFixed(2)})</strong>`;
    }

    // Canvas Plotting
    const canvas = document.getElementById('function-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Axes
    const cx = w / 2;
    const cy = h / 2;
    const scale = 25; // pixels per unit

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;

    // Grid
    ctx.beginPath();
    for (let x = 0; x < w; x += scale) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += scale) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // Main Axes
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.stroke();

    // Plot Parabola
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 3;
    ctx.beginPath();

    let first = true;
    for (let px = 0; px < w; px++) {
        const mathX = (px - cx) / scale;
        const mathY = a * mathX * mathX + b * mathX + c;
        const py = cy - mathY * scale;

        if (py >= 0 && py <= h) {
            if (first) { ctx.moveTo(px, py); first = false; }
            else { ctx.lineTo(px, py); }
        }
    }
    ctx.stroke();

    // Draw Vertex point
    const vxPix = cx + xv * scale;
    const vyPix = cy - yv * scale;
    if (vxPix >= 0 && vxPix <= w && vyPix >= 0 && vyPix <= h) {
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(vxPix, vyPix, 6, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Subtab 3: Laborator Geometrie Magic
var geoLab = {
    canvas: null,
    ctx: null,
    shape: 'square',
    init() {
        this.canvas = document.getElementById('geo-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.draw();
    },
    setShape(s) {
        this.shape = s;
        document.getElementById('group-rect')?.classList.toggle('hidden', s !== 'rect');
        document.getElementById('group-side')?.classList.toggle('hidden', s === 'rect');
        this.draw();
    },
    updateFromInputs() {
        this.draw();
    },
    draw() {
        if (!this.canvas) this.canvas = document.getElementById('geo-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = '#6366F1';
        ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.lineWidth = 4;

        let formula = '';
        if (this.shape === 'square') {
            const side = parseInt(document.getElementById('input-l')?.value || 100);
            ctx.strokeRect(w/2 - side/2, h/2 - side/2, side, side);
            ctx.fillRect(w/2 - side/2, h/2 - side/2, side, side);
            formula = `Pătrat • Arie: ${side * side} | Perimetru: ${4 * side}`;
        } else if (this.shape === 'rect') {
            const rw = parseInt(document.getElementById('input-w')?.value || 150);
            const rh = parseInt(document.getElementById('input-h')?.value || 80);
            ctx.strokeRect(w/2 - rw/2, h/2 - rh/2, rw, rh);
            ctx.fillRect(w/2 - rw/2, h/2 - rh/2, rw, rh);
            formula = `Dreptunghi • Arie: ${rw * rh} | Perimetru: ${2 * (rw + rh)}`;
        } else if (this.shape === 'circle') {
            const r = parseInt(document.getElementById('input-l')?.value || 60);
            ctx.beginPath();
            ctx.arc(w/2, h/2, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fill();
            formula = `Cerc • Arie: ≈ ${(Math.PI * r * r).toFixed(0)} | Lungime cerc: ≈ ${(2 * Math.PI * r).toFixed(0)}`;
        }

        const stats = document.getElementById('geo-stats');
        if (stats) stats.textContent = formula;
    },
    clear() {
        if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    recognizeShape() {
        playSound('correct');
        launchConfetti();
        showToast("🪄 Magic AI: Formă geometrică calibrată!");
        this.setShape('square');
    }
};

// ==========================================================================
// 7. PROVOCAREA ZILEI (DAILY CHALLENGE)
// ==========================================================================
const dailyChallengesList = [
    {
        question: "Cât este discriminantul Δ al ecuației x² - 6x + 8 = 0?",
        answer: "4",
        hint: "Δ = b² - 4ac = 36 - 32"
    },
    {
        question: "Care este valoarea expresiei 29 % 7 în limbajul C++?",
        answer: "1",
        hint: "Restul împărțirii lui 29 la 7"
    },
    {
        question: "Într-o progresie aritmetică cu a₁ = 4 și r = 3, cât este a₅?",
        answer: "16",
        hint: "a₅ = a₁ + 4r = 4 + 12"
    },
    {
        question: "Care este valoarea sin²(30°) + cos²(30°)?",
        answer: "1",
        hint: "Formula fundamentală a trigonometriei"
    }
];

let activeDailyChallenge = dailyChallengesList[0];

function fetchDailyChallenge() {
    const today = new Date().toDateString();
    const qEl = document.getElementById('challenge-question');
    const fbEl = document.getElementById('challenge-feedback');

    // Pick a challenge
    activeDailyChallenge = dailyChallengesList[new Date().getDate() % dailyChallengesList.length];

    if (userProgress.lastChallengeDate === today) {
        if (qEl) qEl.innerHTML = "🌟 Ai rezolvat deja provocarea zilei de azi! Revino mâine pentru una nouă (+20 XP).";
        document.querySelector('.daily-challenge-input-group')?.classList.add('hidden');
    } else {
        if (qEl) qEl.textContent = activeDailyChallenge.question;
        document.querySelector('.daily-challenge-input-group')?.classList.remove('hidden');
        if (fbEl) fbEl.textContent = '';
    }
}

document.getElementById('btn-challenge-submit')?.addEventListener('click', () => {
    const input = document.getElementById('challenge-answer');
    const fb = document.getElementById('challenge-feedback');
    if (!input || !fb) return;

    if (input.value.trim().toLowerCase() === activeDailyChallenge.answer.toLowerCase()) {
        playSound('correct');
        launchConfetti();
        fb.innerHTML = "🎉 Răspuns corect! Ai câștigat +20 XP și ai completat provocarea zilei!";
        fb.style.color = "var(--accent-emerald)";
        userProgress.lastChallengeDate = new Date().toDateString();
        userProgress.xp += 20;
        userProgress.exercisesCorrect++;
        saveProgress();
        checkBadges();
        setTimeout(fetchDailyChallenge, 2200);
    } else {
        playSound('wrong');
        fb.innerHTML = `❌ Mai încearcă! Indiciu: ${activeDailyChallenge.hint}`;
        fb.style.color = "var(--accent-crimson)";
    }
});

// ==========================================================================
// 8. 🏆 PROFIL, BADGES & GAMIFICATION
// ==========================================================================
const availableBadges = [
    { id: 'b_boboc', name: 'Boboc LER', icon: '🎓', desc: 'Înscris pe platformă', unlocked: () => true },
    { id: 'b_first_ch', name: 'Explorator Curriculă', icon: '🧭', desc: 'A explorat primul capitol', unlocked: () => userProgress.chaptersExplored.length >= 1 },
    { id: 'b_math_wiz', name: 'Discriminant Master', icon: '🧮', desc: '5 exerciții corecte rezolvate', unlocked: () => userProgress.exercisesCorrect >= 5 },
    { id: 'b_gladiator', name: 'Gladiator H2H', icon: '⚔️', desc: 'Prima victorie în Arena H2H', unlocked: () => userProgress.duelWins >= 1 },
    { id: 'b_coder', name: 'Algoritmist C++', icon: '💻', desc: 'A explorat C++ și a atins 150 XP', unlocked: () => userProgress.xp >= 150 },
    { id: 'b_olimpic', name: 'Olimpic Racoviță', icon: '🌟', desc: 'A obținut 5 victorii în arenă', unlocked: () => userProgress.duelWins >= 5 }
];

function checkBadges() {
    availableBadges.forEach(b => {
        if (b.unlocked() && !userProgress.badges.includes(b.name)) {
            userProgress.badges.push(b.name);
            playSound('victory');
            launchConfetti();
            showToast(`🏆 Ecuson Nou Deblocat: ${b.name}!`);
        }
    });
}

function renderProfile() {
    document.getElementById('stat-chapters').textContent = `${userProgress.chaptersExplored.length}/21`;
    document.getElementById('stat-exercises').textContent = userProgress.exercisesCorrect;
    document.getElementById('stat-duel-wins').textContent = userProgress.duelWins;
    document.getElementById('stat-xp').textContent = userProgress.xp;

    const nameEl = document.getElementById('profile-username');
    if (nameEl && currentUser) nameEl.textContent = currentUser.username;

    // Badges grid
    const badgeContainer = document.getElementById('badge-list');
    if (badgeContainer) {
        badgeContainer.innerHTML = availableBadges.map(b => {
            const hasBadge = userProgress.badges.includes(b.name) || b.unlocked();
            const stateClass = hasBadge ? 'unlocked' : 'locked';
            return `
                <div class="badge-card-item ${stateClass}">
                    <div class="badge-icon">${b.icon}</div>
                    <div class="badge-title">${b.name}</div>
                    <div class="badge-desc">${b.desc}</div>
                </div>
            `;
        }).join('');
    }

    renderProgressChart();
}

let chartInstance = null;
function renderProgressChart() {
    const ctx = document.getElementById('progress-chart');
    if (!ctx) return;

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'],
            datasets: [{
                label: 'Activitate XP & Exerciții',
                data: [15, 25, 40, 30, 60, 45, Math.min(100, userProgress.xp % 100 + 40)],
                borderColor: '#6366F1',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#06B6D4',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94A3B8' } },
                x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
            }
        }
    });
}

// ==========================================================================
// 9. 🏫 MODUL CLASĂ (CLASA & TEME LER)
// ==========================================================================
function switchClassTab(tab) {
    playSound('click');
    document.getElementById('class-tab-ranking')?.classList.toggle('hidden', tab !== 'ranking');
    document.getElementById('class-tab-homework')?.classList.toggle('hidden', tab !== 'homework');
    document.getElementById('tab-ranking')?.classList.toggle('active-tab', tab === 'ranking');
    document.getElementById('tab-homework')?.classList.toggle('active-tab', tab === 'homework');
}

function joinClass() {
    playSound('click');
    const code = document.getElementById('join-class-code')?.value.trim();
    if (!code) return;
    showToast(`Te-ai alăturat clasei ${code} din LER Vaslui!`);
    document.getElementById('ranking-class-name').textContent = `Clasa ${code}`;
    document.getElementById('ranking-class-code').textContent = code.toUpperCase();
}

// ==========================================================================
// 10. AUTENTIFICARE & INITIALIZARE
// ==========================================================================
let authIsLogin = true;

function toggleAuthMode() {
    playSound('click');
    authIsLogin = !authIsLogin;
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('btn-auth-action');
    if (title) title.textContent = authIsLogin ? "Conectare Elev LER" : "Înregistrare Elev Nou";
    if (btn) btn.textContent = authIsLogin ? "Intră în Cont" : "Creează Contul";
}

function handleLogin() {
    playSound('click');
    const u = document.getElementById('login-username')?.value.trim();
    if (!u) {
        showToast("Te rog introdu un nume de utilizator!");
        return;
    }

    currentUser.username = u;
    localStorage.setItem('mathinfo9_user', JSON.stringify(currentUser));
    showToast(`Bine ai venit, ${u}!`);
    updateHeaderStats();
    changeView('home');
}

function loginAsGuest() {
    playSound('click');
    currentUser.username = 'Boboc_LER_' + Math.floor(Math.random() * 899 + 100);
    localStorage.setItem('mathinfo9_user', JSON.stringify(currentUser));
    showToast(`Conectat ca ${currentUser.username}!`);
    updateHeaderStats();
    changeView('home');
}

// Document Ready Initialization
window.addEventListener('DOMContentLoaded', () => {
    initInteractiveBackground();
    loadCurriculumData();
    loadH2HQuestions();
    updateHeaderStats();
    fetchDailyChallenge();

    const audioBtn = document.getElementById('btn-audio-fx');
    if (audioBtn) {
        audioBtn.textContent = soundEnabled ? '🔊 ON' : '🔇 OFF';
        audioBtn.addEventListener('click', toggleSoundFX);
    }

    geoLab.init();
});
