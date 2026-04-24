// ------------------- RHYTHM TAP GAME -------------------
// Assigned to: Lagueras-Belen
// Features: 3 Lives system + Score-based level progression

(function() {
  // DOM Elements
  const mainMenu = document.getElementById('mainMenu');
  const gameScreen = document.getElementById('gameScreen');
  const startBtn = document.getElementById('startGameBtn');
  const quitBtn = document.getElementById('quitToMenuBtn');
  const restartBtn = document.getElementById('restartGameBtn');
  const tapPad = document.getElementById('tapPad');
  const beatTrack = document.getElementById('beatTrack');
  const gameOverModal = document.getElementById('gameOverModal');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const menuAfterGameBtn = document.getElementById('menuAfterGameBtn');
  const finalScoreSpan = document.getElementById('finalScore');
  const finalLevelSpan = document.getElementById('finalLevel');
  
  const scoreSpan = document.getElementById('scoreValue');
  const comboSpan = document.getElementById('comboValue');
  const lastGradeSpan = document.getElementById('lastGrade');
  const bpmDisplaySpan = document.getElementById('bpmDisplay');
  const patternLabelSpan = document.getElementById('patternLabel');
  const menuHighScore = document.getElementById('menuHighScore');
  const livesSpan = document.getElementById('livesValue');
  const levelSpan = document.getElementById('levelValue');
  const levelProgressBar = document.getElementById('levelProgressBar');
  const nextLevelScoreSpan = document.getElementById('nextLevelScore');

  // Game State
  let active = false;
  let animationId = null;
  let gameLoopInterval = null;
  let notesArray = [];
  let nextNoteId = 1;
  let score = 0;
  let combo = 0;
  let currentBpm = 100;
  let patternComplexity = 0;
  let lives = 3;
  let currentLevel = 1;
  let levelThresholds = [0, 500, 1200, 2100, 3200, 4500, 6000, 7700, 9600, 11700];
  
  let highScore = localStorage.getItem('rhythmTapHighScore') ? parseInt(localStorage.getItem('rhythmTapHighScore')) : 0;
  if (menuHighScore) menuHighScore.innerText = highScore;
  
  const PERFECT_WINDOW = 55;
  const GREAT_WINDOW = 110;
  const GOOD_WINDOW = 180;
  const TARGET_PERCENT = 88;
  const START_PERCENT = -12;
  const TRAVEL_DURATION_MS = 550;
  const POINTS = { PERFECT: 100, GREAT: 70, GOOD: 40, MISS: 0 };
  
  const patternLibrary = [
    { name: 'basic', pattern: [1,0,1,0,1,0,1,0] },
    { name: 'steady', pattern: [1,1,0,1,1,0,1,1] },
    { name: 'double', pattern: [1,1,1,0,1,1,1,0] },
    { name: 'triplet', pattern: [1,0,1,1,0,1,1,1] },
    { name: 'rush', pattern: [1,1,1,1,0,1,1,1] },
    { name: 'full', pattern: [1,1,1,1,1,1,1,1] }
  ];
  let currentPattern = patternLibrary[0];
  
  const levelBpmMap = { 1: 100, 2: 115, 3: 130, 4: 145, 5: 160, 6: 175, 7: 190, 8: 205, 9: 215, 10: 225 };
  
  function updatePatternDisplay() { patternLabelSpan.innerText = currentPattern.name; }
  
  function updateHighScore() {
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('rhythmTapHighScore', highScore);
      if (menuHighScore) menuHighScore.innerText = highScore;
    }
  }
  
  function checkLevelUp() {
    let newLevel = currentLevel;
    for (let i = currentLevel; i < levelThresholds.length; i++) {
      if (score >= levelThresholds[i] && i + 1 > currentLevel) newLevel = i + 1;
    }
    if (newLevel > currentLevel) {
      currentLevel = newLevel;
      levelSpan.innerText = currentLevel;
      let targetBpm = levelBpmMap[currentLevel] || 210;
      if (targetBpm > currentBpm) { currentBpm = targetBpm; bpmDisplaySpan.innerText = currentBpm; }
      if (currentLevel >= 9) patternComplexity = 5;
      else if (currentLevel >= 7) patternComplexity = 4;
      else if (currentLevel >= 5) patternComplexity = 3;
      else if (currentLevel >= 3) patternComplexity = 2;
      else if (currentLevel >= 2) patternComplexity = 1;
      currentPattern = patternLibrary[patternComplexity];
      updatePatternDisplay();
    }
    let nextThreshold = levelThresholds[currentLevel] || levelThresholds[levelThresholds.length - 1];
    let prevThreshold = levelThresholds[currentLevel - 1] || 0;
    let progressPercent = Math.min(100, ((score - prevThreshold) / (nextThreshold - prevThreshold)) * 100);
    levelProgressBar.style.width = progressPercent + '%';
    nextLevelScoreSpan.innerText = nextThreshold;
  }
  
  function loseLife() {
    lives--;
    livesSpan.innerText = lives;
    if (lives <= 0) gameOver();
  }
  
  function gameOver() {
    active = false;
    stopGameLoop();
    finalScoreSpan.innerText = Math.floor(score);
    finalLevelSpan.innerText = currentLevel;
    gameOverModal.style.display = 'flex';
    updateHighScore();
  }
  
  function scheduleNotesLoop() {
    if (!active || !window._gameStartTime) return;
    const now = performance.now();
    const elapsedMs = now - window._gameStartTime;
    const beatDurationMs = 60000 / currentBpm;
    let latestBeatIndex = Math.floor(elapsedMs / beatDurationMs) + 4;
    let maxGenerated = 0;
    for (let note of notesArray) if (note.beatIndex > maxGenerated) maxGenerated = note.beatIndex;
    const patternLen = currentPattern.pattern.length;
    for (let beatIdx = maxGenerated + 1; beatIdx <= latestBeatIndex; beatIdx++) {
      if (currentPattern.pattern[beatIdx % patternLen] === 1) {
        const noteSpawnTime = window._gameStartTime + (beatIdx * beatDurationMs);
        if (noteSpawnTime > performance.now() - 100) {
          notesArray.push({ id: nextNoteId++, beatIndex: beatIdx, targetTime: noteSpawnTime, judged: false, leftPercent: START_PERCENT, judgedGrade: null });
        }
      }
    }
  }
  
  function updateNotesPosition(now) {
    for (let note of notesArray) {
      if (note.judged) continue;
      let progress = 1 - ((note.targetTime - now) / TRAVEL_DURATION_MS);
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;
      note.leftPercent = START_PERCENT + (TARGET_PERCENT - START_PERCENT) * progress;
      note.leftPercent = Math.min(TARGET_PERCENT + 5, Math.max(START_PERCENT - 2, note.leftPercent));
    }
  }
  
  function renderNotes() {
    beatTrack.innerHTML = '';
    for (let note of notesArray) {
      if (note.judged && note.judgedGrade === 'MISS') continue;
      const noteDiv = document.createElement('div');
      noteDiv.className = 'beat-note';
      noteDiv.style.left = `${note.leftPercent}%`;
      if (note.judged && note.judgedGrade) {
        if (note.judgedGrade === 'PERFECT') noteDiv.textContent = '⚡';
        else if (note.judgedGrade === 'GREAT') noteDiv.textContent = '👍';
        else if (note.judgedGrade === 'GOOD') noteDiv.textContent = '✔️';
        else noteDiv.textContent = '🎵';
        noteDiv.style.opacity = '0.7';
      } else { noteDiv.textContent = '🎵'; }
      beatTrack.appendChild(noteDiv);
    }
  }
  
  function evaluateTap() {
    if (!active) return false;
    const now = performance.now();
    let bestNote = null, bestDelta = Infinity;
    for (let note of notesArray) {
      if (note.judged) continue;
      const delta = Math.abs(now - note.targetTime);
      if (delta < bestDelta && delta <= GOOD_WINDOW + 30) { bestDelta = delta; bestNote = note; }
    }
    if (bestNote && bestDelta <= GOOD_WINDOW) {
      let grade = bestDelta <= PERFECT_WINDOW ? 'PERFECT' : (bestDelta <= GREAT_WINDOW ? 'GREAT' : 'GOOD');
      score += POINTS[grade] + Math.floor(combo / 10) * 5;
      combo++;
      bestNote.judged = true;
      bestNote.judgedGrade = grade;
      lastGradeSpan.innerText = grade;
      tapPad.classList.add('tap-feedback');
      setTimeout(() => tapPad.classList.remove('tap-feedback'), 120);
      updateUI();
      updateHighScore();
      checkLevelUp();
      return true;
    } else {
      let anyMiss = false;
      for (let note of notesArray) {
        if (!note.judged && (now - note.targetTime) > GOOD_WINDOW + 50) {
          note.judged = true; note.judgedGrade = 'MISS'; anyMiss = true;
        }
      }
      combo = 0;
      lastGradeSpan.innerText = 'MISS';
      updateUI();
      tapPad.classList.add('tap-feedback');
      setTimeout(() => tapPad.classList.remove('tap-feedback'), 120);
      loseLife();
      return false;
    }
  }
  
  function cleanupMisses() {
    if (!active) return;
    const now = performance.now();
    for (let note of notesArray) {
      if (!note.judged && (now - note.targetTime) > GOOD_WINDOW + 80) {
        note.judged = true; note.judgedGrade = 'MISS';
        combo = 0; lastGradeSpan.innerText = 'MISS'; updateUI(); loseLife();
      }
    }
    notesArray = notesArray.filter(n => !(n.judged === true && (performance.now() - n.targetTime) > 2000));
  }
  
  function updateUI() { scoreSpan.innerText = Math.floor(score); comboSpan.innerText = combo; }
  
  function stopGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    if (animationId) cancelAnimationFrame(animationId);
    active = false;
  }
  
  function animationLoop() {
    if (!active) return;
    const now = performance.now();
    updateNotesPosition(now);
    cleanupMisses();
    scheduleNotesLoop();
    renderNotes();
    animationId = requestAnimationFrame(animationLoop);
  }
  
  function startGame() {
    stopGameLoop();
    active = true;
    score = 0; combo = 0; lives = 3; currentLevel = 1; currentBpm = 100; patternComplexity = 0;
    notesArray = []; nextNoteId = 1; currentPattern = patternLibrary[0];
    updatePatternDisplay();
    bpmDisplaySpan.innerText = currentBpm;
    scoreSpan.innerText = '0'; comboSpan.innerText = '0'; lastGradeSpan.innerText = '—';
    livesSpan.innerText = '3'; levelSpan.innerText = '1'; levelProgressBar.style.width = '0%'; nextLevelScoreSpan.innerText = '500';
    window._gameStartTime = performance.now() + 50;
    setTimeout(() => { if (active) scheduleNotesLoop(); }, 30);
    animationId = requestAnimationFrame(animationLoop);
    gameLoopInterval = setInterval(() => { if (active) scheduleNotesLoop(); }, 200);
  }
  
  function resetAndShowMenu() {
    active = false;
    stopGameLoop();
    gameOverModal.style.display = 'none';
    mainMenu.style.display = 'flex';
    gameScreen.style.display = 'none';
    notesArray = [];
    if (animationId) cancelAnimationFrame(animationId);
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    updateHighScore();
  }
  
  function showGame() {
    mainMenu.style.display = 'none';
    gameScreen.style.display = 'flex';
    gameOverModal.style.display = 'none';
    startGame();
  }
  
  // Event bindings
  startBtn.addEventListener('click', showGame);
  quitBtn.addEventListener('click', resetAndShowMenu);
  restartBtn.addEventListener('click', () => { if (!active) showGame(); else { stopGameLoop(); startGame(); } });
  playAgainBtn.addEventListener('click', () => { gameOverModal.style.display = 'none'; showGame(); });
  menuAfterGameBtn.addEventListener('click', () => { gameOverModal.style.display = 'none'; resetAndShowMenu(); });
  
  tapPad.addEventListener('click', (e) => { e.preventDefault(); if (active) evaluateTap(); });
  window.addEventListener('keydown', (e) => { if (active && (e.code === 'Space' || e.code === 'ArrowUp')) { e.preventDefault(); evaluateTap(); } });
  
  mainMenu.style.display = 'flex';
  gameScreen.style.display = 'none';
  gameOverModal.style.display = 'none';
})();