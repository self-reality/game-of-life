const canvas = document.getElementById("lifeCanvas");
const ctx = canvas.getContext("2d");
const glowCanvas = document.createElement("canvas");
const glowCtx = glowCanvas.getContext("2d");

const statusDensity = document.getElementById("statusDensity");
const statusEntropy = document.getElementById("statusEntropy");
const statusEntropySmooth = document.getElementById("statusEntropySmooth");
const statusEntropyStreak = document.getElementById("statusEntropyStreak");

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
  entropyMin: 0.59,
  entropyWindow: 106,
  entropyFrames: 63,
  injections: 1,
};

let cells = new Uint8Array(settings.cols * settings.rows);
let nextCells = new Uint8Array(settings.cols * settings.rows);
let ages = new Uint16Array(settings.cols * settings.rows);
let nextAges = new Uint16Array(settings.cols * settings.rows);

let entropyHistory = [];
let entropySmooth = 0;
let entropyStreak = 0;

let lastTime = 0;
let accumulator = 0;

const glowConfig = {
  blur: 3,
  alpha: 1,
  blendMode: "lighter",
};

const patterns = {
  glider: [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  lwss: [
    [1, 0],
    [4, 0],
    [0, 1],
    [0, 2],
    [4, 2],
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
  mwss: [
    [2, 0],
    [3, 0],
    [4, 0],
    [0, 1],
    [4, 1],
    [0, 2],
    [4, 2],
    [0, 3],
    [3, 3],
    [1, 4],
    [2, 4],
    [3, 4],
  ],
  hwss: [
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
    [0, 1],
    [5, 1],
    [0, 2],
    [5, 2],
    [0, 3],
    [4, 3],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
  ],
};

const directions = ["right", "left", "down", "up"];

function bindPair(rangeId, numberId, onChange) {
  const range = document.getElementById(rangeId);
  const number = document.getElementById(numberId);

  const sync = (value) => {
    range.value = value;
    number.value = value;
  };

  range.addEventListener("input", () => {
    sync(range.value);
    onChange(Number(range.value));
  });

  number.addEventListener("input", () => {
    sync(number.value);
    onChange(Number(number.value));
  });
}

function bindColor(id, onChange) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => onChange(input.value));
}

function bindSelect(id, onChange) {
  const select = document.getElementById(id);
  select.addEventListener("change", () => onChange(select.value));
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
  const size = settings.cols * settings.rows;
  cells = new Uint8Array(size);
  nextCells = new Uint8Array(size);
  ages = new Uint16Array(size);
  nextAges = new Uint16Array(size);

  for (let i = 0; i < size; i += 1) {
    const alive = Math.random() < 0.25 ? 1 : 0;
    cells[i] = alive;
    ages[i] = alive ? 1 : 0;
  }

  entropyHistory = [];
  entropySmooth = 0;
  entropyStreak = 0;
}

function swapBuffers() {
  [cells, nextCells] = [nextCells, cells];
  [ages, nextAges] = [nextAges, ages];
}

function computeEntropy(aliveCount) {
  const total = settings.cols * settings.rows;
  const p = total === 0 ? 0 : aliveCount / total;
  if (p <= 0 || p >= 1) {
    return { p, h: 0 };
  }
  const h = -p * Math.log(p) - (1 - p) * Math.log(1 - p);
  return { p, h };
}

function updateEntropy(h) {
  entropyHistory.push(h);
  if (entropyHistory.length > settings.entropyWindow) {
    entropyHistory.shift();
  }
  const sum = entropyHistory.reduce((acc, value) => acc + value, 0);
  entropySmooth = entropyHistory.length > 0 ? sum / entropyHistory.length : 0;
  if (entropySmooth < settings.entropyMin) {
    entropyStreak += 1;
  } else {
    entropyStreak = 0;
  }
}

function rotatePattern(pattern, times) {
  let rotated = pattern.map(([x, y]) => [x, y]);
  for (let i = 0; i < times; i += 1) {
    const bounds = getBounds(rotated);
    rotated = rotated.map(([x, y]) => [y - bounds.minY, bounds.maxX - x]);
  }
  return normalizePattern(rotated);
}

function normalizePattern(pattern) {
  const bounds = getBounds(pattern);
  return pattern.map(([x, y]) => [x - bounds.minX, y - bounds.minY]);
}

function getBounds(pattern) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pattern.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  return { minX, maxX, minY, maxY };
}

function getPatternForEntropy(h) {
  const maxEntropy = Math.log(2);
  const ratio = maxEntropy === 0 ? 0 : h / maxEntropy;
  if (ratio < 0.18) return "hwss";
  if (ratio < 0.28) return "mwss";
  if (ratio < 0.4) return "lwss";
  return "glider";
}

function getRotationForDirection(direction) {
  switch (direction) {
    case "right":
      return 0;
    case "down":
      return 1;
    case "left":
      return 2;
    case "up":
      return 3;
    default:
      return 0;
  }
}

