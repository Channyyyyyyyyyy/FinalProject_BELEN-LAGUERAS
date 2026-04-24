// ------------------- RHYTHM TAP GAME -------------------
// Assigned to: Lagueras-Belen
// Features: scrolling notes, BPM increases over time, dynamic patterns,
// perfect/great/good/miss judgment, combo & scoring.
// FIXED: Lives deduction on miss, game over when lives = 0

(function() {
  // ----- DOM Elements -----
  const mainMenu = document.getElementById('mainMenu');
  const gameScreen = document.getElementById('gameScreen');
  const startBtn = document.getElementById('startGameBtn');
  const quitBtn = document.getElementById('quitToMenuBtn');
  const restartBtn = document.getElementById('restartGameBtn');
  const tapPad = document.getElementById('tapPad');
  const beatTrack = document.getElementById('beatTrack');
  
  // UI value spans
  const scoreSpan = document.getElementById('scoreValue');
  const comboSpan = document.getElementById('comboValue');
  const livesSpan = document.getElementById('livesValue');
  const lastGradeSpan = document.getElementById('lastGrade');
  const bpmDisplaySpan = document.getElementById('bpmDisplay');
  const patternLabelSpan = document.getElementById('patternLabel');
  const menuHighScore = document.getElementById('menuHighScore');
  const levelSpan = document.getElementById('levelValue');
  const levelProgressBar = document.getElementById('levelProgressBar');
  const nextLevelScoreSpan = document.getElementById('nextLevelScore');
  
  // Game Over Modal elements
  const gameOverModal = document.getElementById('gameOverModal');
  const finalScoreSpan = document.getElementById('finalScore');
  const finalLevelSpan = document.getElementById('finalLevel');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const menuAfterGameBtn = document.getElementById('menuAfterGameBtn');

  // ----- Game State -----
  let active = false;
  let animationId = null;
  let gameLoopInterval = null;
  let notesArray = [];
  let nextNoteId = 1;
  let score = 0;
  let combo = 0;
  let lives = 3;
  let currentLevel = 1;
  let currentBpm = 100;
  let patternStep = 0;
  
  // High score tracking
  let highScore = localStorage.getItem('rhythmTapHighScore') ? parseInt(localStorage.getItem('rhythmTapHighScore')) : 0;
  if (menuHighScore) menuHighScore.innerText = highScore;
  
  // Difficulty & tempo escalation
  let tempoIncreaseInterval = null;
  let patternComplexity = 0;
  
  // Timing windows (in milliseconds)
  const PERFECT_WINDOW = 55;
  const GREAT_WINDOW = 110;
  const GOOD_WINDOW = 180;
  
  const TARGET_PERCENT = 88;
  const START_PERCENT = -12;
  const TRAVEL_DURATION_MS = 550;
  
  const POINTS = { PERFECT: 100, GREAT: 70, GOOD: 40, MISS: 0 };
  
  // Pattern sequences
  const patternLibrary = [
    { name: 'basic',    pattern: [1,0,1,0,1,0,1,0] },
    { name: 'steady',   pattern: [1,1,0,1,1,0,1,1] },
    { name: 'double',   pattern: [1,1,1,0,1,1,1,0] },
    { name: 'triplet',  pattern: [1,0,1,1,0,1,1,1] },
    { name: 'rush',     pattern: [1,1,1,1,0,1,1,1] },
    { name: 'full',     pattern: [1,1,1,1,1,1,1,1] }
  ];
  let currentPattern = patternLibrary[0];
  let window_gameStartTime = null;
  
  // ----- Helper Functions -----
  function updatePatternDisplay() {
    if (patternLabelSpan) patternLabelSpan.innerText = currentPattern.name;
  }
  
  function updateHighScore() {
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('rhythmTapHighScore', highScore);
      if (menuHighScore) menuHighScore.innerText = highScore;
    }
  }
  
  function updateUI() {
    if (scoreSpan) scoreSpan.innerText = Math.floor(score);
    if (comboSpan) comboSpan.innerText = combo;
    if (livesSpan) livesSpan.innerText = lives;
    if (bpmDisplaySpan) bpmDisplaySpan.innerText = currentBpm;
    if (levelSpan) levelSpan.innerText = currentLevel;
    
    const nextLevelScore = currentLevel * 500;
    if (nextLevelScoreSpan) nextLevelScoreSpan.innerText = nextLevelScore;
    
    const currentLevelProgress = score % 500;
    const progressPercent = (currentLevelProgress / 500) * 100;
    if (levelProgressBar) levelProgressBar.style.width = `${progressPercent}%`;
    
    const newLevel = Math.floor(score / 500) + 1;
    if (newLevel > currentLevel && newLevel <= 10) {
      currentLevel = newLevel;
      currentBpm = Math.min(210, 100 + (currentLevel - 1) * 12);
      if (bpmDisplaySpan) bpmDisplaySpan.innerText = currentBpm;
      if (levelSpan) levelSpan.innerText = currentLevel;
      
      const patternIndex = Math.min(currentLevel - 1, patternLibrary.length - 1);
      currentPattern = patternLibrary[patternIndex];
      updatePatternDisplay();
    }
  }
  
  // ----- GAME OVER FUNCTION -----
  function gameOver() {
    if (!active) return;
    
    active = false;
    
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    if (tempoIncreaseInterval) clearInterval(tempoIncreaseInterval);
    if (animationId) cancelAnimationFrame(animationId);
    
    if (finalScoreSpan) finalScoreSpan.innerText = Math.floor(score);
    if (finalLevelSpan) finalLevelSpan.innerText = currentLevel;
    if (gameOverModal) gameOverModal.style.display = 'flex';
    
    updateHighScore();
  }
  
  // ----- DEDUCT LIFE AND HANDLE MISS -----
  function deductLifeAndMiss() {
    if (!active) return;
    
    lives--;
    updateUI();
    
    combo = 0;
    updateUI();
    
    if (lastGradeSpan) lastGradeSpan.innerText = 'MISS';
    
    if (tapPad) {
      tapPad.classList.add('tap-feedback');
      setTimeout(() => tapPad.classList.remove('tap-feedback'), 120);
    }
    
    if (lives <= 0) {
      gameOver();
    }
  }
  
  // ----- Schedule notes -----
  function scheduleNotesLoop() {
    if (!active || !window_gameStartTime) return;
    
    const now = performance.now();
    const beatDurationMs = 60000 / currentBpm;
    let latestBeatIndex = Math.floor((now - window_gameStartTime) / beatDurationMs) + 6;
    
    let maxGenerated = 0;
    for (let note of notesArray) {
      if (note.beatIndex > maxGenerated) maxGenerated = note.beatIndex;
    }
    
    const patternLen = currentPattern.pattern.length;
    for (let beatIdx = maxGenerated + 1; beatIdx <= latestBeatIndex; beatIdx++) {
      const patternPos = beatIdx % patternLen;
      const shouldSpawn = currentPattern.pattern[patternPos] === 1;
      
      if (shouldSpawn) {
        const noteSpawnTime = window_gameStartTime + (beatIdx * beatDurationMs);
        const nowRef = performance.now();
        
        if (noteSpawnTime > nowRef - 200) {
          const noteObj = {
            id: nextNoteId++,
            beatIndex: beatIdx,
            targetTime: noteSpawnTime,
            judged: false,
            judgedGrade: null,
            leftPercent: START_PERCENT
          };
          notesArray.push(noteObj);
        }
      }
    }
  }
  
  // ----- Update note positions -----
  function updateNotesPosition(now) {
    for (let note of notesArray) {
      if (note.judged) continue;
      
      const timeToTarget = note.targetTime - now;
      const totalDuration = TRAVEL_DURATION_MS;
      let progress = 1 - (timeToTarget / totalDuration);
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;
      
      const leftPos = START_PERCENT + (TARGET_PERCENT - START_PERCENT) * progress;
      note.leftPercent = Math.min(TARGET_PERCENT + 5, Math.max(START_PERCENT - 2, leftPos));
    }
  }
  
  // ----- Render notes -----
  function renderNotes() {
    if (!beatTrack) return;
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
      } else {
        noteDiv.textContent = '🎵';
      }
      beatTrack.appendChild(noteDiv);
    }
  }
  
  // ----- Check for missed notes -----
  function cleanupAndCheckMisses() {
    if (!active) return;
    
    const now = performance.now();
    let missed = false;
    
    for (let note of notesArray) {
      if (!note.judged && (now - note.targetTime) > GOOD_WINDOW + 100) {
        note.judged = true;
        note.judgedGrade = 'MISS';
        missed = true;
      }
    }
    
    if (missed) {
      deductLifeAndMiss();
    }
    
    notesArray = notesArray.filter(n => !(n.judged === true && (performance.now() - n.targetTime) > 2000));
  }
  
  // ----- Evaluate tap -----
  function evaluateTap() {
    if (!active) return false;
    
    const now = performance.now();
    let bestNote = null;
    let bestDelta = Infinity;
    
    for (let note of notesArray) {
      if (note.judged) continue;
      const delta = Math.abs(now - note.targetTime);
      if (delta < bestDelta && delta <= GOOD_WINDOW + 50) {
        bestDelta = delta;
        bestNote = note;
      }
    }
    
    if (bestNote && bestDelta <= GOOD_WINDOW) {
      let grade = '';
      let addPoints = 0;
      
      if (bestDelta <= PERFECT_WINDOW) {
        grade = 'PERFECT';
        addPoints = POINTS.PERFECT;
      } else if (bestDelta <= GREAT_WINDOW) {
        grade = 'GREAT';
        addPoints = POINTS.GREAT;
      } else {
        grade = 'GOOD';
        addPoints = POINTS.GOOD;
      }
      
      score += addPoints;
      combo++;
      
      if (combo % 10 === 0) {
        score += 5;
      }
      
      bestNote.judged = true;
      bestNote.judgedGrade = grade;
      
      if (lastGradeSpan) lastGradeSpan.innerText = grade;
      updateUI();
      updateHighScore();
      
      if (tapPad) {
        tapPad.classList.add('tap-feedback');
        setTimeout(() => tapPad.classList.remove('tap-feedback'), 120);
      }
      
      return true;
    }
    
    const hasActiveNotes = notesArray.some(n => !n.judged);
    if (hasActiveNotes) {
      deductLifeAndMiss();
    }
    
    return false;
  }
  
  // ----- BPM progression -----
  function startProgression() {
    if (tempoIncreaseInterval) clearInterval(tempoIncreaseInterval);
    
    tempoIncreaseInterval = setInterval(() => {
      if (!active) return;
      
      let newBpm = currentBpm + 5;
      if (newBpm > 210) newBpm = 210;
      currentBpm = newBpm;
      if (bpmDisplaySpan) bpmDisplaySpan.innerText = currentBpm;
      
      if (currentBpm >= 130 && patternComplexity < 1) {
        patternComplexity = 1;
        currentPattern = patternLibrary[1];
        updatePatternDisplay();
      } else if (currentBpm >= 150 && patternComplexity < 2) {
        patternComplexity = 2;
        currentPattern = patternLibrary[2];
        updatePatternDisplay();
      } else if (currentBpm >= 170 && patternComplexity < 3) {
        patternComplexity = 3;
        currentPattern = patternLibrary[3];
        updatePatternDisplay();
      } else if (currentBpm >= 190 && patternComplexity < 4) {
        patternComplexity = 4;
        currentPattern = patternLibrary[4];
        updatePatternDisplay();
      } else if (currentBpm >= 205 && patternComplexity < 5) {
        patternComplexity = 5;
        currentPattern = patternLibrary[5];
        updatePatternDisplay();
      }
    }, 12000);
  }
  
  // ----- Animation loop -----
  function animationLoop() {
    if (!active) return;
    
    const now = performance.now();
    updateNotesPosition(now);
    cleanupAndCheckMisses();
    scheduleNotesLoop();
    renderNotes();
    
    animationId = requestAnimationFrame(animationLoop);
  }
  
  // ----- Stop all game loops -----
  function stopGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    if (tempoIncreaseInterval) clearInterval(tempoIncreaseInterval);
    if (animationId) cancelAnimationFrame(animationId);
    gameLoopInterval = null;
    tempoIncreaseInterval = null;
    animationId = null;
  }
  
  // ----- Start the game -----
  function startGame() {
    stopGameLoop();
    
    active = true;
    score = 0;
    combo = 0;
    lives = 3;
    currentLevel = 1;
    currentBpm = 100;
    patternComplexity = 0;
    notesArray = [];
    nextNoteId = 1;
    currentPattern = patternLibrary[0];
    
    updateUI();
    updatePatternDisplay();
    if (lastGradeSpan) lastGradeSpan.innerText = '—';
    if (bpmDisplaySpan) bpmDisplaySpan.innerText = currentBpm;
    
    window_gameStartTime = performance.now() + 200;
    
    setTimeout(() => {
      if (active) scheduleNotesLoop();
    }, 50);
    
    startProgression();
    animationId = requestAnimationFrame(animationLoop);
    
    gameLoopInterval = setInterval(() => {
      if (active) scheduleNotesLoop();
    }, 150);
  }
  
  // ----- Reset and return to menu -----
  function resetAndShowMenu() {
    active = false;
    stopGameLoop();
    
    if (mainMenu) mainMenu.style.display = 'flex';
    if (gameScreen) gameScreen.style.display = 'none';
    if (gameOverModal) gameOverModal.style.display = 'none';
    
    notesArray = [];
    updateHighScore();
  }
  
  // ----- Show game screen and start -----
  function showGame() {
    if (mainMenu) mainMenu.style.display = 'none';
    if (gameScreen) gameScreen.style.display = 'flex';
    if (gameOverModal) gameOverModal.style.display = 'none';
    startGame();
  }
  
  // ----- Restart current game -----
  function restartGame() {
    stopGameLoop();
    startGame();
  }
  
  // ----- Event Bindings -----
  if (startBtn) {
    startBtn.addEventListener('click', showGame);
  }
  
  if (quitBtn) {
    quitBtn.addEventListener('click', resetAndShowMenu);
  }
  
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (active) restartGame();
      else showGame();
    });
  }
  
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
      if (gameOverModal) gameOverModal.style.display = 'none';
      showGame();
    });
  }
  
  if (menuAfterGameBtn) {
    menuAfterGameBtn.addEventListener('click', () => {
      if (gameOverModal) gameOverModal.style.display = 'none';
      resetAndShowMenu();
    });
  }
  
  const tapHandler = (e) => {
    e.preventDefault();
    if (!active) return;
    evaluateTap();
  };
  
  if (tapPad) {
    tapPad.addEventListener('click', tapHandler);
    tapPad.addEventListener('touchstart', tapHandler);
  }
  
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      evaluateTap();
    }
  });
  
  if (mainMenu) mainMenu.style.display = 'flex';
  if (gameScreen) gameScreen.style.display = 'none';
  if (gameOverModal) gameOverModal.style.display = 'none';
})();