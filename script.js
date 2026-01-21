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
  corridorMaxSteps: 120,
  corridorMinLength: 40,
  corridorAttempts: 24,
  corridorEdgeAttempts: 8,
  initialAliveProbability: 0.25,
};

let simulation = SimulationCore.createSimulationState(settings, Math.random);
let cells = simulation.cells;
let nextCells = simulation.nextCells;
let ages = simulation.ages;
let nextAges = simulation.nextAges;

let lastTime = 0;
let accumulator = 0;
let cycleCount = 0;

const corridorCache = new Map();

const glowConfig = {
  blur: 4,
  alpha: 1,
  blendMode: "lighten",
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
  SimulationCore.resetSimulation(simulation, settings, Math.random);
  syncSimulationBuffers();
}

function syncSimulationBuffers() {
  cells = simulation.cells;
  nextCells = simulation.nextCells;
  ages = simulation.ages;
  nextAges = simulation.nextAges;
  cycleCount = simulation.cycleCount;
}

function swapBuffers() {
  [cells, nextCells] = [nextCells, cells];
  [ages, nextAges] = [nextAges, ages];
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

function pickShipPatternName() {
  if (Math.random() < 0.2) return "glider";
  const ships = ["lwss", "mwss", "hwss"];
  return ships[Math.floor(Math.random() * ships.length)];
}

function getCorridorCacheKey(patternName, rotation, maxSteps) {
  return `${patternName}:${rotation}:${maxSteps}`;
}

function getBoundsFromCoords(coords) {
  if (!coords.length) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  coords.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  return { minX, maxX, minY, maxY };
}

function padCorridorCells(coords) {
  const padded = [];
  const seen = new Set();
  coords.forEach(([x, y]) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        const key = `${xx},${yy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        padded.push([xx, yy]);
      }
    }
  });
  return padded;
}

function simulatePatternSteps(pattern, maxSteps) {
  const bounds = getBounds(pattern);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const pad = maxSteps + 2;
  const cols = width + pad * 2;
  const rows = height + pad * 2;

  let grid = new Uint8Array(cols * rows);
  pattern.forEach(([x, y]) => {
    const xx = x - bounds.minX + pad;
    const yy = y - bounds.minY + pad;
    grid[yy * cols + xx] = 1;
  });

  const rawSteps = [];
  const paddedSteps = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const liveCells = [];
    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += 1) {
        if (grid[rowOffset + x] !== 1) continue;
        liveCells.push([x - pad, y - pad]);
      }
    }
    rawSteps.push(liveCells);
    paddedSteps.push(padCorridorCells(liveCells));

    const next = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += 1) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          const neighborRow = yy * cols;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= cols) continue;
            neighbors += grid[neighborRow + xx];
          }
        }
        const idx = rowOffset + x;
        const alive = grid[idx] === 1;
        const nextAlive = alive ? neighbors === 2 || neighbors === 3 : neighbors === 3;
        if (nextAlive) next[idx] = 1;
      }
    }
    grid = next;
  }

  return { rawSteps, paddedSteps };
}

function getCentroid(coords) {
  if (!coords.length) return { x: 0, y: 0 };
  const sum = coords.reduce(
    (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / coords.length, y: sum.y / coords.length };
}

function getEntryEdges(dx, dy) {
  const edges = [];
  if (dx > 0) edges.push("left");
  if (dx < 0) edges.push("right");
  if (dy > 0) edges.push("top");
  if (dy < 0) edges.push("bottom");
  if (!edges.length) {
    return ["left", "right", "top", "bottom"];
  }
  return edges;
}

function inferDirectionFromSteps(rawSteps) {
  const first = rawSteps.find((step) => step.length);
  const last = [...rawSteps].reverse().find((step) => step.length);
  if (!first || !last) {
    return { dx: 0, dy: 0, edges: ["left", "right", "top", "bottom"] };
  }
  const firstCenter = getCentroid(first);
  const lastCenter = getCentroid(last);
  const deltaX = lastCenter.x - firstCenter.x;
  const deltaY = lastCenter.y - firstCenter.y;
  const dx = deltaX > 0.1 ? 1 : deltaX < -0.1 ? -1 : 0;
  const dy = deltaY > 0.1 ? 1 : deltaY < -0.1 ? -1 : 0;
  return { dx, dy, edges: getEntryEdges(dx, dy) };
}

function getCorridorForPattern(patternName, rotation) {
  const maxSteps = settings.corridorMaxSteps;
  const key = getCorridorCacheKey(patternName, rotation, maxSteps);
  if (corridorCache.has(key)) return corridorCache.get(key);

  const basePattern = patterns[patternName];
  const rotated = rotatePattern(basePattern, rotation);
  const { rawSteps, paddedSteps } = simulatePatternSteps(rotated, maxSteps);
  const corridor = {
    pattern: rotated,
    steps: paddedSteps,
    step0Bounds: getBoundsFromCoords(paddedSteps[0] || []),
    direction: inferDirectionFromSteps(rawSteps),
  };

  corridorCache.set(key, corridor);
  return corridor;
}

function getEntryPositionForEdge(edge, step0Bounds) {
  if (edge === "left") {
    const posX = -step0Bounds.minX;
    const minY = -step0Bounds.minY;
    const maxY = settings.rows - 1 - step0Bounds.maxY;
    if (minY > maxY) return null;
    return { posX, posY: randomBetween(minY, maxY) };
  }
  if (edge === "right") {
    const posX = settings.cols - 1 - step0Bounds.maxX;
    const minY = -step0Bounds.minY;
    const maxY = settings.rows - 1 - step0Bounds.maxY;
    if (minY > maxY) return null;
    return { posX, posY: randomBetween(minY, maxY) };
  }
  if (edge === "top") {
    const posY = -step0Bounds.minY;
    const minX = -step0Bounds.minX;
    const maxX = settings.cols - 1 - step0Bounds.maxX;
    if (minX > maxX) return null;
    return { posX: randomBetween(minX, maxX), posY };
  }
  if (edge === "bottom") {
    const posY = settings.rows - 1 - step0Bounds.maxY;
    const minX = -step0Bounds.minX;
    const maxX = settings.cols - 1 - step0Bounds.maxX;
    if (minX > maxX) return null;
    return { posX: randomBetween(minX, maxX), posY };
  }
  return null;
}

function isCorridorStepClear(stepCells, posX, posY) {
  for (let i = 0; i < stepCells.length; i += 1) {
    const [x, y] = stepCells[i];
    const xx = posX + x;
    const yy = posY + y;
    if (xx < 0 || xx >= settings.cols || yy < 0 || yy >= settings.rows) {
      return false;
    }
    if (cells[yy * settings.cols + xx] === 1) return false;
  }
  return true;
}

function getCorridorLength(steps, posX, posY) {
  let length = 0;
  for (let i = 0; i < steps.length; i += 1) {
    if (!isCorridorStepClear(steps[i], posX, posY)) break;
    length += 1;
  }
  return length;
}

function findBestCorridorPlacement(corridor) {
  const edgeCounts = new Map();
  const edges = corridor.direction.edges.length
    ? corridor.direction.edges
    : ["left", "right", "top", "bottom"];
  let best = null;

  for (let attempt = 0; attempt < settings.corridorAttempts; attempt += 1) {
    const availableEdges = edges.filter(
      (edge) =>
        (edgeCounts.get(edge) || 0) < settings.corridorEdgeAttempts
    );
    if (!availableEdges.length) break;
    const edge =
      availableEdges[Math.floor(Math.random() * availableEdges.length)];
    edgeCounts.set(edge, (edgeCounts.get(edge) || 0) + 1);

    const entry = getEntryPositionForEdge(edge, corridor.step0Bounds);
    if (!entry) continue;
    const length = getCorridorLength(corridor.steps, entry.posX, entry.posY);
    if (!best || length > best.length) {
      best = { posX: entry.posX, posY: entry.posY, length };
    }
  }

  if (best && best.length >= settings.corridorMinLength) {
    return best;
  }
  return null;
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

function injectIfNeededCorridor() {
  if (cycleCount % settings.injectionPeriod !== 0) return;
  let injected = 0;
  while (injected < settings.injections) {
    const patternName = pickShipPatternName();
    const rotation = Math.floor(Math.random() * 4);
    const corridor = getCorridorForPattern(patternName, rotation);
    const placement = findBestCorridorPlacement(corridor);
    if (placement) {
      placePattern(corridor.pattern, placement.posX, placement.posY);
      injected += 1;
    } else {
      break;
    }
  }
}

function injectIfNeeded() {
  injectIfNeededCorridor();
}

function randomBetween(min, max) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function stepSimulation() {
  const { density } = SimulationCore.stepSimulation(
    simulation,
    settings,
    Math.random
  );
  syncSimulationBuffers();
  updateStatus(density);
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
  bindPair("injectionsRange", "injectionsNumber", (value) => {
    settings.injections = Math.max(1, value);
  });
  bindPair("injectionPeriodRange", "injectionPeriodNumber", (value) => {
    settings.injectionPeriod = Math.max(1, value);
  });
  bindPair("corridorMaxStepsRange", "corridorMaxStepsNumber", (value) => {
    settings.corridorMaxSteps = Math.max(1, value);
    simulation.corridorCache.clear();
  });
  bindPair("corridorMinLengthRange", "corridorMinLengthNumber", (value) => {
    settings.corridorMinLength = Math.max(1, value);
  });
  bindPair("corridorAttemptsRange", "corridorAttemptsNumber", (value) => {
    settings.corridorAttempts = Math.max(1, value);
  });
  bindPair(
    "corridorEdgeAttemptsRange",
    "corridorEdgeAttemptsNumber",
    (value) => {
      settings.corridorEdgeAttempts = Math.max(1, value);
    }
  );

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