function isPlacementValid(pattern, posX, posY) {
  const bounds = getBounds(pattern);
  const expanded = {
    minX: bounds.minX - 1,
    maxX: bounds.maxX + 1,
    minY: bounds.minY - 1,
    maxY: bounds.maxY + 1,
  };

  for (let y = expanded.minY; y <= expanded.maxY; y += 1) {
    const yy = posY + y;
    if (yy < 0 || yy >= settings.rows) return false;
    for (let x = expanded.minX; x <= expanded.maxX; x += 1) {
      const xx = posX + x;
      if (xx < 0 || xx >= settings.cols) return false;
      const idx = yy * settings.cols + xx;
      if (cells[idx] === 1) return false;
    }
  }
  return true;
}

function placePattern(pattern, posX, posY) {
  pattern.forEach(([x, y]) => {
    const xx = posX + x;
    const yy = posY + y;
    if (xx < 0 || xx >= settings.cols || yy < 0 || yy >= settings.rows) return;
    const idx = yy * settings.cols + xx;
    cells[idx] = 1;
    ages[idx] = 1;
  });
}

function tryInjectPattern(patternName) {
  const direction = directions[Math.floor(Math.random() * directions.length)];
  const basePattern = patterns[patternName];
  const rotated = rotatePattern(basePattern, getRotationForDirection(direction));
  const bounds = getBounds(rotated);
  const expanded = {
    minX: bounds.minX - 1,
    maxX: bounds.maxX + 1,
    minY: bounds.minY - 1,
    maxY: bounds.maxY + 1,
  };

  const minX = -expanded.minX;
  const maxX = settings.cols - 1 - expanded.maxX;
  const minY = -expanded.minY;
  const maxY = settings.rows - 1 - expanded.maxY;

  if (minX > maxX || minY > maxY) return false;

  let posX = minX;
  let posY = minY;

  if (direction === "right") {
    posX = minX;
    posY = randomBetween(minY, maxY);
  } else if (direction === "left") {
    posX = maxX;
    posY = randomBetween(minY, maxY);
  } else if (direction === "down") {
    posY = minY;
    posX = randomBetween(minX, maxX);
  } else if (direction === "up") {
    posY = maxY;
    posX = randomBetween(minX, maxX);
  }

  if (!isPlacementValid(rotated, posX, posY)) {
    return false;
  }

  placePattern(rotated, posX, posY);
  return true;
}

function injectIfNeeded() {
  if (entropyStreak < settings.entropyFrames) return;
  const patternName = getPatternForEntropy(entropySmooth);
  let injected = 0;
  let attempts = 0;
  const maxAttempts = settings.injections * 6;
  while (injected < settings.injections && attempts < maxAttempts) {
    if (tryInjectPattern(patternName)) {
      injected += 1;
    }
    attempts += 1;
  }
  entropyStreak = 0;
}

function randomBetween(min, max) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function stepSimulation() {
  let aliveCount = 0;
  for (let y = 0; y < settings.rows; y += 1) {
    const rowOffset = y * settings.cols;
    for (let x = 0; x < settings.cols; x += 1) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= settings.rows) continue;
        const neighborRow = yy * settings.cols;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= settings.cols) continue;
          neighbors += cells[neighborRow + xx];
        }
      }

      const idx = rowOffset + x;
      const alive = cells[idx] === 1;
      const nextAlive = alive ? neighbors === 2 || neighbors === 3 : neighbors === 3;
      nextCells[idx] = nextAlive ? 1 : 0;
      if (nextAlive) {
        nextAges[idx] = alive ? ages[idx] + 1 : 1;
        aliveCount += 1;
      } else {
        nextAges[idx] = 0;
      }
    }
  }

  swapBuffers();

  const { p, h } = computeEntropy(aliveCount);
  updateEntropy(h);
  updateStatus(p, h);
  injectIfNeeded();
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

function updateStatus(p, h) {
  statusDensity.textContent = p.toFixed(3);
  statusEntropy.textContent = h.toFixed(3);
  statusEntropySmooth.textContent = entropySmooth.toFixed(3);
  statusEntropyStreak.textContent = entropyStreak.toString();
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

  render();
  requestAnimationFrame(tick);
}

function applySettings() {
  resizeCanvases();
  resetGrid();
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
  bindPair("entropyMinRange", "entropyMinNumber", (value) => {
    settings.entropyMin = Math.max(0, value);
  });
  bindPair("entropyWindowRange", "entropyWindowNumber", (value) => {
    settings.entropyWindow = Math.max(1, value);
    entropyHistory = [];
  });
  bindPair("entropyFramesRange", "entropyFramesNumber", (value) => {
    settings.entropyFrames = Math.max(1, value);
  });
  bindPair("injectionsRange", "injectionsNumber", (value) => {
    settings.injections = Math.max(1, value);
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
  requestAnimationFrame(tick);
}

start();
