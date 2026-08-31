(() => {
  // Spaceships pre-oriented to travel upward, so they can be stamped straight
  // onto the bottom edge without any rotation work.
  const upwardShips = {
    gliderNE: [
      [1, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [2, 2],
    ],
    gliderNW: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 2],
    ],
    lwss: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [3, 1],
      [0, 2],
      [0, 3],
      [1, 4],
      [3, 4],
    ],
    mwss: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [3, 1],
      [0, 2],
      [0, 3],
      [4, 3],
      [0, 4],
      [1, 5],
      [3, 5],
    ],
    hwss: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [3, 1],
      [0, 2],
      [0, 3],
      [4, 3],
      [0, 4],
      [4, 4],
      [0, 5],
      [1, 6],
      [3, 6],
    ],
  };

  const gliderNames = ["gliderNE", "gliderNW"];
  const spaceshipNames = ["lwss", "mwss", "hwss"];

  function createSimulationState(settings, rng = Math.random) {
    const state = {
      cells: new Uint8Array(settings.cols * settings.rows),
      nextCells: new Uint8Array(settings.cols * settings.rows),
      ages: new Uint16Array(settings.cols * settings.rows),
      nextAges: new Uint16Array(settings.cols * settings.rows),
      cycleCount: 0,
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

  function pickUpwardShip(rng) {
    const names = rng() < 0.2 ? gliderNames : spaceshipNames;
    return upwardShips[names[Math.floor(rng() * names.length)]];
  }

  function clearFootprint(state, settings, width, height, posX, posY) {
    const { cols, rows } = settings;
    const wrap = wrapsX(settings);
    for (let y = posY - 1; y <= posY + height; y += 1) {
      if (y < 0 || y >= rows) continue;
      const rowOffset = y * cols;
      for (let x = posX - 1; x <= posX + width; x += 1) {
        let xx = x;
        if (wrap) {
          xx = wrapX(xx, cols);
        } else if (xx < 0 || xx >= cols) {
          continue;
        }
        const idx = rowOffset + xx;
        state.cells[idx] = 0;
        state.ages[idx] = 0;
      }
    }
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

  function spawnShipFromBottom(state, settings, rng) {
    const ship = pickUpwardShip(rng);
    const bounds = getBounds(ship);
    const width = bounds.maxX + 1;
    const height = bounds.maxY + 1;
    const posY = settings.rows - height;
    if (posY < 0) return;

    const maxX = wrapsX(settings) ? settings.cols - 1 : settings.cols - width;
    if (maxX < 0) return;
    const posX = Math.floor(rng() * (maxX + 1));

    clearFootprint(state, settings, width, height, posX, posY);
    placePattern(state, settings, ship, posX, posY);
  }

  function injectIfNeeded(state, settings, rng) {
    if (state.cycleCount % settings.injectionPeriod !== 0) return;
    for (let i = 0; i < settings.injections; i += 1) {
      spawnShipFromBottom(state, settings, rng);
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
