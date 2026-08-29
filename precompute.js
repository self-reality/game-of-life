#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { createSimulationState, stepSimulation } = require("./simulation_core");

function parseArgs(argv) {
  const args = { config: "input/render_config.json", out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) {
      args.config = argv[i + 1];
      i += 1;
    } else if (arg === "--out" && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function computeTotalCycles({ fps, speed, durationHours }) {
  const totalFrames = Math.floor(durationHours * 3600 * fps);
  const delta = 1 / fps;
  const stepTime = 1 / speed;
  let accumulator = 0;
  let cycles = 0;
  for (let frame = 0; frame < totalFrames; frame += 1) {
    accumulator += delta;
    while (accumulator >= stepTime) {
      cycles += 1;
      accumulator -= stepTime;
    }
  }
  return { totalFrames, totalCycles: cycles };
}

function verifyTiming({ fps, speed, durationHours, totalCycles }) {
  const expectedSeconds = durationHours * 3600;
  const actualSeconds = totalCycles / speed;
  const tolerance = 1 / fps;
  const delta = Math.abs(actualSeconds - expectedSeconds);
  if (delta > tolerance) {
    throw new Error(
      `Timing mismatch: expected ${expectedSeconds.toFixed(4)}s, got ${actualSeconds.toFixed(
        4
      )}s`
    );
  }
}

function encodeSnapshot(cells, ages) {
  const out = Buffer.allocUnsafe(cells.length);
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] === 0) {
      out[i] = 0;
    } else if (ages[i] >= 10) {
      out[i] = 3;
    } else if (ages[i] >= 2) {
      out[i] = 2;
    } else {
      out[i] = 1;
    }
  }
  return out;
}

function writeBuffer(stream, buffer) {
  if (stream.write(buffer)) return Promise.resolve();
  return new Promise((resolve) => stream.once("drain", resolve));
}

function finalizeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end();
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const outputDir = config.outputPath
    ? path.dirname(config.outputPath)
    : "output";
  const outputPath = path.resolve(
    args.out || path.join(outputDir, "simulation.bin")
  );

  const fps = Number(config.fps);
  const durationHours = Number(config.durationHours);
  const settings = config.settings || {};
  const simulationSpeed = Number(settings.speed);
  const seed = Number.isFinite(config.seed) ? Number(config.seed) : 0;

  if (!fps || !durationHours || !simulationSpeed) {
    throw new Error("Config must include fps, durationHours, and settings.speed.");
  }

  const { totalFrames, totalCycles } = computeTotalCycles({
    fps,
    speed: simulationSpeed,
    durationHours,
  });
  verifyTiming({ fps, speed: simulationSpeed, durationHours, totalCycles });

  const rng = createRng(seed);
  const sim = createSimulationState(settings, rng);
  const gridSize = settings.cols * settings.rows;

  const header = {
    version: 1,
    fps,
    simulationSpeed,
    totalCycles,
    gridWidth: settings.cols,
    gridHeight: settings.rows,
    wrapHorizontal: settings.wrapHorizontal !== false,
    seed,
  };
  const headerBuffer = Buffer.from(JSON.stringify(header), "utf8");
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32LE(headerBuffer.length, 0);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const stream = fs.createWriteStream(outputPath);
  await writeBuffer(stream, headerLength);
  await writeBuffer(stream, headerBuffer);

  for (let cycle = 0; cycle < totalCycles; cycle += 1) {
    stepSimulation(sim, settings, rng);
    const snapshot = encodeSnapshot(sim.cells, sim.ages);
    if (snapshot.length !== gridSize) {
      throw new Error("Snapshot size mismatch with grid size.");
    }
    await writeBuffer(stream, snapshot);
  }

  await finalizeStream(stream);
  const durationSeconds = durationHours * 3600;
  console.log(
    `Precompute complete: ${totalCycles} cycles, ${totalFrames} frames, ${durationSeconds.toFixed(
      2
    )}s -> ${outputPath}`
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
