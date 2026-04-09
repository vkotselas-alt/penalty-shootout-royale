const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const shotsLeftEl = document.getElementById("shots-left");
const roundLabelEl = document.getElementById("round-label");
const turnLabelEl = document.getElementById("turn-label");
const bestScoreEl = document.getElementById("best-score");
const powerValueEl = document.getElementById("power-value");
const powerFillEl = document.getElementById("power-fill");
const modeSelectEl = document.getElementById("mode-select");
const difficultySelectEl = document.getElementById("difficulty-select");
const startButtonEl = document.getElementById("start-button");
const muteButtonEl = document.getElementById("mute-button");
const overlayEl = document.getElementById("overlay");
const overlayTagEl = document.getElementById("overlay-tag");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayTextEl = document.getElementById("overlay-text");
const mobileButtons = document.querySelectorAll("[data-action]");

const STORAGE_KEY = "penalty-shootout-royale-best";

const difficulties = {
  easy: { keeperSpeed: 170, saveWidth: 85 },
  medium: { keeperSpeed: 250, saveWidth: 110 },
  hard: { keeperSpeed: 340, saveWidth: 140 }
};

const tournamentStages = [
  { label: "Quarter Final", target: 2 },
  { label: "Semi Final", target: 3 },
  { label: "Grand Final", target: 4 }
];

const audioState = {
  muted: false,
  context: null
};

const state = {
  running: false,
  mode: "single",
  difficulty: "medium",
  bestScore: Number(localStorage.getItem(STORAGE_KEY) || 0),
  lastTime: 0,
  power: 0.5,
  powerDirection: 1,
  aimX: 0,
  aimY: 0.45,
  shot: null,
  message: "",
  messageTimer: 0,
  celebrationTimer: 0,
  crowdPulse: 0,
  pendingReset: false,
  awaitingTournamentContinue: false,
  keeper: {
    x: canvas.width / 2,
    baseY: 195,
    width: 110,
    height: 30,
    direction: 1
  },
  single: {
    score: 0,
    shotsLeft: 5
  },
  tournament: {
    stageIndex: 0,
    score: 0,
    shotsLeft: 5
  },
  duel: {
    activePlayer: 0,
    suddenDeath: false,
    roundShots: 0,
    roundResults: [],
    players: [
      { name: "Player 1", score: 0, shotsLeft: 5 },
      { name: "Player 2", score: 0, shotsLeft: 5 }
    ]
  }
};

