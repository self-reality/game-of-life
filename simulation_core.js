(() => {
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

  function createSimulationState(settings, rng = Math.random) {
    const state = {
      cells: new Uint8Array(settings.cols * settings.rows),
      nextCells: new Uint8Array(settings.cols * settings.rows),
      ages: new Uint16Array(settings.cols * settings.rows),
      nextAges: new Uint16Array(settings.cols * settings.rows),
      cycleCount: 0,
      corridorCache: new Map(),
      columnNeighbors: null,
    };
    seedGrid(state, settings, rng);
    return state;
  }

  function resetSimulation(state, settings, rng = Math.random) {
    state.cells = new Uint8Array(settings.cols * settings.rows);
    state.nextCells = new Uint8Array(settings.cols * settings.rows);
    state.ages = new Uint16Array(settings.cols * settings.rows);
    state.nextAges = new Uint16Array(settings.cols * settings.rows);
    state.cycleCount = 0;
    state.corridorCache = new Map();
    state.columnNeighbors = null;
    seedGrid(state, settings, rng);
  }

  function seedGrid(state, settings, rng) {
    const probability =
      typeof settings.initialAliveProbability === "number"
        ? settings.initialAliveProbability
        : 0.25;
    for (let i = 0; i < state.cells.length; i += 1) {
      const alive = rng() < probability ? 1 : 0;
      state.cells[i] = alive;
      state.ages[i] = alive ? 1 : 0;
    }
  }

  function wrapsX(settings) {
    return settings.wrapHorizontal !== false && settings.cols >= 3;
  }

  function wrapX(x, cols) {
    const wrapped = x % cols;
    return wrapped < 0 ? wrapped + cols : wrapped;
  }

  function getColumnNeighbors(state, settings) {
    const { cols } = settings;
    const wrap = wrapsX(settings);
    const cached = state.columnNeighbors;
    if (cached && cached.cols === cols && cached.wrap === wrap) return cached;

    const left = new Int32Array(cols);
    const right = new Int32Array(cols);
    for (let x = 0; x < cols; x += 1) {
      left[x] = x > 0 ? x - 1 : wrap ? cols - 1 : -1;
      right[x] = x < cols - 1 ? x + 1 : wrap ? 0 : -1;
    }
    state.columnNeighbors = { cols, wrap, left, right };
    return state.columnNeighbors;
  }

  function stepSimulation(state, settings, rng = Math.random) {
    let aliveCount = 0;
    const { cols, rows } = settings;
    const { cells, ages, nextCells, nextAges } = state;
    const { left: leftCol, right: rightCol } = getColumnNeighbors(state, settings);

    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += 1) {
        const xLeft = leftCol[x];
        const xRight = rightCol[x];
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          const neighborRow = yy * cols;
          if (xLeft >= 0) neighbors += cells[neighborRow + xLeft];
          if (xRight >= 0) neighbors += cells[neighborRow + xRight];
          if (dy !== 0) neighbors += cells[neighborRow + x];
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

    swapBuffers(state);

    const total = cols * rows;
    const density = total === 0 ? 0 : aliveCount / total;
    state.cycleCount += 1;
    injectIfNeeded(state, settings, rng);
    return { density };
  }

  function swapBuffers(state) {
    [state.cells, state.nextCells] = [state.nextCells, state.cells];
    [state.ages, state.nextAges] = [state.nextAges, state.ages];
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

  function pickShipPatternName(rng) {
    if (rng() < 0.2) return "glider";
    const ships = ["lwss", "mwss", "hwss"];
    return ships[Math.floor(rng() * ships.length)];
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

  function getCorridorForPattern(state, settings, patternName, rotation) {
    const maxSteps = settings.corridorMaxSteps;
    const key = getCorridorCacheKey(patternName, rotation, maxSteps);
    if (state.corridorCache.has(key)) return state.corridorCache.get(key);

    const basePattern = patterns[patternName];
    const rotated = rotatePattern(basePattern, rotation);
    const { rawSteps, paddedSteps } = simulatePatternSteps(rotated, maxSteps);
    const corridor = {
      pattern: rotated,
      steps: paddedSteps,
      step0Bounds: getBoundsFromCoords(paddedSteps[0] || []),
      direction: inferDirectionFromSteps(rawSteps),
    };

    state.corridorCache.set(key, corridor);
    return corridor;
  }

  function randomBetween(min, max, rng) {
    if (max <= min) return min;
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function getEntryPositionForEdge(settings, edge, step0Bounds, rng) {
    if (edge === "left") {
      const posX = -step0Bounds.minX;
      const minY = -step0Bounds.minY;
      const maxY = settings.rows - 1 - step0Bounds.maxY;
      if (minY > maxY) return null;
      return { posX, posY: randomBetween(minY, maxY, rng) };
    }
    if (edge === "right") {
      const posX = settings.cols - 1 - step0Bounds.maxX;
      const minY = -step0Bounds.minY;
      const maxY = settings.rows - 1 - step0Bounds.maxY;
      if (minY > maxY) return null;
      return { posX, posY: randomBetween(minY, maxY, rng) };
    }
    const wrap = wrapsX(settings);
    const minX = wrap ? 0 : -step0Bounds.minX;
    const maxX = wrap ? settings.cols - 1 : settings.cols - 1 - step0Bounds.maxX;
    if (edge === "top") {
      const posY = -step0Bounds.minY;
      if (minX > maxX) return null;
      return { posX: randomBetween(minX, maxX, rng), posY };
    }
    if (edge === "bottom") {
      const posY = settings.rows - 1 - step0Bounds.maxY;
      if (minX > maxX) return null;
      return { posX: randomBetween(minX, maxX, rng), posY };
    }
    return null;
  }

  function isCorridorStepClear(state, settings, stepCells, posX, posY) {
    const { cols, rows } = settings;
    const wrap = wrapsX(settings);
    for (let i = 0; i < stepCells.length; i += 1) {
      const [x, y] = stepCells[i];
      let xx = posX + x;
      const yy = posY + y;
      if (yy < 0 || yy >= rows) return false;
      if (wrap) {
        xx = wrapX(xx, cols);
      } else if (xx < 0 || xx >= cols) {
        return false;
      }
      if (state.cells[yy * cols + xx] === 1) return false;
    }
    return true;
  }

  function getCorridorLength(state, settings, steps, posX, posY) {
    let length = 0;
    for (let i = 0; i < steps.length; i += 1) {
      if (!isCorridorStepClear(state, settings, steps[i], posX, posY)) break;
      length += 1;
    }
    return length;
  }

  function findBestCorridorPlacement(state, settings, corridor, rng) {
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
      const edge = availableEdges[Math.floor(rng() * availableEdges.length)];
      edgeCounts.set(edge, (edgeCounts.get(edge) || 0) + 1);

      const entry = getEntryPositionForEdge(
        settings,
        edge,
        corridor.step0Bounds,
        rng
      );
      if (!entry) continue;
      const length = getCorridorLength(
        state,
        settings,
        corridor.steps,
        entry.posX,
        entry.posY
      );
      if (!best || length > best.length) {
        best = { posX: entry.posX, posY: entry.posY, length };
      }
    }

    if (best && best.length >= settings.corridorMinLength) {
      return best;
    }
    return null;
  }

  function placePattern(state, settings, pattern, posX, posY) {
    const { cols, rows } = settings;
    const wrap = wrapsX(settings);
    pattern.forEach(([x, y]) => {
      let xx = posX + x;
      const yy = posY + y;
      if (yy < 0 || yy >= rows) return;
      if (wrap) {
        xx = wrapX(xx, cols);
      } else if (xx < 0 || xx >= cols) {
        return;
      }
      const idx = yy * cols + xx;
      state.cells[idx] = 1;
      state.ages[idx] = 1;
    });
  }

  function injectIfNeeded(state, settings, rng) {
    if (state.cycleCount % settings.injectionPeriod !== 0) return;
    let injected = 0;
    while (injected < settings.injections) {
      const patternName = pickShipPatternName(rng);
      const rotation = Math.floor(rng() * 4);
      const corridor = getCorridorForPattern(
        state,
        settings,
        patternName,
        rotation
      );
      const placement = findBestCorridorPlacement(
        state,
        settings,
        corridor,
        rng
      );
      if (placement) {
        placePattern(state, settings, corridor.pattern, placement.posX, placement.posY);
        injected += 1;
      } else {
        break;
      }
    }
  }

  const api = {
    createSimulationState,
    resetSimulation,
    stepSimulation,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof globalThis !== "undefined") {
    globalThis.SimulationCore = api;
  } else if (typeof window !== "undefined") {
    window.SimulationCore = api;
  }
})();
