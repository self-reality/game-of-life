const canvas = document.getElementById("lifeCanvas");
const ctx = canvas.getContext("2d");
const glowCanvas = document.createElement("canvas");
const glowCtx = glowCanvas.getContext("2d");

const statusDensity = document.getElementById("statusDensity");
const statusSounds = document.getElementById("statusSounds");
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
  injections: 1,
  injectionPeriod: 80,
  initialAliveProbability: 0.25,
  wrapHorizontal: true,
  sound: {
    regionCount: 4,
    numOctaves: 4,
    centerOctave: 0,
    noteStartRandomMs: 6,
    // Filled in from the cycle length once SoundMapping is up; one entry per
    // voice region, bass band first.
    regions: [],
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

// Pitch ruler drawn in a gutter to the left of the field, outside the board.
const rulerConfig = {
  width: 64,
  textColor: "#8a8a8a",
  outOfRangeColor: "#c2544a",
  fontSize: 10,
  bandWidth: 7,
  bandColors: ["#3d3d3d", "#161616"],
  bandEdgeColor: "#5c5c5c",
};

const soundState = {
  enabled: false,
  pending: false,
  drift: null,
};

// Browsers keep the audio context suspended until a real user gesture, so the
// first one anywhere on the page turns the sound on.
const soundGestures = ["pointerdown", "keydown", "touchstart"];
const soundHint = document.getElementById("soundHint");

// One simulation cycle in milliseconds: the unit every envelope default is
// expressed in, so the sound stays readable when the speed changes.
function getCyclePeriodMs() {
  return 1000 / Math.max(1, settings.speed);
}

function canUseSound() {
  return (
    typeof SoundMapping !== "undefined" &&
    typeof DriftEmulator === "function" &&
    typeof Tone !== "undefined"
  );
}

function initSoundEngine() {
  if (!canUseSound() || soundState.drift) return;
  soundState.drift = new DriftEmulator(settings.sound.regions);
}

function setSoundHint(text, isOn) {
  if (!soundHint) return;
  soundHint.textContent = text;
  soundHint.classList.toggle("is-on", Boolean(isOn));
  soundHint.hidden = false;
}

function listenForSoundGesture(listening) {
  soundGestures.forEach((type) => {
    if (listening) {
      document.addEventListener(type, enableSound);
    } else {
      document.removeEventListener(type, enableSound);
    }
  });
}

function enableSound() {
  if (soundState.enabled || soundState.pending) return;
  initSoundEngine();
  // Tone may still be missing; keep listening so the next gesture gets another
  // chance rather than spending the only one on a failed start.
  if (!soundState.drift || typeof Tone === "undefined") return;
  soundState.pending = true;
  Tone.start().then(
    () => {
      soundState.enabled = true;
      soundState.pending = false;
      listenForSoundGesture(false);
      setSoundHint("Sound on", true);
      setTimeout(() => {
        if (soundHint) soundHint.hidden = true;
      }, 1500);
    },
    () => {
      soundState.pending = false;
    }
  );
}

// Plays this cycle's notes and returns how many were started together.
function emitSoundForCycle() {
  if (!soundState.enabled || !soundState.drift || !canUseSound()) return 0;
  const cyclePeriodMs = getCyclePeriodMs();
  const events = SoundMapping.getNoteEventsForCycle({
    cells,
    ages,
    cols: settings.cols,
    rows: settings.rows,
    soundSettings: settings.sound,
    cyclePeriodMs,
    rng: Math.random,
  });
  // The gate lasts one cycle; the region's release is what rings on past it.
  const noteDuration = Math.max(0.02, cyclePeriodMs / 1000);
  events.forEach((event) => {
    soundState.drift.playNote(
      event.regionIndex,
      event.note,
      noteDuration,
      event.startMs
    );
  });
  return events.length;
}

// Every control starts from the value the app is actually using, so the panel
// never shows a stale number from index.html; the value attributes there are
// only a fallback for when the script fails to load.
function bindPair(rangeId, numberId, initial, onChange) {
  const range = document.getElementById(rangeId);
  const number = document.getElementById(numberId);
  range.value = initial;
  number.value = initial;

  const apply = (value) => {
    range.value = value;
    number.value = value;
    onChange(Number(value));
    needsRender = true;
  };

  range.addEventListener("input", () => apply(range.value));
  number.addEventListener("input", () => apply(number.value));
}

function bindColor(id, initial, onChange) {
  const input = document.getElementById(id);
  input.value = initial;
  input.addEventListener("input", () => {
    onChange(input.value);
    needsRender = true;
  });
}

function bindSelect(id, initial, onChange) {
  const select = document.getElementById(id);
  select.value = initial;
  select.addEventListener("change", () => {
    onChange(select.value);
    needsRender = true;
  });
}

// Each voice region gets its own row of controls. Waveform sits in the card
// header; the rest is a compact grid of numbers, since eight sliders per region
// would not fit the panel.
const REGION_FIELDS = [
  { key: "attackMs", label: "A ms", min: 0, max: 2000, step: 1 },
  { key: "decayMs", label: "D ms", min: 0, max: 4000, step: 1 },
  { key: "sustain", label: "S", min: 0, max: 1, step: 0.01 },
  { key: "releaseMs", label: "R ms", min: 0, max: 4000, step: 1 },
  { key: "delayMs", label: "Delay", min: 0, max: 2000, step: 1 },
  { key: "volumeDb", label: "Vol dB", min: -60, max: 6, step: 0.5 },
  { key: "maxVoices", label: "Voices", min: 1, max: 24, step: 1 },
];

const regionList = document.getElementById("soundRegions");

// Re-reads the region cards into settings and hands them to the synth bank.
function applyRegionSettings() {
  if (typeof SoundMapping === "undefined") return;
  settings.sound.regions = SoundMapping.getRegionConfigs(
    settings.sound,
    getCyclePeriodMs()
  );
  if (soundState.drift) soundState.drift.setRegions(settings.sound.regions);
}

function updateRegionRanges() {
  if (!regionList || typeof SoundMapping === "undefined") return;
  regionList.querySelectorAll(".region-range").forEach((node, index) => {
    const range = SoundMapping.getRegionMidiRange(
      index,
      settings.rows,
      settings.sound
    );
    // An arrow, not a dash: octave numbers here can be negative.
    node.textContent = range
      ? `${SoundMapping.midiToNoteName(range.minMidi)} \u2192 ${SoundMapping.midiToNoteName(
          range.maxMidi
        )}`
      : "";
  });
}

function createRegionField(index, field) {
  const label = document.createElement("label");
  label.className = "region-field";
  label.append(field.label);

  const input = document.createElement("input");
  input.type = "number";
  input.min = field.min;
  input.max = field.max;
  input.step = field.step;
  input.value = settings.sound.regions[index][field.key];
  input.addEventListener("input", () => {
    const value = Number(input.value);
    if (input.value === "" || !Number.isFinite(value)) return;
    settings.sound.regions[index][field.key] = value;
    applyRegionSettings();
  });

  label.appendChild(input);
  return label;
}

function createRegionCard(index) {
  const card = document.createElement("div");
  card.className = "region-card";

  const head = document.createElement("div");
  head.className = "region-head";

  const tag = document.createElement("span");
  tag.className = "region-tag";
  tag.textContent = `R${index + 1}`;

  const range = document.createElement("span");
  range.className = "region-range";

  const wave = document.createElement("select");
  SoundMapping.WAVEFORMS.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    wave.appendChild(option);
  });
  wave.value = settings.sound.regions[index].waveform;
  wave.addEventListener("change", () => {
    settings.sound.regions[index].waveform = wave.value;
    applyRegionSettings();
  });

  head.append(tag, range, wave);

  const grid = document.createElement("div");
  grid.className = "region-grid";
  REGION_FIELDS.forEach((field) => grid.appendChild(createRegionField(index, field)));

  card.append(head, grid);
  return card;
}

