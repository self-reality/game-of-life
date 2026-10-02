const canvas = document.getElementById("lifeCanvas");
const ctx = canvas.getContext("2d");
const glowCanvas = document.createElement("canvas");
const glowCtx = glowCanvas.getContext("2d");
const stage = canvas.parentElement;

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

// How the canvas is laid out right now. In the window it follows the settings;
// in full screen the field alone is stretched over the display, so the cell
// size there is whatever fits and is usually not a whole number of pixels.
const view = {
  fullscreen: false,
  cellSize: settings.cellSize,
  offsetX: 0,
  offsetY: 0,
  // Full-screen cell size relative to the one set in the panel; pixel-sized
  // settings (glow blur, grid thickness) scale by it to keep the tuned look.
  scale: 1,
  // Pixel position of every cell boundary, snapped to whole pixels so cells
  // stay crisp at a fractional cell size.
  xEdges: new Int32Array(0),
  yEdges: new Int32Array(0),
};

// A 4K or retina display is rendered at no more than this many canvas pixels
// per CSS pixel: the glow blur costs per pixel.
const FULLSCREEN_MAX_DPR = 2;
// How long the pointer rests in full screen before it and the buttons hide.
const STAGE_IDLE_MS = 2500;

// Monitor shapes. Every preset holds about as many cells as the default field:
// it changes the ratio, not how busy the screen gets.
const PRESET_CELL_BUDGET = 32400;
const RATIO_PRESETS = [
  { label: "16:9", cols: 240, rows: 135 },
  { label: "16:10", cols: 224, rows: 140 },
  { label: "21:9", cols: 280, rows: 118 },
  { label: "32:9", cols: 320, rows: 90 },
  { label: "4:3", cols: 208, rows: 156 },
];

const soundState = {
  enabled: false,
  pending: false,
  drift: null,
};

const soundButtons = document.querySelectorAll('[data-action="toggle-sound"]');

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

function updateSoundButtons() {
  const available = canUseSound();
  soundButtons.forEach((button) => {
    button.disabled = !available;
    button.title = available ? "" : "Tone.js failed to load";
    button.setAttribute("aria-pressed", String(soundState.enabled));
    if (!available) {
      button.textContent = "Sound unavailable";
    } else {
      button.textContent = soundState.enabled ? "Sound: on" : "Sound: off";
    }
  });
}

