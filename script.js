// ------------------- RHYTHM TAP GAME -------------------
// Assigned to: Lagueras-Belen
// Features: scrolling notes, BPM increases over time, dynamic patterns,
// perfect/great/good/miss judgment, combo & scoring.

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
  const lastGradeSpan = document.getElementById('lastGrade');
  const bpmDisplaySpan = document.getElementById('bpmDisplay');
  const patternLabelSpan = document.getElementById('patternLabel');
  const menuHighScore = document.getElementById('menuHighScore');

  // ----- Game State -----
  let active = false;          // Is game running?
  let animationId = null;
  let gameLoopInterval = null;
  let notesArray = [];         // Each note: { id, leftPercent, createdAt, judged }
  let nextNoteId = 1;
  let score = 0;
  let combo = 0;
  let currentBpm = 100;        // starting BPM
  let baseIntervalMs = 60000 / currentBpm; // ms per beat
  let patternStep = 0;
  
  // High score tracking
  let highScore = localStorage.getItem('rhythmTapHighScore') ? parseInt(localStorage.getItem('rhythmTapHighScore')) : 0;
  if (menuHighScore) menuHighScore.innerText = highScore;
  
  // Difficulty & tempo escalation
  let tempoIncreaseInterval = null;
  let patternComplexity = 0;
  
  // Timing windows (in milliseconds relative to perfect)
  const PERFECT_WINDOW = 55;
  const GREAT_WINDOW = 110;
  const GOOD_WINDOW = 180;
  // note scroll duration = time from left (0%) to target (right 12% => ~88% track width)
  // we define travel distance: starts at left: -5% (off visible) to targetLine at 88% (relative to parent)
  // but easier: we define leftPercent from -10% to 88% (target line at 88% width)
  const TARGET_PERCENT = 88;   // target line at 88% of track width (right side)
  const START_PERCENT = -12;    // start just outside left edge
  const TRAVEL_DURATION_MS = 550;  // note travel time (ms) from start to target (big impact for visual)
  
  // Scoring values
  const POINTS = { PERFECT: 100, GREAT: 70, GOOD: 40, MISS: 0 };
  
  // --- Pattern sequences (rhythm patterns: "1"=quarter, "2"=eighth note, "0"=rest / skip)
  // patterns become denser as difficulty increases
  const patternLibrary = [
    { name: 'basic',    pattern: [1,0,1,0,1,0,1,0] },          // 4 beats simple
    { name: 'steady',   pattern: [1,1,0,1,1,0,1,1] },
    { name: 'double',   pattern: [1,1,1,0,1,1,1,0] },
    { name: 'triplet',  pattern: [1,0,1,1,0,1,1,1] },
    { name: 'rush',     pattern: [1,1,1,1,0,1,1,1] },
    { name: 'full',     pattern: [1,1,1,1,1,1,1,1] }
  ];
  let currentPattern = patternLibrary[0];
  
  // helper: update pattern label
  function updatePatternDisplay() {
    patternLabelSpan.innerText = currentPattern.name;
  }
  
  // Update high score display and save
  function updateHighScore() {
    if (score > highScore) {
      highScore = Math.floor(score);
      localStorage.setItem('rhythmTapHighScore', highScore);
      if (menuHighScore) menuHighScore.innerText = highScore;
    }
  }
  
  // ----- Helper: schedule notes dynamically (based on current BPM and pattern)
  let lastScheduleFrame = 0;
  let scheduledBeatCount = 0;
  
  function scheduleNotesLoop() {
    if (!active) return;
    // we schedule notes every 100ms looking ahead: ensure that notes for upcoming 2 seconds are created
    const now = performance.now();
    const lookaheadMs = 1800;
    // get existing notes last scheduled time approx: we use scheduledBeatCount to generate based on beat index
    // we generate notes using a beat index relative to game start.
    if (!window._gameStartTime) return;
    const elapsedMs = now - window._gameStartTime;
    const beatDurationMs = 60000 / currentBpm;
    let latestBeatIndex = Math.floor(elapsedMs / beatDurationMs) + 4; // generate up to +4 beats
    
    // get highest generated beat index
    let maxGenerated = 0;
    for (let note of notesArray) {
      if (note.beatIndex > maxGenerated) maxGenerated = note.beatIndex;
    }
    
    const patternLen = currentPattern.pattern.length;
    for (let beatIdx = maxGenerated + 1; beatIdx <= latestBeatIndex; beatIdx++) {
      // determine if note should spawn based on pattern
      const patternPos = beatIdx % patternLen;
      const shouldSpawn = currentPattern.pattern[patternPos] === 1;
      if (shouldSpawn) {
        const noteSpawnTime = window._gameStartTime + (beatIdx * beatDurationMs);
        const nowRef = performance.now();
        if (noteSpawnTime > nowRef - 100) { // only if not too far in past
          const arrivalTime = noteSpawnTime;
          // store visual progress: note will be at START_PERCENT at spawn, and reach target at arrival
          const noteObj = {
            id: nextNoteId++,
            beatIndex: beatIdx,
            spawnTime: noteSpawnTime,
            targetTime: noteSpawnTime,
            judged: false,
            leftPercent: START_PERCENT,
            judgedGrade: null
          };
          notesArray.push(noteObj);
        }
      }
    }
  }
  
  // Animation frame: update note positions based on current time
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
  
  function renderNotes() {
    beatTrack.innerHTML = '';
    for (let note of notesArray) {
      if (note.judged && note.judgedGrade === 'MISS') continue;
      const noteDiv = document.createElement('div');
      noteDiv.className = 'beat-note';
      noteDiv.style.left = `${note.leftPercent}%`;
      // emoji or symbol based on grade if judged
      if (note.judged && note.judgedGrade) {
        if (note.judgedGrade === 'PERFECT') noteDiv.textContent = '⚡';
        else if (note.judgedGrade === 'GREAT') noteDiv.textContent = '👍';
        else if (note.judgedGrade === 'GOOD') noteDiv.textContent = '✔️';
        else noteDiv.textContent = '🎵';
        noteDiv.style.opacity = '0.7';
        noteDiv.style.filter = 'grayscale(0.2)';
        noteDiv.setAttribute('data-grade', note.judgedGrade);
      } else {
        noteDiv.textContent = '🎵';
      }
      beatTrack.appendChild(noteDiv);
    }
  }
  
  // Judge a tap: find nearest note that is close to target line
  function evaluateTap() {
    if (!active) return false;
    const now = performance.now();
    let bestNote = null;
    let bestDelta = Infinity;
    
    for (let note of notesArray) {
      if (note.judged) continue;
      const delta = Math.abs(now - note.targetTime);
      if (delta < bestDelta && delta <= GOOD_WINDOW + 30) {
        bestDelta = delta;
        bestNote = note;
      }
    }
    
    if (bestNote && bestDelta <= GOOD_WINDOW) {
      let grade = '';
      if (bestDelta <= PERFECT_WINDOW) grade = 'PERFECT';
      else if (bestDelta <= GREAT_WINDOW) grade = 'GREAT';
      else grade = 'GOOD';
      
      // apply score and combo
      const addPoints = POINTS[grade];
      score += addPoints;
      combo++;
      const comboBonus = Math.floor(combo / 10) * 5;
      score += comboBonus;
      
      bestNote.judged = true;
      bestNote.judgedGrade = grade;
      // visual grade update
      lastGradeSpan.innerText = grade;
      
      // Add juicy tap feedback
      tapPad.classList.add('tap-feedback');
      setTimeout(() => tapPad.classList.remove('tap-feedback'), 120);
      updateUI();
      updateHighScore();
      
      return true;
    } else {
      // MISS: penalty only if any active note passed target?
      let anyMiss = false;
      for (let note of notesArray) {
        if (!note.judged && (now - note.targetTime) > GOOD_WINDOW + 50) {
          note.judged = true;
          note.judgedGrade = 'MISS';
          anyMiss = true;
        }
      }
      if (anyMiss || bestDelta === Infinity) {
        combo = 0;
        lastGradeSpan.innerText = 'MISS';
        updateUI();
        tapPad.classList.add('tap-feedback');
        setTimeout(() => tapPad.classList.remove('tap-feedback'), 120);
      } else {
        // empty tap but no note near -> minor miss but does not break combo fully? but to be accurate, reset combo
        combo = 0;
        lastGradeSpan.innerText = 'MISS';
        updateUI();
      }
      return false;
    }
  }
  
  // periodic miss check for notes that passed target unjudged
  function cleanupMisses() {
    if (!active) return;
    const now = performance.now();
    let anyMiss = false;
    for (let note of notesArray) {
      if (!note.judged && (now - note.targetTime) > GOOD_WINDOW + 80) {
        note.judged = true;
        note.judgedGrade = 'MISS';
        anyMiss = true;
      }
    }
    if (anyMiss) {
      combo = 0;
      lastGradeSpan.innerText = 'MISS';
      updateUI();
    }
    // remove old notes from memory
    notesArray = notesArray.filter(n => !(n.judged === true && (performance.now() - n.targetTime) > 2000));
  }
  
  function updateUI() {
    scoreSpan.innerText = Math.floor(score);
    comboSpan.innerText = combo;
  }
  
  // tempo & pattern progression: every 10 seconds increase BPM by 8 and maybe change pattern
  function startProgression() {
    if (tempoIncreaseInterval) clearInterval(tempoIncreaseInterval);
    tempoIncreaseInterval = setInterval(() => {
      if (!active) return;
      let newBpm = currentBpm + 6;
      if (newBpm > 210) newBpm = 210;
      currentBpm = newBpm;
      bpmDisplaySpan.innerText = currentBpm;
      
      // increase pattern difficulty based on BPM thresholds
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
    }, 10000);
  }
  
  function stopGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    if (tempoIncreaseInterval) clearInterval(tempoIncreaseInterval);
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
    // reset state
    active = true;
    score = 0;
    combo = 0;
    notesArray = [];
    nextNoteId = 1;
    currentBpm = 100;
    patternComplexity = 0;
    currentPattern = patternLibrary[0];
    updatePatternDisplay();
    bpmDisplaySpan.innerText = currentBpm;
    scoreSpan.innerText = '0';
    comboSpan.innerText = '0';
    lastGradeSpan.innerText = '—';
    window._gameStartTime = performance.now() + 50;
    // initial schedule
    setTimeout(() => {
      if (active) scheduleNotesLoop();
    }, 30);
    startProgression();
    animationId = requestAnimationFrame(animationLoop);
    // additional scheduling interval for beats
    gameLoopInterval = setInterval(() => {
      if (active) {
        scheduleNotesLoop();
      }
    }, 200);
  }
  
  function resetAndShowMenu() {
    active = false;
    stopGameLoop();
    mainMenu.style.display = 'flex';
    gameScreen.style.display = 'none';
    notesArray = [];
    if (tempoIncreaseInterval) clearInterval(tempoIncreaseInterval);
    if (animationId) cancelAnimationFrame(animationId);
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    updateHighScore();
  }
  
  function showGame() {
    mainMenu.style.display = 'none';
    gameScreen.style.display = 'flex';
    startGame();
  }
  
  function restartGame() {
    if (!active) return;
    stopGameLoop();
    startGame();
  }
  
  // Event binding
  startBtn.addEventListener('click', () => {
    showGame();
  });
  quitBtn.addEventListener('click', () => {
    resetAndShowMenu();
  });
  restartBtn.addEventListener('click', () => {
    if (active) restartGame();
    else showGame();
  });
  
  const tapHandler = (e) => {
    e.preventDefault();
    if (!active) return;
    evaluateTap();
  };
  
  tapPad.addEventListener('click', tapHandler);
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      evaluateTap();
    }
  });
  
  // initial: show menu, hide game
  mainMenu.style.display = 'flex';
  gameScreen.style.display = 'none';
})();