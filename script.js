const canvas = document.getElementById("lifeCanvas");
const ctx = canvas.getContext("2d");
const glowCanvas = document.createElement("canvas");
const glowCtx = glowCanvas.getContext("2d");

const statusDensity = document.getElementById("statusDensity");
const settings = {
  cols: 248,
  rows: 136,
  cellSize: 5,
  speed: 18,
  margin: 20,
  gridThickness: 1,
  bgColor: "#000000",
  gridColor: "#2b2b2b",
  alive1Color: "#ff3b3b",
  alive2Color: "#16c172",
  alive10Color: "#2f7cff",
  injections: 2,
  injectionPeriod: 80,
  initialAliveProbability: 0.25,
  wrapHorizontal: true,
  sound: {
    maxVoicesPerRegion: 4,
    regionWidth: 24,
    numOctaves: 4,
    centerOctave: 0,
    noteStartRandomMs: 6,
  },
};

let simulation = SimulationCore.createSimulationState(settings, Math.random);
let cells = simulation.cells;
let ages = simulation.ages;

let lastTime = 0;
let accumulator = 0;
let cycleCount = 0;
let needsRender = true;

const glowConfig = {
  blur: 4,
  alpha: 1,
  blendMode: "lighten",
};

const soundState = {
  enabled: false,
  drift: null,
};

function canUseSound() {
  return (
    typeof SoundMapping !== "undefined" &&
    typeof DriftEmulator === "function" &&
    typeof Tone !== "undefined"
  );
}

function initSoundEngine() {
  if (!canUseSound() || soundState.drift) return;
  soundState.drift = new DriftEmulator();
}

function enableSound() {
  if (soundState.enabled) return;
  initSoundEngine();
  if (!soundState.drift || typeof Tone === "undefined") return;
  Tone.start().then(() => {
    soundState.enabled = true;
  });
}

function emitSoundForCycle() {
  if (!soundState.enabled || !soundState.drift || !canUseSound()) return;
  const events = SoundMapping.getNoteEventsForCycle({
    cells,
    ages,
    cols: settings.cols,
    rows: settings.rows,
    soundSettings: settings.sound,
    rng: Math.random,
  });
  if (!events.length) return;
  const noteDuration = Math.max(0.02, 1 / settings.speed);
  events.forEach((event) => {
    soundState.drift.playNote(
      event.note,
      noteDuration,
      event.attackMs,
      event.startMs
    );
  });
}

function bindPair(rangeId, numberId, onChange) {
  const range = document.getElementById(rangeId);
  const number = document.getElementById(numberId);

  const apply = (value) => {
    range.value = value;
    number.value = value;
    onChange(Number(value));
    needsRender = true;
  };

  range.addEventListener("input", () => apply(range.value));
  number.addEventListener("input", () => apply(number.value));
}

function bindColor(id, onChange) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    onChange(input.value);
    needsRender = true;
  });
}

function bindSelect(id, onChange) {
  const select = document.getElementById(id);
  select.addEventListener("change", () => {
    onChange(select.value);
    needsRender = true;
  });
}

function resizeCanvases() {
  const fieldWidth = settings.cols * settings.cellSize;
  const fieldHeight = settings.rows * settings.cellSize;
  const width = fieldWidth + settings.margin * 2;
  const height = fieldHeight + settings.margin * 2;
  canvas.width = width;
  canvas.height = height;
  glowCanvas.width = width;
  glowCanvas.height = height;
}

function resetGrid() {
  SimulationCore.resetSimulation(simulation, settings, Math.random);
  syncSimulationBuffers();
}

function syncSimulationBuffers() {
  cells = simulation.cells;
  ages = simulation.ages;
  cycleCount = simulation.cycleCount;
}

function stepSimulation() {
  const { density } = SimulationCore.stepSimulation(
    simulation,
    settings,
    Math.random
  );
  syncSimulationBuffers();
  updateStatus(density);
  emitSoundForCycle();
  needsRender = true;
}

function drawBackground() {
  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  const fieldWidth = settings.cols * settings.cellSize;
  const fieldHeight = settings.rows * settings.cellSize;
  const offsetX = settings.margin;
  const offsetY = settings.margin;

  ctx.strokeStyle = settings.gridColor;
  ctx.lineWidth = settings.gridThickness;
  ctx.beginPath();

  for (let x = 0; x <= settings.cols; x += 1) {
    const px = offsetX + x * settings.cellSize;
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + fieldHeight);
  }

  for (let y = 0; y <= settings.rows; y += 1) {
    const py = offsetY + y * settings.cellSize;
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + fieldWidth, py);
  }

  ctx.stroke();
}

function getCellColor(age) {
  if (age >= 10) {
    return settings.alive10Color;
  }
  if (age >= 2) {
    return settings.alive2Color;
  }
  return settings.alive1Color;
}