// Browsers keep the audio context suspended until a real user gesture; the
// click on the sound button is that gesture. Turning the sound off only stops
// new notes, so the ones already ringing fade out on their own release.
function toggleSound() {
  if (soundState.pending) return;
  if (soundState.enabled) {
    soundState.enabled = false;
    updateSoundButtons();
    return;
  }
  initSoundEngine();
  if (!soundState.drift || typeof Tone === "undefined") return;
  soundState.pending = true;
  Tone.start().then(
    () => {
      soundState.enabled = true;
      soundState.pending = false;
      updateSoundButtons();
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
  return apply;
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

function buildEdges(count, origin, size) {
  const edges = new Int32Array(count + 1);
  for (let i = 0; i <= count; i += 1) {
    edges[i] = Math.round(origin + i * size);
  }
  return edges;
}

function resizeCanvases() {
  let width;
  let height;
  if (view.fullscreen) {
    // No ruler and no margin: the field is fitted to the display and centred,
    // and a field of another ratio gets background-coloured bars.
    const dpr = Math.min(window.devicePixelRatio || 1, FULLSCREEN_MAX_DPR);
    const availableWidth = Math.max(1, stage.clientWidth * dpr);
    const availableHeight = Math.max(1, stage.clientHeight * dpr);
    view.cellSize = Math.min(
      availableWidth / settings.cols,
      availableHeight / settings.rows
    );
    view.offsetX = 0;
    view.offsetY = 0;
    width = Math.round(settings.cols * view.cellSize);
    height = Math.round(settings.rows * view.cellSize);
    canvas.style.width = `${width / dpr}px`;
    canvas.style.height = `${height / dpr}px`;
  } else {
    view.cellSize = settings.cellSize;
    view.offsetX = rulerConfig.width + settings.margin;
    view.offsetY = settings.margin;
    width = settings.cols * settings.cellSize + settings.margin * 2 + rulerConfig.width;
    height = settings.rows * settings.cellSize + settings.margin * 2;
    canvas.style.width = "";
    canvas.style.height = "";
  }
  view.scale = view.cellSize / settings.cellSize;
  view.xEdges = buildEdges(settings.cols, view.offsetX, view.cellSize);
  view.yEdges = buildEdges(settings.rows, view.offsetY, view.cellSize);
  canvas.width = width;
  canvas.height = height;
  glowCanvas.width = width;
  glowCanvas.height = height;
  needsRender = true;
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

let stageIdleTimer = 0;

// Shows the pointer and the full-screen buttons, then hides them again once
// the pointer has rested.
function wakeStage() {
  document.body.classList.remove("is-idle");
  clearTimeout(stageIdleTimer);
  if (!view.fullscreen) return;
  stageIdleTimer = setTimeout(() => {
    document.body.classList.add("is-idle");
  }, STAGE_IDLE_MS);
}

function setFullscreenView(on) {
  if (view.fullscreen === on) return;
  view.fullscreen = on;
  document.body.classList.toggle("is-fullscreen", on);
  resizeCanvases();
  wakeStage();
}

// The page lays the field out over the whole window by itself; the browser's
// full screen only takes the browser chrome away. So where there is no such
// API (Safari on an iPhone) or the request is refused, the field still fills
// the window.
function toggleFullscreen() {
  if (view.fullscreen) {
    setFullscreenView(false);
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (getFullscreenElement() && exit) exit.call(document);
    return;
  }
  setFullscreenView(true);
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;
  const result = request.call(root);
  if (result && typeof result.catch === "function") result.catch(() => {});
}

// Esc leaves the browser's full screen without going through the button.
function handleFullscreenChange() {
  if (!getFullscreenElement()) setFullscreenView(false);
}

function handleShortcut(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (
    target instanceof Element &&
    target.matches('input[type="number"], select, textarea')
  ) {
    return;
  }
  if (event.code === "KeyF") {
    toggleFullscreen();
  } else if (event.code === "KeyM") {
    toggleSound();
  } else if (event.code === "Escape" && view.fullscreen) {
    toggleFullscreen();
  }
}

function clampToInput(value, input) {
  return Math.max(Number(input.min), Math.min(Number(input.max), value));
}

// The field shape of the display the page is on, at the preset cell budget.
function getScreenGrid() {
  const colsInput = document.getElementById("colsRange");
  const rowsInput = document.getElementById("rowsRange");
  const ratio = window.screen.width / window.screen.height || 16 / 9;
  // Rows first, then again from the clamped width: a very wide or very tall
  // display runs into a slider limit, and the ratio matters more than the budget.
  const rows = clampToInput(Math.round(Math.sqrt(PRESET_CELL_BUDGET / ratio)), rowsInput);
  const cols = clampToInput(Math.round(rows * ratio), colsInput);
  return { cols, rows: clampToInput(Math.round(cols / ratio), rowsInput) };
}

const presetList = document.getElementById("ratioPresets");

function updatePresetButtons() {
  if (!presetList) return;
  presetList.querySelectorAll("button").forEach((button) => {
    const active =
      Number(button.dataset.cols) === settings.cols &&
      Number(button.dataset.rows) === settings.rows;
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderPresetButtons(applyPreset) {
  if (!presetList) return;
  const presets = [{ label: "This screen", ...getScreenGrid() }, ...RATIO_PRESETS];
  presets.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-button";
    button.textContent = preset.label;
    button.title = `${preset.cols} \u00d7 ${preset.rows} cells`;
    button.dataset.cols = preset.cols;
    button.dataset.rows = preset.rows;
    button.addEventListener("click", () => applyPreset(preset));
    presetList.appendChild(button);
  });
  updatePresetButtons();
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
  const { xEdges, yEdges } = view;
  const left = xEdges[0];
  const right = xEdges[settings.cols];
  const top = yEdges[0];
  const bottom = yEdges[settings.rows];

  ctx.strokeStyle = settings.gridColor;
  ctx.lineWidth = settings.gridThickness * view.scale;
  ctx.beginPath();

  for (let x = 0; x <= settings.cols; x += 1) {
    ctx.moveTo(xEdges[x], top);
    ctx.lineTo(xEdges[x], bottom);
  }

  for (let y = 0; y <= settings.rows; y += 1) {
    ctx.moveTo(left, yEdges[y]);
    ctx.lineTo(right, yEdges[y]);
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

function fillAliveCells(target) {
  const { xEdges, yEdges } = view;

  for (let y = 0; y < settings.rows; y += 1) {
    const rowOffset = y * settings.cols;
    for (let x = 0; x < settings.cols; x += 1) {
      const idx = rowOffset + x;
      if (cells[idx] !== 1) continue;
      target.fillStyle = getCellColor(ages[idx]);
      target.fillRect(
        xEdges[x],
        yEdges[y],
        xEdges[x + 1] - xEdges[x],
        yEdges[y + 1] - yEdges[y]
      );
    }
  }
}

function drawCells() {
  fillAliveCells(ctx);
}

function drawGlowOverlay() {
  glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
  glowCtx.globalCompositeOperation = "source-over";
  glowCtx.save();
  glowCtx.globalAlpha = 0.9;
  fillAliveCells(glowCtx);
  glowCtx.restore();

  ctx.save();
  ctx.globalCompositeOperation = glowConfig.blendMode;
  ctx.globalAlpha = glowConfig.alpha;
  ctx.filter = `blur(${glowConfig.blur * view.scale}px)`;
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

  const { offsetX, offsetY } = view;
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
  const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
  const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);
  const x = Math.floor((canvasX - view.offsetX) / view.cellSize);
  const y = Math.floor((canvasY - view.offsetY) / view.cellSize);
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
  // The ruler is a tuning aid; full screen shows the field alone.
  if (!view.fullscreen) drawPitchRuler();
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

// Full screen pads a field of another ratio with the field's own background.
function applyStageBackground() {
  stage.style.setProperty("--field-bg", settings.bgColor);
}

function applySettings() {
  resizeCanvases();
  resetGrid();
}

function bindControls() {
  canvas.addEventListener("pointerdown", handleFieldPointerDown);
  const resetRegions = document.getElementById("soundResetRegions");
  if (resetRegions) resetRegions.addEventListener("click", resetRegionsToCycle);
  soundButtons.forEach((button) => button.addEventListener("click", toggleSound));
  document.querySelectorAll('[data-action="toggle-fullscreen"]').forEach((button) => {
    button.addEventListener("click", toggleFullscreen);
  });
  ["fullscreenchange", "webkitfullscreenchange"].forEach((type) => {
    document.addEventListener(type, handleFullscreenChange);
  });
  ["pointermove", "pointerdown", "keydown"].forEach((type) => {
    document.addEventListener(type, wakeStage);
  });
  document.addEventListener("keydown", handleShortcut);
  // The display is only known to have settled once the stage has its new size.
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (view.fullscreen) resizeCanvases();
    }).observe(stage);
  }
  const setCols = bindPair("colsRange", "colsNumber", settings.cols, (value) => {
    settings.cols = Math.max(10, value);
    applySettings();
    updatePresetButtons();
  });
  const setRows = bindPair("rowsRange", "rowsNumber", settings.rows, (value) => {
    settings.rows = Math.max(10, value);
    applySettings();
    updateRegionRanges();
    updatePresetButtons();
  });
  renderPresetButtons((preset) => {
    setCols(preset.cols);
    setRows(preset.rows);
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
    applyStageBackground();
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
  applyStageBackground();
  updateSoundButtons();
  requestAnimationFrame(tick);
}

start();
