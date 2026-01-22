#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { createSimulationState } = require("./simulation_core");

function parseArgs(argv) {
  const args = {
    config: "input/render_config.json",
    input: "output/simulation.bin",
    output: null,
    progress: null,
    framesPerChunk: 600,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) {
      args.config = argv[i + 1];
      i += 1;
    } else if (arg === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === "--output" && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    } else if (arg === "--progress" && argv[i + 1]) {
      args.progress = argv[i + 1];
      i += 1;
    } else if (arg === "--frames-per-chunk" && argv[i + 1]) {
      args.framesPerChunk = Number(argv[i + 1]);
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

function hexToRgb(value) {
  const hex = value.trim().replace(/^#/, "");
  if (hex.length !== 6) {
    throw new Error(`Invalid hex color: ${value}`);
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function computeCanvasSize(settings) {
  const fieldWidth = settings.cols * settings.cellSize;
  const fieldHeight = settings.rows * settings.cellSize;
  const width = fieldWidth + settings.margin * 2;
  const height = fieldHeight + settings.margin * 2;
  return { width, height, fieldWidth, fieldHeight };
}

function buildBaseFrame(settings) {
  const { width, height, fieldWidth, fieldHeight } = computeCanvasSize(settings);
  const frame = Buffer.alloc(width * height * 3);
  const bg = hexToRgb(settings.bgColor);
  for (let i = 0; i < frame.length; i += 3) {
    frame[i] = bg[0];
    frame[i + 1] = bg[1];
    frame[i + 2] = bg[2];
  }

  const thickness = Math.max(0, Math.round(settings.gridThickness || 0));
  if (thickness > 0) {
    const grid = hexToRgb(settings.gridColor);
    const offsetX = settings.margin;
    const offsetY = settings.margin;
    const half = Math.floor(thickness / 2);

    for (let x = 0; x <= settings.cols; x += 1) {
      const px = offsetX + x * settings.cellSize;
      const xStart = Math.max(0, px - half);
      const xEnd = Math.min(width, xStart + thickness);
      for (let xx = xStart; xx < xEnd; xx += 1) {
        for (let y = offsetY; y < offsetY + fieldHeight; y += 1) {
          const idx = (y * width + xx) * 3;
          frame[idx] = grid[0];
          frame[idx + 1] = grid[1];
          frame[idx + 2] = grid[2];
        }
      }
    }

    for (let y = 0; y <= settings.rows; y += 1) {
      const py = offsetY + y * settings.cellSize;
      const yStart = Math.max(0, py - half);
      const yEnd = Math.min(height, yStart + thickness);
      for (let yy = yStart; yy < yEnd; yy += 1) {
        for (let x = offsetX; x < offsetX + fieldWidth; x += 1) {
          const idx = (yy * width + x) * 3;
          frame[idx] = grid[0];
          frame[idx + 1] = grid[1];
          frame[idx + 2] = grid[2];
        }
      }
    }
  }

  return frame;
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

function renderSnapshot({
  snapshot,
  frame,
  width,
  settings,
  colors,
}) {
  const offsetX = settings.margin;
  const offsetY = settings.margin;
  const { cols, rows, cellSize } = settings;

  for (let y = 0; y < rows; y += 1) {
    const rowOffset = y * cols;
    const py = offsetY + y * cellSize;
    for (let x = 0; x < cols; x += 1) {
      const state = snapshot[rowOffset + x];
      if (state === 0) continue;
      const color = colors[state];
      const px = offsetX + x * cellSize;
      for (let dy = 0; dy < cellSize; dy += 1) {
        let idx = ((py + dy) * width + px) * 3;
        for (let dx = 0; dx < cellSize; dx += 1) {
          frame[idx] = color[0];
          frame[idx + 1] = color[1];
          frame[idx + 2] = color[2];
          idx += 3;
        }
      }
    }
  }
}

function readHeader(fd) {
  const headerLengthBuffer = Buffer.alloc(4);
  fs.readSync(fd, headerLengthBuffer, 0, 4, 0);
  const headerLength = headerLengthBuffer.readUInt32LE(0);
  const headerBuffer = Buffer.alloc(headerLength);
  fs.readSync(fd, headerBuffer, 0, headerLength, 4);
  const header = JSON.parse(headerBuffer.toString("utf8"));
  return { header, headerLength };
}

function readCycleSnapshot(fd, offset, size) {
  const buffer = Buffer.alloc(size);
  const bytesRead = fs.readSync(fd, buffer, 0, size, offset);
  if (bytesRead !== size) {
    throw new Error(`Failed to read cycle snapshot at offset ${offset}.`);
  }
  return buffer;
}

function openFfmpegStream({ width, height, fps, outputPath, targetWidth, targetHeight }) {
  const args = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "-",
  ];

  if (targetWidth !== width || targetHeight !== height) {
    args.push("-vf", `scale=${targetWidth}:${targetHeight}:flags=neighbor`);
  }

  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-g",
    String(Math.max(1, Math.round(fps * 2))),
    "-keyint_min",
    String(Math.max(1, Math.round(fps * 2))),
    "-sc_threshold",
    "0",
    outputPath
  );

  return spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function hashConfig(config, header, inputPath, outputPath) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify({ config, header, inputPath, outputPath }));
  return hash.digest("hex");
}

function loadProgress(progressPath) {
  if (!fs.existsSync(progressPath)) return null;
  return JSON.parse(fs.readFileSync(progressPath, "utf8"));
}

function saveProgress(progressPath, data) {
  const tmpPath = `${progressPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, progressPath);
}

function getChunkDir(outputPath) {
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  return path.join(dir, `${base}_chunks`);
}

function getChunkPath(chunkDir, index) {
  const name = `chunk_${String(index).padStart(6, "0")}.mp4`;
  return path.join(chunkDir, name);
}

function getSuperchunkPath(outputPath, index) {
  const dir = path.dirname(outputPath);
  const ext = path.extname(outputPath) || ".mp4";
  const base = path.basename(outputPath, ext);
  const name = `${base}.superchunk_${String(index).padStart(6, "0")}${ext}`;
  return path.join(dir, name);
}

async function writeFrame(stream, frame) {
  if (stream.write(frame)) return;
  await new Promise((resolve) => stream.once("drain", resolve));
}

async function finalizeStream(process) {
  if (process.stdin) process.stdin.end();
  await new Promise((resolve, reject) => {
    process.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    process.on("error", reject);
  });
}

async function concatFiles(chunkDir, filePaths, outputPath) {
  const listPath = path.join(chunkDir, "concat.txt");
  const lines = [];
  for (const filePath of filePaths) {
    lines.push(`file '${filePath.replace(/'/g, "'\\''")}'`);
  }
  fs.writeFileSync(listPath, lines.join("\n"));

  await new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config);
  const inputPath = path.resolve(args.input);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const settings = config.settings || {};
  const fps = Number(config.fps);
  const durationHours = Number(config.durationHours);
  const outputPath = path.resolve(args.output || config.outputPath || "output/game-of-life.mp4");
  const progressPath = path.resolve(
    args.progress || `${outputPath}.progress.json`
  );

  if (!fps || !durationHours || !settings.speed) {
    throw new Error("Config must include fps, durationHours, and settings.speed.");
  }

  const fd = fs.openSync(inputPath, "r");
  const { header, headerLength } = readHeader(fd);
  const cycleSize = header.gridWidth * header.gridHeight;
  const dataOffset = 4 + headerLength;

  if (header.gridWidth !== settings.cols || header.gridHeight !== settings.rows) {
    throw new Error(
      `Grid mismatch: header ${header.gridWidth}x${header.gridHeight} vs settings ${settings.cols}x${settings.rows}.`
    );
  }
  if (header.fps !== fps || header.simulationSpeed !== settings.speed) {
    throw new Error("Header timing does not match render config.");
  }

  const { width, height } = computeCanvasSize(settings);
  const targetWidth = Number(config.width) || width;
  const targetHeight = Number(config.height) || height;
  const totalFrames = Math.floor(durationHours * 3600 * fps);
  const framesPerSuperchunk = Math.max(1, Math.round(fps * 60 * 5));
  const stepTime = 1 / settings.speed;
  const delta = 1 / fps;

  ensureDir(outputPath);
  const chunkDir = getChunkDir(outputPath);
  fs.mkdirSync(chunkDir, { recursive: true });

  const configHash = hashConfig(config, header, inputPath, outputPath);
  let progress = loadProgress(progressPath);
  if (!progress || progress.configHash !== configHash) {
    progress = {
      configHash,
      inputPath,
      outputPath,
      totalFrames,
      fps,
      frameIndex: 0,
      cycleCount: 0,
      accumulator: 0,
      chunkIndex: 0,
      framesPerChunk: args.framesPerChunk,
      framesPerSuperchunk,
      superchunkIndex: 0,
      framesIntoSuperchunk: 0,
      superchunkChunkStart: 0,
      complete: false,
    };
  } else {
    if (!Number.isFinite(progress.framesPerChunk)) {
      progress.framesPerChunk = args.framesPerChunk;
    }
    if (!Number.isFinite(progress.framesPerSuperchunk)) {
      progress.framesPerSuperchunk = framesPerSuperchunk;
    }
    if (!Number.isFinite(progress.superchunkIndex)) {
      progress.superchunkIndex = 0;
    }
    if (!Number.isFinite(progress.framesIntoSuperchunk)) {
      progress.framesIntoSuperchunk = 0;
    }
    if (!Number.isFinite(progress.superchunkChunkStart)) {
      progress.superchunkChunkStart = 0;
    }
  }

  if (progress.complete) {
    console.log("Render already complete.");
    fs.closeSync(fd);
    return;
  }

  const rng = createRng(header.seed || 0);
  const initialState = createSimulationState(settings, rng);
  const initialSnapshot = encodeSnapshot(initialState.cells, initialState.ages);

  const colors = {
    1: hexToRgb(settings.alive1Color),
    2: hexToRgb(settings.alive2Color),
    3: hexToRgb(settings.alive10Color),
  };
  const baseFrame = buildBaseFrame(settings);

  let {
    frameIndex,
    cycleCount,
    accumulator,
    chunkIndex,
    superchunkIndex,
    framesIntoSuperchunk,
    superchunkChunkStart,
  } = progress;
  const framesPerChunk = progress.framesPerChunk;
  const superchunkTarget = progress.framesPerSuperchunk;
  let currentSnapshot = null;
  let currentSnapshotCycle = -1;
  const ensureSnapshot = () => {
    if (cycleCount === currentSnapshotCycle) return;
    if (cycleCount === 0) {
      currentSnapshot = initialSnapshot;
    } else {
      const cycleIndex = cycleCount - 1;
      const offset = dataOffset + cycleIndex * cycleSize;
      currentSnapshot = readCycleSnapshot(fd, offset, cycleSize);
    }
    currentSnapshotCycle = cycleCount;
  };
  let stopRequested = false;

  process.on("SIGINT", () => {
    stopRequested = true;
  });

  while (frameIndex < totalFrames) {
    if (framesIntoSuperchunk === 0) {
      superchunkChunkStart = chunkIndex;
    }
    const superchunkPath = getSuperchunkPath(outputPath, superchunkIndex);
    console.log(
      `Rendering superchunk ${superchunkIndex} (target ${superchunkTarget} frames)...`
    );

    while (frameIndex < totalFrames && framesIntoSuperchunk < superchunkTarget) {
      const chunkFrames = Math.min(
        framesPerChunk,
        superchunkTarget - framesIntoSuperchunk,
        totalFrames - frameIndex
      );
      const chunkPath = getChunkPath(chunkDir, chunkIndex);

      if (fs.existsSync(chunkPath)) {
        fs.unlinkSync(chunkPath);
      }

      console.log(`Rendering chunk ${chunkIndex} (${chunkFrames} frames)...`);
      const ffmpeg = openFfmpegStream({
        width,
        height,
        fps,
        outputPath: chunkPath,
        targetWidth,
        targetHeight,
      });

      let framesRendered = 0;
      try {
        for (; framesRendered < chunkFrames; framesRendered += 1) {
          accumulator += delta;
          while (accumulator >= stepTime) {
            cycleCount += 1;
            accumulator -= stepTime;
          }

          if (cycleCount > header.totalCycles) {
            throw new Error("Cycle count exceeded precomputed total cycles.");
          }

          ensureSnapshot();

          const frame = Buffer.from(baseFrame);
          renderSnapshot({
            snapshot: currentSnapshot,
            frame,
            width,
            settings,
            colors,
          });
          await writeFrame(ffmpeg.stdin, frame);
        }
      } finally {
        await finalizeStream(ffmpeg);
      }

      frameIndex += framesRendered;
      framesIntoSuperchunk += framesRendered;
      chunkIndex += 1;

      saveProgress(progressPath, {
        ...progress,
        frameIndex,
        cycleCount,
        accumulator,
        chunkIndex,
        superchunkIndex,
        framesIntoSuperchunk,
        superchunkChunkStart,
        complete: frameIndex >= totalFrames,
      });

      if (stopRequested) {
        console.log("Stop requested. Progress saved.");
        break;
      }
    }

    if (stopRequested) {
      break;
    }

    if (framesIntoSuperchunk > 0) {
      const chunkFiles = [];
      for (let i = superchunkChunkStart; i < chunkIndex; i += 1) {
        chunkFiles.push(getChunkPath(chunkDir, i));
      }

      if (chunkFiles.length > 0) {
        if (fs.existsSync(superchunkPath)) {
          fs.unlinkSync(superchunkPath);
        }
        console.log(
          `Concatenating superchunk ${superchunkIndex} (${framesIntoSuperchunk} frames)...`
        );
        await concatFiles(chunkDir, chunkFiles, superchunkPath);
        for (const filePath of chunkFiles) {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }
    }

    framesIntoSuperchunk = 0;
    superchunkIndex += 1;
    superchunkChunkStart = chunkIndex;

    saveProgress(progressPath, {
      ...progress,
      frameIndex,
      cycleCount,
      accumulator,
      chunkIndex,
      superchunkIndex,
      framesIntoSuperchunk,
      superchunkChunkStart,
      complete: frameIndex >= totalFrames,
    });
  }

  if (frameIndex >= totalFrames) {
    console.log("Render complete (superchunks).");
  }

  fs.closeSync(fd);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
