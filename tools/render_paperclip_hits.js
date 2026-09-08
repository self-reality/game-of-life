#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_CONFIG = "input/render_config.json";
const DEFAULT_INPUT =
  "/Volumes/Smartbuy/Media Production/Production Videos/Long/simulation.bin";
const DEFAULT_CSV = path.resolve(__dirname, "paperclip_hits.csv");
const DEFAULT_OUTPUT = path.resolve("output/paperclip_cycles");

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG,
    input: DEFAULT_INPUT,
    csv: DEFAULT_CSV,
    output: DEFAULT_OUTPUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) {
      args.config = argv[i + 1];
      i += 1;
    } else if (arg === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === "--csv" && argv[i + 1]) {
      args.csv = argv[i + 1];
      i += 1;
    } else if (arg === "--output" && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    }
  }
  return args;
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

function renderSnapshot({ snapshot, frame, width, settings, colors }) {
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
  const readHeaderLength = fs.readSync(fd, headerLengthBuffer, 0, 4, 0);
  if (readHeaderLength !== 4) {
    throw new Error("Failed to read header length.");
  }
  const headerLength = headerLengthBuffer.readUInt32LE(0);
  const headerBuffer = Buffer.alloc(headerLength);
  const readHeaderBytes = fs.readSync(fd, headerBuffer, 0, headerLength, 4);
  if (readHeaderBytes !== headerLength) {
    throw new Error("Failed to read header data.");
  }
  const header = JSON.parse(headerBuffer.toString("utf8"));
  return { header, dataOffset: 4 + headerLength };
}

function readCycleSnapshot(fd, offset, size) {
  const buffer = Buffer.alloc(size);
  const bytesRead = fs.readSync(fd, buffer, 0, size, offset);
  if (bytesRead !== size) {
    throw new Error(`Failed to read cycle snapshot at offset ${offset}.`);
  }
  return buffer;
}

function parseCsvCycles(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines.shift();
  const columns = header.split(",").map((col) => col.trim());
  const cycleIndex = columns.indexOf("cycle");
  if (cycleIndex === -1) {
    throw new Error("CSV missing 'cycle' column.");
  }
  const cycles = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length <= cycleIndex) continue;
    const value = Number(parts[cycleIndex]);
    if (Number.isFinite(value)) {
      cycles.push(value);
    }
  }
  const seen = new Set();
  const unique = [];
  for (const cycle of cycles) {
    if (seen.has(cycle)) continue;
    seen.add(cycle);
    unique.push(cycle);
  }
  return unique;
}

function openPngStream({ width, height, targetWidth, targetHeight, outputPath }) {
  const args = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${width}x${height}`,
    "-i",
    "-",
    "-frames:v",
    "1",
    "-f",
    "image2",
    "-update",
    "1",
  ];

  if (targetWidth !== width || targetHeight !== height) {
    args.push("-vf", `scale=${targetWidth}:${targetHeight}:flags=neighbor`);
  }

  args.push(outputPath);
  return spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
}

async function writePngFrame({ frame, width, height, targetWidth, targetHeight, outputPath }) {
  const ffmpeg = openPngStream({ width, height, targetWidth, targetHeight, outputPath });
  await new Promise((resolve, reject) => {
    ffmpeg.stdin.on("error", reject);
    ffmpeg.stdin.write(frame, (err) => {
      if (err) return reject(err);
      ffmpeg.stdin.end();
      return resolve();
    });
  });
  await new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    ffmpeg.on("error", reject);
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config);
  const inputPath = path.resolve(args.input);
  const csvPath = path.resolve(args.csv);
  const outputDir = path.resolve(args.output);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const settings = config.settings || {};
  if (!settings.cols || !settings.rows || !settings.cellSize) {
    throw new Error("Config settings must include cols, rows, and cellSize.");
  }

  const fd = fs.openSync(inputPath, "r");
  const { header, dataOffset } = readHeader(fd);
  const cycleSize = header.gridWidth * header.gridHeight;

  if (header.gridWidth !== settings.cols || header.gridHeight !== settings.rows) {
    throw new Error(
      `Grid mismatch: header ${header.gridWidth}x${header.gridHeight} vs settings ${settings.cols}x${settings.rows}.`
    );
  }

  const cycles = parseCsvCycles(csvPath);
  if (cycles.length === 0) {
    fs.closeSync(fd);
    console.log("No cycles found in CSV.");
    return;
  }

  const { width, height } = computeCanvasSize(settings);
  const targetWidth = Number(config.width) || width;
  const targetHeight = Number(config.height) || height;
  const colors = {
    1: hexToRgb(settings.alive1Color),
    2: hexToRgb(settings.alive2Color),
    3: hexToRgb(settings.alive10Color),
  };
  const baseFrame = buildBaseFrame(settings);

  fs.mkdirSync(outputDir, { recursive: true });
  const padLength = Math.max(6, String(header.totalCycles - 1).length);

  console.log(`Rendering ${cycles.length} unique cycles to ${outputDir}`);
  for (const cycle of cycles) {
    if (cycle < 0 || cycle >= header.totalCycles) {
      console.warn(`Skipping out-of-range cycle ${cycle}.`);
      continue;
    }
    const offset = dataOffset + cycle * cycleSize;
    const snapshot = readCycleSnapshot(fd, offset, cycleSize);
    const frame = Buffer.from(baseFrame);
    renderSnapshot({ snapshot, frame, width, settings, colors });

    const filename = `cycle_${String(cycle).padStart(padLength, "0")}.png`;
    const outputPath = path.join(outputDir, filename);
    await writePngFrame({
      frame,
      width,
      height,
      targetWidth,
      targetHeight,
      outputPath,
    });
  }

  fs.closeSync(fd);
  console.log("Render complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