function drawCells() {
  const offsetX = settings.margin;
  const offsetY = settings.margin;

  for (let y = 0; y < settings.rows; y += 1) {
    const rowOffset = y * settings.cols;
    for (let x = 0; x < settings.cols; x += 1) {
      const idx = rowOffset + x;
      if (cells[idx] !== 1) continue;
      const age = ages[idx];
      ctx.fillStyle = getCellColor(age);
      ctx.fillRect(
        offsetX + x * settings.cellSize,
        offsetY + y * settings.cellSize,
        settings.cellSize,
        settings.cellSize
      );
    }
  }
}

function drawGlowOverlay() {
  glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
  glowCtx.globalCompositeOperation = "source-over";
  glowCtx.save();
  glowCtx.globalAlpha = 0.9;

  const offsetX = settings.margin;
  const offsetY = settings.margin;
  for (let y = 0; y < settings.rows; y += 1) {
    const rowOffset = y * settings.cols;
    for (let x = 0; x < settings.cols; x += 1) {
      const idx = rowOffset + x;
      if (cells[idx] !== 1) continue;
      const age = ages[idx];
      glowCtx.fillStyle = getCellColor(age);
      glowCtx.fillRect(
        offsetX + x * settings.cellSize,
        offsetY + y * settings.cellSize,
        settings.cellSize,
        settings.cellSize
      );
    }
  }
  glowCtx.restore();

  ctx.save();
  ctx.globalCompositeOperation = glowConfig.blendMode;
  ctx.globalAlpha = glowConfig.alpha;
  ctx.filter = `blur(${glowConfig.blur}px)`;
  ctx.drawImage(glowCanvas, 0, 0);
  ctx.restore();
}

function updateStatus(p) {
  statusDensity.textContent = p.toFixed(3);
}

function render() {
  drawBackground();
  drawGrid();
  drawCells();
  drawGlowOverlay();
}

function tick(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  accumulator += delta;

  const stepTime = 1 / settings.speed;
  while (accumulator >= stepTime) {
    stepSimulation();
    accumulator -= stepTime;
  }

  if (needsRender) {
    render();
    needsRender = false;
  }

  requestAnimationFrame(tick);
}

function applySettings() {
  resizeCanvases();
  resetGrid();
  needsRender = true;
}

function bindControls() {
  bindPair("colsRange", "colsNumber", (value) => {
    settings.cols = Math.max(10, value);
    applySettings();
  });
  bindPair("rowsRange", "rowsNumber", (value) => {
    settings.rows = Math.max(10, value);
    applySettings();
  });
  bindSelect("horizontalEdges", (value) => {
    settings.wrapHorizontal = value === "wrap";
  });
  bindPair("cellSizeRange", "cellSizeNumber", (value) => {
    settings.cellSize = Math.max(1, value);
    applySettings();
  });
  bindPair("speedRange", "speedNumber", (value) => {
    settings.speed = Math.max(1, value);
  });
  bindPair("marginRange", "marginNumber", (value) => {
    settings.margin = Math.max(0, value);
    applySettings();
  });
  bindPair("gridThicknessRange", "gridThicknessNumber", (value) => {
    settings.gridThickness = Math.max(0.5, value);
  });
  bindPair("glowBlurRange", "glowBlurNumber", (value) => {
    glowConfig.blur = Math.max(0, value);
  });
  bindPair("glowAlphaRange", "glowAlphaNumber", (value) => {
    glowConfig.alpha = Math.max(0, Math.min(1, value));
  });
  bindSelect("glowBlendMode", (value) => {
    glowConfig.blendMode = value;
  });
  bindPair("injectionsRange", "injectionsNumber", (value) => {
    settings.injections = Math.max(1, value);
  });
  bindPair("injectionPeriodRange", "injectionPeriodNumber", (value) => {
    settings.injectionPeriod = Math.max(1, value);
  });
  bindPair("soundMaxVoicesRange", "soundMaxVoicesNumber", (value) => {
    settings.sound.maxVoicesPerRegion = Math.max(1, value);
  });
  bindPair("soundRegionWidthRange", "soundRegionWidthNumber", (value) => {
    settings.sound.regionWidth = Math.max(1, value);
  });
  bindPair("soundOctavesRange", "soundOctavesNumber", (value) => {
    settings.sound.numOctaves = Math.max(1, value);
  });
  bindPair("soundCenterOctaveRange", "soundCenterOctaveNumber", (value) => {
    settings.sound.centerOctave = Math.round(value);
  });
  bindPair("soundStartRandomRange", "soundStartRandomNumber", (value) => {
    settings.sound.noteStartRandomMs = Math.max(0, value);
  });
  bindColor("bgColor", (value) => {
    settings.bgColor = value;
  });
  bindColor("gridColor", (value) => {
    settings.gridColor = value;
  });
  bindColor("alive1Color", (value) => {
    settings.alive1Color = value;
  });
  bindColor("alive2Color", (value) => {
    settings.alive2Color = value;
  });
  bindColor("alive10Color", (value) => {
    settings.alive10Color = value;
  });
}

function start() {
  bindControls();
  applySettings();
  canvas.addEventListener("pointerdown", enableSound, { once: true });
  document.addEventListener("keydown", enableSound, { once: true });
  requestAnimationFrame(tick);
}

start();