function renderRegionControls() {
  if (!regionList || typeof SoundMapping === "undefined") return;
  regionList.textContent = "";
  settings.sound.regions.forEach((_, index) => {
    regionList.appendChild(createRegionCard(index));
  });
  updateRegionRanges();
}

// Puts every region back on defaults derived from the current cycle length.
function resetRegionsToCycle() {
  if (typeof SoundMapping === "undefined") return;
  settings.sound.regions = SoundMapping.createRegions(
    settings.sound.regionCount,
    getCyclePeriodMs()
  );
  applyRegionSettings();
  renderRegionControls();
}

function getFieldOrigin() {
  return {
    offsetX: rulerConfig.width + settings.margin,
    offsetY: settings.margin,
  };
}

function resizeCanvases() {
  const fieldWidth = settings.cols * settings.cellSize;
  const fieldHeight = settings.rows * settings.cellSize;
  const width = fieldWidth + settings.margin * 2 + rulerConfig.width;
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
  const soundsPlayed = emitSoundForCycle();
  updateStatus(density, soundsPlayed);
  needsRender = true;
}

function drawBackground() {
  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  const fieldWidth = settings.cols * settings.cellSize;
  const fieldHeight = settings.rows * settings.cellSize;
  const { offsetX, offsetY } = getFieldOrigin();

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
  const { offsetX, offsetY } = getFieldOrigin();

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

  const { offsetX, offsetY } = getFieldOrigin();
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

// Each voice region owns its own synth and voice budget, so the strip between
// the axis and the field shows where one band ends and the next begins.
function drawRegionBands(left, top) {
  const bounds = SoundMapping.getRegionBounds(
    settings.rows,
    SoundMapping.getRegionCount(settings.sound)
  );

  ctx.save();
  bounds.forEach(({ index, startRow, endRow }) => {
    const y = top + startRow * settings.cellSize;
    const height = (endRow - startRow) * settings.cellSize;
    ctx.fillStyle = rulerConfig.bandColors[index % rulerConfig.bandColors.length];
    ctx.fillRect(left, y, rulerConfig.bandWidth, height);
    if (startRow > 0) {
      ctx.fillStyle = rulerConfig.bandEdgeColor;
      ctx.fillRect(left, y, rulerConfig.bandWidth, 1);
    }
  });
  ctx.restore();
}

function drawPitchRuler() {
  if (typeof SoundMapping === "undefined" || !SoundMapping.getPitchMarkers) return;

  const { offsetX, offsetY } = getFieldOrigin();
  const fieldHeight = settings.rows * settings.cellSize;
  const bandLeft = offsetX - 4 - rulerConfig.bandWidth;
  const axisX = Math.round(bandLeft - 6) + 0.5;
  const tickStart = axisX - 10;
  const labelRight = tickStart - 4;
  // Pitch is sampled at row centres, so the scale spans the first to the last one.
  const span = Math.max(0, settings.rows - 1) * settings.cellSize;
  const rowY = (t) => Math.round(offsetY + settings.cellSize / 2 + t * span) + 0.5;

  drawRegionBands(bandLeft, offsetY);

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = settings.gridColor;
  ctx.beginPath();
  ctx.moveTo(axisX, offsetY);
  ctx.lineTo(axisX, offsetY + fieldHeight);
  ctx.stroke();

  const semitones = SoundMapping.getPitchMarkers(settings.sound, 1);
  if (semitones.length > 1 && span / (semitones.length - 1) >= 4) {
    ctx.beginPath();
    semitones.forEach((marker) => {
      const py = rowY(marker.t);
      ctx.moveTo(axisX - 4, py);
      ctx.lineTo(axisX, py);
    });
    ctx.stroke();
  }

  ctx.font = `${rulerConfig.fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const octaves = SoundMapping.getPitchMarkers(settings.sound, 12);
  const spacing =
    octaves.length > 1 ? Math.abs(rowY(octaves[1].t) - rowY(octaves[0].t)) : span;
  const labelStep = Math.max(
    1,
    Math.ceil((rulerConfig.fontSize + 3) / Math.max(1, spacing))
  );

  octaves.forEach((marker, index) => {
    const py = rowY(marker.t);
    const color = marker.audible ? rulerConfig.textColor : rulerConfig.outOfRangeColor;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(tickStart, py);
    ctx.lineTo(axisX, py);
    ctx.stroke();
    if (index % labelStep === 0) {
      ctx.fillStyle = color;
      ctx.fillText(marker.note, labelRight, py);
    }
  });

  // Label the ends of the span when they do not land on an octave line.
  const range = SoundMapping.getPitchRange(settings.sound);
  [
    { midi: range.minMidi, t: 0 },
    { midi: range.maxMidi, t: 1 },
  ].forEach(({ midi, t }) => {
    if (midi % 12 === 0) return;
    ctx.fillStyle = SoundMapping.isAudibleMidi(midi)
      ? rulerConfig.textColor
      : rulerConfig.outOfRangeColor;
    ctx.fillText(SoundMapping.midiToNoteName(midi), labelRight, rowY(t));
  });

  ctx.restore();
}

// Clicking the field drops in a ship: random type, random direction.
function getCellFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const { offsetX, offsetY } = getFieldOrigin();
  const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
  const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);
  const x = Math.floor((canvasX - offsetX) / settings.cellSize);
  const y = Math.floor((canvasY - offsetY) / settings.cellSize);
  if (x < 0 || x >= settings.cols || y < 0 || y >= settings.rows) return null;
  return { x, y };
}

function handleFieldPointerDown(event) {
  const cell = getCellFromPointer(event);
  if (!cell) return;
  const spawned = SimulationCore.spawnShipAt(
    simulation,
    settings,
    cell.x,
    cell.y,
    Math.random
  );
  if (!spawned) return;
  syncSimulationBuffers();
  needsRender = true;
}

function updateStatus(density, soundsPlayed) {
  statusDensity.textContent = density.toFixed(3);
  statusSounds.textContent = String(soundsPlayed);
}

function render() {
  drawBackground();
  drawGrid();
  drawCells();
  drawGlowOverlay();
  drawPitchRuler();
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
  canvas.addEventListener("pointerdown", handleFieldPointerDown);
  const resetRegions = document.getElementById("soundResetRegions");
  if (resetRegions) resetRegions.addEventListener("click", resetRegionsToCycle);
  bindPair("colsRange", "colsNumber", settings.cols, (value) => {
    settings.cols = Math.max(10, value);
    applySettings();
  });
  bindPair("rowsRange", "rowsNumber", settings.rows, (value) => {
    settings.rows = Math.max(10, value);
    applySettings();
    updateRegionRanges();
  });
  bindSelect("horizontalEdges", settings.wrapHorizontal ? "wrap" : "wall", (value) => {
    settings.wrapHorizontal = value === "wrap";
  });
  bindPair("cellSizeRange", "cellSizeNumber", settings.cellSize, (value) => {
    settings.cellSize = Math.max(1, value);
    applySettings();
  });
  bindPair("speedRange", "speedNumber", settings.speed, (value) => {
    settings.speed = Math.max(1, value);
  });
  bindPair("marginRange", "marginNumber", settings.margin, (value) => {
    settings.margin = Math.max(0, value);
    applySettings();
  });
  bindPair("gridThicknessRange", "gridThicknessNumber", settings.gridThickness, (value) => {
    settings.gridThickness = Math.max(0.5, value);
  });
  bindPair("glowBlurRange", "glowBlurNumber", glowConfig.blur, (value) => {
    glowConfig.blur = Math.max(0, value);
  });
  bindPair("glowAlphaRange", "glowAlphaNumber", glowConfig.alpha, (value) => {
    glowConfig.alpha = Math.max(0, Math.min(1, value));
  });
  bindSelect("glowBlendMode", glowConfig.blendMode, (value) => {
    glowConfig.blendMode = value;
  });
  bindPair("injectionsRange", "injectionsNumber", settings.injections, (value) => {
    settings.injections = Math.max(1, value);
  });
  bindPair("injectionPeriodRange", "injectionPeriodNumber", settings.injectionPeriod, (value) => {
    settings.injectionPeriod = Math.max(1, value);
  });
  bindPair("soundRegionCountRange", "soundRegionCountNumber", settings.sound.regionCount, (value) => {
    settings.sound.regionCount = Math.max(
      1,
      Math.min(SoundMapping.MAX_REGIONS, Math.round(value))
    );
    applyRegionSettings();
    renderRegionControls();
  });
  bindPair("soundOctavesRange", "soundOctavesNumber", settings.sound.numOctaves, (value) => {
    settings.sound.numOctaves = Math.max(1, value);
    updateRegionRanges();
  });
  bindPair("soundCenterOctaveRange", "soundCenterOctaveNumber", settings.sound.centerOctave, (value) => {
    settings.sound.centerOctave = Math.round(value);
    updateRegionRanges();
  });
  bindPair("soundStartRandomRange", "soundStartRandomNumber", settings.sound.noteStartRandomMs, (value) => {
    settings.sound.noteStartRandomMs = Math.max(0, value);
  });
  bindColor("bgColor", settings.bgColor, (value) => {
    settings.bgColor = value;
  });
  bindColor("gridColor", settings.gridColor, (value) => {
    settings.gridColor = value;
  });
  bindColor("alive1Color", settings.alive1Color, (value) => {
    settings.alive1Color = value;
  });
  bindColor("alive2Color", settings.alive2Color, (value) => {
    settings.alive2Color = value;
  });
  bindColor("alive10Color", settings.alive10Color, (value) => {
    settings.alive10Color = value;
  });
}

function start() {
  resetRegionsToCycle();
  bindControls();
  applySettings();
  if (canUseSound()) {
    listenForSoundGesture(true);
    setSoundHint("Click anywhere to start sound", false);
  } else {
    setSoundHint("Sound unavailable: Tone.js failed to load", false);
  }
  requestAnimationFrame(tick);
}

start();