function ensureAudio() {
  if (audioState.context || audioState.muted) {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  audioState.context = new AudioContextClass();
}

function playTone(frequency, duration, type, volume) {
  if (audioState.muted) {
    return;
  }

  ensureAudio();
  if (!audioState.context) {
    return;
  }

  const ctxAudio = audioState.context;
  const oscillator = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain);
  gain.connect(ctxAudio.destination);

  const now = ctxAudio.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playKickSound() {
  playTone(210, 0.12, "triangle", 0.08);
}

function playGoalSound() {
  playTone(420, 0.16, "square", 0.08);
  playTone(640, 0.24, "sine", 0.06);
}

function playSaveSound() {
  playTone(130, 0.2, "sawtooth", 0.07);
}

function playWinSound() {
  playTone(520, 0.14, "square", 0.08);
  playTone(660, 0.2, "square", 0.06);
  playTone(780, 0.26, "square", 0.05);
}

function getDifficultyConfig() {
  return difficulties[state.difficulty];
}

function showOverlay(tag, title, text) {
  overlayTagEl.textContent = tag;
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

function setPrimaryButtonLabel(text) {
  startButtonEl.textContent = text;
}

function setMessage(text, duration, celebrate) {
  state.message = text;
  state.messageTimer = duration;
  state.celebrationTimer = celebrate ? duration : 0;
}

function resetAim() {
  state.aimX = 0;
  state.aimY = 0.45;
  state.power = 0.5;
  state.powerDirection = 1;
  state.shot = null;
  state.pendingReset = false;
  state.keeper.x = canvas.width / 2;
  state.keeper.direction = Math.random() > 0.5 ? 1 : -1;
}

function resetModeState() {
  state.single = { score: 0, shotsLeft: 5 };
  state.tournament = { stageIndex: 0, score: 0, shotsLeft: 5 };
  state.duel = {
    activePlayer: 0,
    suddenDeath: false,
    roundShots: 0,
    roundResults: [],
    players: [
      { name: "Player 1", score: 0, shotsLeft: 5 },
      { name: "Player 2", score: 0, shotsLeft: 5 }
    ]
  };
  state.awaitingTournamentContinue = false;
}

function beginRun() {
  state.running = true;
  state.lastTime = 0;
  resetAim();
  setMessage("Kickoff", 0.8, false);
  setPrimaryButtonLabel("Shoot");
  updateHud();
  hideOverlay();
}

function startMatch() {
  state.mode = modeSelectEl.value;
  state.difficulty = difficultySelectEl.value;
  resetModeState();
  beginRun();
}

function continueTournament() {
  state.awaitingTournamentContinue = false;
  beginRun();
}

function getDuelShotsLeft(player) {
  if (state.duel.suddenDeath) {
    return 1;
  }
  return player.shotsLeft;
}

function getActiveData() {
  if (state.mode === "single") {
    return {
      score: state.single.score,
      shotsLeft: state.single.shotsLeft,
      roundLabel: "Single Match",
      turnLabel: "Player 1"
    };
  }

  if (state.mode === "tournament") {
    const stage = tournamentStages[state.tournament.stageIndex];
    return {
      score: state.tournament.score,
      shotsLeft: state.tournament.shotsLeft,
      roundLabel: stage.label,
      turnLabel: `Target ${stage.target}`
    };
  }

  const player = state.duel.players[state.duel.activePlayer];
  return {
    score: player.score,
    shotsLeft: getDuelShotsLeft(player),
    roundLabel: state.duel.suddenDeath ? "Sudden Death" : "Duel Mode",
    turnLabel: player.name
  };
}

function updateHud() {
  const active = getActiveData();
  scoreEl.textContent = String(active.score);
  shotsLeftEl.textContent = String(active.shotsLeft);
  roundLabelEl.textContent = active.roundLabel;
  turnLabelEl.textContent = active.turnLabel;
  bestScoreEl.textContent = String(state.bestScore);
  const percent = Math.round(state.power * 100);
  powerValueEl.textContent = `${percent}%`;
  powerFillEl.style.width = `${percent}%`;
}

function saveBestScore(candidate) {
  if (candidate > state.bestScore) {
    state.bestScore = candidate;
    localStorage.setItem(STORAGE_KEY, String(state.bestScore));
  }
}

function endMatch(tag, title, text, winScore) {
  state.running = false;
  state.awaitingTournamentContinue = false;
  saveBestScore(winScore);
  updateHud();
  showOverlay(tag, title, text);
  setPrimaryButtonLabel("Start Match");
  playWinSound();
}

function endDuelIfNeeded() {
  const player1 = state.duel.players[0];
  const player2 = state.duel.players[1];

  if (!state.duel.suddenDeath) {
    if (player1.shotsLeft <= 0 && player2.shotsLeft <= 0) {
      if (player1.score === player2.score) {
        state.duel.suddenDeath = true;
        state.duel.roundShots = 0;
        state.duel.roundResults = [];
        setMessage("Sudden Death", 1.2, false);
        updateHud();
        return false;
      }

      const title = player1.score > player2.score ? "Player 1 wins the duel" : "Player 2 wins the duel";
      endMatch(
        "Match Result",
        title,
        `Final score: Player 1 ${player1.score} - ${player2.score} Player 2.`,
        Math.max(player1.score, player2.score)
      );
      return true;
    }
    return false;
  }

  if (state.duel.roundShots < 2) {
    return false;
  }

  const first = state.duel.roundResults[0];
  const second = state.duel.roundResults[1];
  if (first !== second) {
    const winner = first ? "Player 1" : "Player 2";
    const player1Goals = player1.score;
    const player2Goals = player2.score;
    endMatch(
      "Sudden Death Result",
      `${winner} wins the duel`,
      `Final score: Player 1 ${player1Goals} - ${player2Goals} Player 2. One player scored while the other missed in sudden death.`,
      Math.max(player1Goals, player2Goals)
    );
    return true;
  }

  state.duel.roundShots = 0;
  state.duel.roundResults = [];
  setMessage("Still Level", 1, false);
  updateHud();
  return false;
}

function evaluateMatchEnd() {
  if (state.mode === "single") {
    if (state.single.shotsLeft <= 0) {
      endMatch(
        "Full Time",
        `You scored ${state.single.score} goal${state.single.score === 1 ? "" : "s"}`,
        "Try another round, change the difficulty, or jump into tournament mode for a bigger challenge.",
        state.single.score
      );
    }
    return;
  }

  if (state.mode === "tournament") {
    const stage = tournamentStages[state.tournament.stageIndex];
    if (state.tournament.shotsLeft <= 0) {
      if (state.tournament.score >= stage.target) {
        if (state.tournament.stageIndex === tournamentStages.length - 1) {
          endMatch(
            "Champions",
            `You won the tournament with ${state.tournament.score} goals in the final`,
            "You cleared every round. Restart to defend the crown on a tougher difficulty.",
            state.tournament.score
          );
        } else {
          state.tournament.stageIndex += 1;
          state.tournament.score = 0;
          state.tournament.shotsLeft = 5;
          state.awaitingTournamentContinue = true;
          resetAim();
          const nextStage = tournamentStages[state.tournament.stageIndex];
          state.running = false;
          showOverlay(
            "Stage Cleared",
            `${stage.label} complete`,
            `Next up: ${nextStage.label}. You need ${nextStage.target} goals from five shots.`
          );
          setPrimaryButtonLabel("Continue");
          updateHud();
        }
      } else {
        endMatch(
          "Eliminated",
          `You needed ${stage.target} goals and scored ${state.tournament.score}`,
          "Restart the tournament and take another run at the bracket.",
          state.tournament.score
        );
      }
    }
    return;
  }

  endDuelIfNeeded();
}

function queueNextTurn() {
  if (state.mode === "duel") {
    state.duel.activePlayer = state.duel.activePlayer === 0 ? 1 : 0;
  }

  updateHud();
  evaluateMatchEnd();

  if (state.running) {
    resetAim();
  }
}

function finishShot(saved) {
  if (state.mode === "single") {
    state.single.shotsLeft -= 1;
    if (!saved) {
      state.single.score += 1;
    }
    saveBestScore(state.single.score);
  } else if (state.mode === "tournament") {
    state.tournament.shotsLeft -= 1;
    if (!saved) {
      state.tournament.score += 1;
    }
    saveBestScore(state.tournament.score);
  } else {
    const player = state.duel.players[state.duel.activePlayer];
    if (!state.duel.suddenDeath) {
      player.shotsLeft -= 1;
    }
    if (!saved) {
      player.score += 1;
    }
    if (state.duel.suddenDeath) {
      state.duel.roundShots += 1;
      state.duel.roundResults.push(!saved);
    }
    saveBestScore(player.score);
  }

  if (saved) {
    setMessage("Saved!", 1.1, false);
    playSaveSound();
  } else {
    setMessage("GOAL!", 1.25, true);
    playGoalSound();
  }

  updateHud();
  state.pendingReset = true;
}

function resolveShot() {
  if (!state.shot || state.shot.progress < 1) {
    return;
  }

  const config = getDifficultyConfig();
  const keeperTop = state.keeper.baseY - 16;
  const keeperBottom = state.keeper.baseY + state.keeper.height + 26;
  const keeperLeft = state.keeper.x - config.saveWidth / 2;
  const keeperRight = state.keeper.x + config.saveWidth / 2;
  const targetX = state.shot.targetX;
  const targetY = state.shot.targetY;
  const saved = targetX > keeperLeft && targetX < keeperRight && targetY > keeperTop && targetY < keeperBottom;

  state.shot = null;
  finishShot(saved);
}

function takeShot() {
  if (!state.running || state.shot || state.pendingReset) {
    return;
  }

  const power = state.power;
  const targetX = canvas.width / 2 + state.aimX * 300;
  const baseY = 255 - state.aimY * 145;
  const powerLift = (power - 0.5) * 110;
  const targetY = Math.max(110, Math.min(290, baseY - powerLift));

  state.shot = {
    progress: 0,
    startX: canvas.width / 2,
    startY: 505,
    targetX,
    targetY,
    curve: state.aimX * 28,
    power
  };

  playKickSound();
}

function updateAimFromPointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  state.aimX = Math.max(-1, Math.min(1, (x - 0.5) * 2));
  state.aimY = Math.max(0, Math.min(1, 1 - y));
  updateHud();
}

function update(delta) {
  state.crowdPulse += delta * 5;

  if (!state.running) {
    return;
  }

  state.power += state.powerDirection * delta * 0.9;
  if (state.power > 1) {
    state.power = 1;
    state.powerDirection = -1;
  }
  if (state.power < 0.15) {
    state.power = 0.15;
    state.powerDirection = 1;
  }

  const config = getDifficultyConfig();
  state.keeper.x += config.keeperSpeed * state.keeper.direction * delta;
  if (state.keeper.x > canvas.width / 2 + 220) {
    state.keeper.x = canvas.width / 2 + 220;
    state.keeper.direction = -1;
  }
  if (state.keeper.x < canvas.width / 2 - 220) {
    state.keeper.x = canvas.width / 2 - 220;
    state.keeper.direction = 1;
  }

  if (state.shot) {
    state.shot.progress = Math.min(1, state.shot.progress + delta * (1.35 + state.shot.power));
    if (state.shot.progress >= 1) {
      resolveShot();
    }
  } else if (state.pendingReset && state.messageTimer <= 0.18) {
    queueNextTurn();
  }

  state.messageTimer = Math.max(0, state.messageTimer - delta);
  state.celebrationTimer = Math.max(0, state.celebrationTimer - delta);
  updateHud();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, 280);
  sky.addColorStop(0, "#7ad7ff");
  sky.addColorStop(1, "#dff6ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, 280);

  const grass = ctx.createLinearGradient(0, 280, 0, canvas.height);
  grass.addColorStop(0, "#3ab65a");
  grass.addColorStop(1, "#167039");
  ctx.fillStyle = grass;
  ctx.fillRect(0, 280, canvas.width, canvas.height - 280);

  for (let i = 0; i < 7; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
    ctx.fillRect(0, 280 + i * 46, canvas.width, 46);
  }
}

function drawCrowd() {
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 24; i += 1) {
      const x = 26 + i * 39 + (row % 2) * 8;
      const bob = Math.sin(state.crowdPulse + i * 0.45 + row) * 4;
      const y = 28 + row * 24 + bob;
      ctx.fillStyle = i % 4 === 0 ? "#173047" : i % 4 === 1 ? "#f4c95d" : i % 4 === 2 ? "#ff715b" : "#73e2ac";
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPitchLines() {
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 6;
  ctx.strokeRect(180, 110, 600, 200);
  ctx.strokeRect(310, 110, 340, 100);
  ctx.strokeRect(405, 310, 150, 80);
  ctx.beginPath();
  ctx.arc(canvas.width / 2, 390, 94, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(canvas.width / 2, 390, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = "rgba(240, 248, 255, 0.6)";
  ctx.fillRect(165, 95, 630, 22);
}

function drawNet() {
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.lineWidth = 2;
  for (let x = 195; x <= 765; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 112);
    ctx.lineTo(x, 250);
    ctx.stroke();
  }
  for (let y = 130; y <= 250; y += 18) {
    ctx.beginPath();
    ctx.moveTo(195, y);
    ctx.lineTo(765, y);
    ctx.stroke();
  }
}

function drawKeeper() {
  const config = getDifficultyConfig();
  const x = state.keeper.x;
  const y = state.keeper.baseY;
  const dive = state.shot ? (state.shot.targetX - x) * 0.03 : 0;

  ctx.fillStyle = "#ff715b";
  ctx.fillRect(x - 26 + dive, y - 8, 52, 66);
  ctx.fillRect(x - config.saveWidth / 2 + dive, y + 4, config.saveWidth, 14);

  ctx.fillStyle = "#ffe1cf";
  ctx.beginPath();
  ctx.arc(x + dive, y - 24, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff715b";
  ctx.fillRect(x - 18 + dive, y + 56, 12, 36);
  ctx.fillRect(x + 6 + dive, y + 56, 12, 36);
}

function drawShooter() {
  const x = canvas.width / 2;
  const y = 530;
  const activePlayer = state.mode === "duel" ? state.duel.players[state.duel.activePlayer].name : "Striker";

  ctx.fillStyle = "#0f2740";
  ctx.beginPath();
  ctx.arc(x, y - 42, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = activePlayer === "Player 2" ? "#73e2ac" : "#f4c95d";
  ctx.fillRect(x - 18, y - 26, 36, 54);
  ctx.fillRect(x - 16, y + 28, 10, 34);
  ctx.fillRect(x + 6, y + 28, 10, 34);
}

function drawAimGuide() {
  if (!state.running || state.shot || state.pendingReset) {
    return;
  }

  const targetX = canvas.width / 2 + state.aimX * 300;
  const targetY = Math.max(110, Math.min(290, 255 - state.aimY * 145 - (state.power - 0.5) * 110));
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = "rgba(255,255,255,0.56)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 505);
  ctx.quadraticCurveTo(canvas.width / 2 + state.aimX * 180, 340, targetX, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = state.aimY > 0.65 ? "#73e2ac" : state.aimY < 0.25 ? "#ff715b" : "#f4c95d";
  ctx.beginPath();
  ctx.arc(targetX, targetY, 11, 0, Math.PI * 2);
  ctx.fill();
}

function drawBall() {
  let x = canvas.width / 2;
  let y = 505;
  let radius = 14;

  if (state.shot) {
    const t = state.shot.progress;
    x = state.shot.startX + (state.shot.targetX - state.shot.startX) * t + Math.sin(t * Math.PI) * state.shot.curve;
    y = state.shot.startY + (state.shot.targetY - state.shot.startY) * t - Math.sin(t * Math.PI) * state.shot.power * 70;
    radius = 14 - t * 6;
  }

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#183446";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(5, radius - 4), 0, Math.PI * 2);
  ctx.stroke();
}

function drawScoreRibbon() {
  ctx.fillStyle = "rgba(8, 23, 34, 0.68)";
  ctx.fillRect(20, 18, 260, 72);
  ctx.font = "700 18px Manrope";
  ctx.fillStyle = "#f5fff9";
  if (state.mode === "duel") {
    const p1 = state.duel.players[0];
    const p2 = state.duel.players[1];
    ctx.fillText(`P1 ${p1.score} - ${p2.score} P2`, 36, 48);
    ctx.fillStyle = "#b6d7c5";
    ctx.fillText(state.duel.suddenDeath ? "Sudden death live" : `${state.duel.players[state.duel.activePlayer].name} shooting`, 36, 74);
  } else if (state.mode === "tournament") {
    const stage = tournamentStages[state.tournament.stageIndex];
    ctx.fillText(stage.label, 36, 50);
    ctx.fillStyle = "#b6d7c5";
    ctx.fillText(`Need ${stage.target} goals`, 36, 76);
  } else {
    ctx.fillText("Single Match", 36, 50);
    ctx.fillStyle = "#b6d7c5";
    ctx.fillText("Five shots to score big", 36, 76);
  }
}

function drawMessage() {
  if (state.messageTimer <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = Math.min(1, state.messageTimer + 0.15);
  ctx.fillStyle = state.message === "GOAL!" ? "#f4c95d" : "#ffffff";
  ctx.font = "400 56px Anton";
  ctx.textAlign = "center";
  ctx.fillText(state.message, canvas.width / 2, 92);
  ctx.restore();
}

function drawCelebration() {
  if (state.celebrationTimer <= 0) {
    return;
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18 + state.celebrationTimer;
    const distance = 90 + Math.sin(state.celebrationTimer * 8 + i) * 18;
    const x = canvas.width / 2 + Math.cos(angle) * distance;
    const y = 120 + Math.sin(angle) * distance;
    ctx.fillStyle = i % 2 === 0 ? "#f4c95d" : "#73e2ac";
    ctx.fillRect(x, y, 8, 8);
  }
}

function draw() {
  drawBackground();
  drawCrowd();
  drawPitchLines();
  drawNet();
  drawKeeper();
  drawAimGuide();
  drawShooter();
  drawBall();
  drawScoreRibbon();
  drawCelebration();
  drawMessage();
}

function frame(timestamp) {
  const delta = Math.min(0.032, (timestamp - state.lastTime) / 1000 || 0);
  state.lastTime = timestamp;
  update(delta);
  draw();
  requestAnimationFrame(frame);
}

function nudgeAimX(amount) {
  state.aimX = Math.max(-1, Math.min(1, state.aimX + amount));
}

function nudgeAimY(amount) {
  state.aimY = Math.max(0, Math.min(1, state.aimY + amount));
}

function handleKeyDown(event) {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "A", "d", "D", "w", "W", "s", "S", " ", "r", "R"].includes(event.key)) {
    event.preventDefault();
  }

  if (event.repeat) {
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
    nudgeAimX(-0.12);
  }
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
    nudgeAimX(0.12);
  }
  if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
    nudgeAimY(0.08);
  }
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
    nudgeAimY(-0.08);
  }
  if (event.key === " ") {
    if (!state.running) {
      if (state.awaitingTournamentContinue) {
        continueTournament();
      } else {
        startMatch();
      }
    } else {
      takeShot();
    }
  }
  if (event.key === "r" || event.key === "R") {
    startMatch();
  }
}

canvas.addEventListener("pointerdown", (event) => {
  updateAimFromPointer(event.clientX, event.clientY);
});

canvas.addEventListener("pointermove", (event) => {
  if (event.buttons === 1) {
    updateAimFromPointer(event.clientX, event.clientY);
  }
});

mobileButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "left") nudgeAimX(-0.14);
    if (action === "right") nudgeAimX(0.14);
    if (action === "up") nudgeAimY(0.1);
    if (action === "down") nudgeAimY(-0.1);
    if (action === "shoot") {
      if (!state.running) {
        if (state.awaitingTournamentContinue) {
          continueTournament();
        } else {
          startMatch();
        }
      } else {
        takeShot();
      }
    }
    if (action === "restart") {
      startMatch();
    }
  });
});

muteButtonEl.addEventListener("click", () => {
  audioState.muted = !audioState.muted;
  muteButtonEl.textContent = audioState.muted ? "Unmute Sound" : "Mute Sound";
});

startButtonEl.addEventListener("click", () => {
  if (!state.running) {
    if (state.awaitingTournamentContinue) {
      continueTournament();
    } else {
      startMatch();
    }
  } else {
    takeShot();
  }
});

modeSelectEl.addEventListener("change", () => {
  state.mode = modeSelectEl.value;
  updateHud();
});

difficultySelectEl.addEventListener("change", () => {
  state.difficulty = difficultySelectEl.value;
});

window.addEventListener("keydown", handleKeyDown);
setPrimaryButtonLabel("Start Match");
muteButtonEl.textContent = "Mute Sound";
showOverlay(
  "Kickoff",
  "Rule the shootout",
  "Choose a mode, then use your aim and timing to beat the keeper. Tournament mode adds target scores across three rounds."
);
updateHud();
draw();
requestAnimationFrame(frame);
